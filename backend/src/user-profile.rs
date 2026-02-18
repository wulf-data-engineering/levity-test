use anyhow::{anyhow, Result};
use aws_sdk_dynamodb::Client;
use backend::{load_aws_config, write_response};
use lambda_http::{run, service_fn, tracing, Body, Error, Request, Response};
use protocol_macro::protocols;

#[protocols("user_profile")]
pub mod protocols {}

#[derive(Clone)]
struct AppState {
    repo: backend::shared::users::UserRepo,
}

#[tokio::main]
async fn main() -> Result<(), Error> {
    tracing::init_default_subscriber();

    let table_name = get_table_name();
    let config = load_aws_config().await;

    let client = Client::new(&config);
    let repo = backend::shared::users::UserRepo::new(client, table_name);

    let state = AppState { repo };

    ensure_test_user_profile(&state).await?;

    run(service_fn(move |req| {
        let state = state.clone();
        async move { function_handler(req, state).await }
    }))
        .await
}

async fn function_handler(req: Request, state: AppState) -> Result<Response<Body>, Error> {
    let sub = get_sub(&req)?;

    let user = state
        .repo
        .read(&sub)
        .await
        .map_err(|e| anyhow!("Failed to read user: {:?}", e))?
        .ok_or_else(|| anyhow!("User not found"))?;

    let profile = UserProfile {
        first_name: user.data.first_name,
        last_name: user.data.last_name,
    };

    write_response(&profile, &req)
}

#[cfg(not(any(debug_assertions, test)))]
fn get_sub(req: &Request) -> Result<String, Error> {
    use lambda_http::RequestExt;
    let request_context = req.request_context();
    request_context
        .authorizer()
        .and_then(|auth| {
            auth.jwt
                .as_ref()
                .and_then(|jwt| jwt.claims.get("sub").cloned())
        })
        .ok_or_else(|| anyhow!("Missing sub in claims").into())
}

// Locally there is no API Gateway authorizer, need to parse the header
#[cfg(any(debug_assertions, test))]
fn get_sub(req: &Request) -> Result<String, Error> {
    req.headers()
        .get("Authorization")
        .and_then(|h| h.to_str().ok())
        .and_then(|h| h.strip_prefix("Bearer "))
        .and_then(|token| {
            let parts: Vec<&str> = token.split('.').collect();
            if parts.len() == 3 {
                use base64::{engine::general_purpose, Engine as _};
                let payload = parts[1];
                // Add padding if needed
                let len = payload.len();
                let padded = if !len.is_multiple_of(4) {
                    let pad_len = 4 - (len % 4);
                    format!("{}{}", payload, "=".repeat(pad_len))
                } else {
                    payload.to_string()
                };

                if let Ok(decoded) = general_purpose::URL_SAFE.decode(padded) {
                    if let Ok(json) = serde_json::from_slice::<serde_json::Value>(&decoded) {
                        return json
                            .get("sub")
                            .and_then(|s| s.as_str())
                            .map(|s| s.to_string());
                    }
                }
            }
            None
        })
        .ok_or_else(|| anyhow!("Missing sub in claims").into())
}

#[cfg(any(debug_assertions, test))]
fn get_table_name() -> String {
    std::env::var("USERS_TABLE_NAME").unwrap_or_else(|_| "users".to_string())
}

#[cfg(not(any(debug_assertions, test)))]
fn get_table_name() -> String {
    std::env::var("USERS_TABLE_NAME").expect("USERS_TABLE_NAME must be set")
}

#[cfg(any(debug_assertions, test))]
async fn ensure_test_user_profile(state: &AppState) -> Result<(), Error> {
    let email = "test@wulf.technology";
    let sub = "00000000-0000-0000-0000-000000000000";

    if let Ok(Some(_)) = state.repo.read(sub).await {
        return Ok(());
    }

    let user_data = backend::shared::users::UserData {
        username: sub.to_string(),
        email: email.to_string(),
        first_name: "Test".to_string(),
        last_name: "User".to_string(),
    };

    if let Err(e) = state.repo.insert(user_data).await {
        println!("Failed to insert test user: {:?}", e);
    }

    Ok(())
}

#[cfg(not(any(debug_assertions, test)))]
async fn ensure_test_user_profile(_state: &AppState) -> Result<(), Error> {
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use base64::Engine;
    use lambda_http::aws_lambda_events::apigw::ApiGatewayV2httpRequestContext;
    use lambda_http::request::RequestContext;
    use wiremock::matchers::{header, method, path};
    use wiremock::{Mock, MockServer, ResponseTemplate};

    #[tokio::test]
    async fn test_read_user_profile() {
        let server = MockServer::start().await;

        // Mock DynamoDB GetItem
        Mock::given(method("POST"))
            .and(path("/"))
            .and(header("x-amz-target", "DynamoDB_20120810.GetItem"))
            .respond_with(ResponseTemplate::new(200).set_body_json(serde_json::json!({
                "Item": {
                    "pk": {"S": "test-sub"},
                    "username": {"S": "test-sub"},
                    "email": {"S": "test@example.com"},
                    "first_name": {"S": "Test"},
                    "last_name": {"S": "User"},
                    "data_version": {"N": "1"},
                    "last_write": {"N": "1234567890"}
                }
            })))
            .mount(&server)
            .await;

        let shared_config = backend::shared::aws_config::load_aws_config_for_mock(&server).await;
        let client = aws_sdk_dynamodb::Client::new(&shared_config);
        let repo = backend::shared::users::UserRepo::new(client, "users".to_string());
        let state = AppState { repo };

        // Create a dummy JWT
        let payload = serde_json::json!({
            "sub": "test-sub"
        })
            .to_string();
        let encoded_payload = base64::engine::general_purpose::URL_SAFE.encode(payload);
        let token = format!("header.{}.signature", encoded_payload);

        let mut request = lambda_http::http::Request::builder()
            .header("Authorization", format!("Bearer {}", token))
            .body(Body::Empty)
            .unwrap();

        // Add dummy RequestContext
        let context = RequestContext::ApiGatewayV2(ApiGatewayV2httpRequestContext::default());
        request.extensions_mut().insert(context);

        let response = function_handler(request, state).await.unwrap();
        assert_eq!(response.status(), 200);

        // Verify response body
        let body_bytes = response.body().to_vec();
        let body_str = String::from_utf8(body_bytes).unwrap();
        assert!(!body_str.is_empty());
    }
}
