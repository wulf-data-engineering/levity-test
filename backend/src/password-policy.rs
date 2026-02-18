use anyhow::{anyhow, Result};
use aws_sdk_cognitoidentityprovider::Client;
use backend::{load_aws_cognito_config, write_response};
use lambda_http::{run, service_fn, tracing, Body, Error, Request, Response};
use protocol_macro::protocols;

#[protocols("password_policy")]
pub mod protocols {}

#[derive(Clone)]
struct AppState {
    client: Client,
    user_pool_id: String,
}

///
/// This Lambda function retrieves the password policy for a specified AWS Cognito User Pool.
/// The User Pool ID is provided via the USER_POOL_ID environment variable.
/// In local development, it uses the default local user pool id if not set.
///
#[tokio::main]
async fn main() -> Result<(), Error> {
    tracing::init_default_subscriber();

    let shared_cfg = load_aws_cognito_config().await;

    let client = Client::new(&shared_cfg);

    let user_pool_id = std::env::var("USER_POOL_ID")
        .ok()
        .or_else(default_user_pool_id)
        .ok_or_else(|| anyhow::anyhow!("USER_POOL_ID env var is required"))?;

    let state = AppState {
        client,
        user_pool_id,
    };

    // Pass state into the handler via a cloning closure
    run(service_fn(move |req| {
        let state = state.clone();
        async move { password_policy_handler(req, state).await }
    }))
    .await
}

async fn password_policy_handler(req: Request, state: AppState) -> Result<Response<Body>, Error> {
    let policy = get_password_policy(&state).await?;
    write_response(&policy, &req)
}

async fn get_password_policy(state: &AppState) -> Result<PasswordPolicy> {
    let resp = state
        .client
        .describe_user_pool()
        .user_pool_id(&state.user_pool_id)
        .send()
        .await?;

    let up = resp
        .user_pool()
        .ok_or_else(|| anyhow!("DescribeUserPool: missing user_pool"))?;

    let policies = up
        .policies()
        .ok_or_else(|| anyhow!("DescribeUserPool: missing policies"))?;

    let p = policies
        .password_policy()
        .ok_or_else(|| anyhow!("DescribeUserPool: missing password_policy"))?;

    Ok(PasswordPolicy {
        minimum_length: p.minimum_length().unwrap_or(6),
        require_uppercase: p.require_uppercase,
        require_lowercase: p.require_lowercase,
        require_numbers: p.require_numbers,
        require_symbols: p.require_symbols,
    })
}

#[cfg(debug_assertions)]
fn default_user_pool_id() -> Option<String> {
    Some("local_userPool".into())
}

#[cfg(not(debug_assertions))]
fn default_user_pool_id() -> Option<String> {
    None
}

#[cfg(test)]
mod tests {
    use super::*;
    use wiremock::matchers::header;

    #[tokio::test]
    async fn retrieve_password_policy() {
        use wiremock::matchers::{method, path};
        use wiremock::{Mock, MockServer, ResponseTemplate};
        let server = MockServer::start().await;

        Mock::given(method("POST"))
            .and(path("/"))
            .and(header(
                "x-amz-target",
                "AWSCognitoIdentityProviderService.DescribeUserPool",
            ))
            .respond_with(ResponseTemplate::new(200).set_body_raw(
                r#"{
                    "UserPool": {
                        "Id": "test-pool",
                        "Name": "TestPool",
                        "Policies": {
                            "PasswordPolicy": {
                                "MinimumLength": 9,
                                "RequireUppercase": false,
                                "RequireLowercase": true,
                                "RequireNumbers": false,
                                "RequireSymbols": true,
                                "TemporaryPasswordValidityDays": 7
                            }
                        }
                    }
                }"#,
                "application/json",
            ))
            .mount(&server)
            .await;

        let shared_config = backend::load_aws_config_for_mock(&server).await;
        let client = aws_sdk_cognitoidentityprovider::Client::new(&shared_config);
        let app_state = AppState {
            client,
            user_pool_id: "test-pool".to_string(),
        };

        let result = get_password_policy(&app_state).await.unwrap();
        assert_eq!(result.minimum_length, 9);
        assert_eq!(result.require_uppercase, false);
        assert_eq!(result.require_lowercase, true);
        assert_eq!(result.require_numbers, false);
        assert_eq!(result.require_symbols, true);
    }

    #[tokio::test]
    async fn retrieve_empty_password_policy() {
        use wiremock::matchers::{header, method, path};
        use wiremock::{Mock, MockServer, ResponseTemplate};
        let server = MockServer::start().await;

        Mock::given(method("POST"))
            .and(path("/"))
            .and(header(
                "x-amz-target",
                "AWSCognitoIdentityProviderService.DescribeUserPool",
            ))
            .respond_with(ResponseTemplate::new(200).set_body_raw(
                r#"{
                    "UserPool": {
                        "Id": "test-pool",
                        "Name": "TestPool",
                        "Policies": {
                            "PasswordPolicy": {
                            }
                        }
                    }
                }"#,
                "application/json",
            ))
            .mount(&server)
            .await;

        let shared_config = backend::load_aws_config_for_mock(&server).await;
        let client = aws_sdk_cognitoidentityprovider::Client::new(&shared_config);
        let app_state = AppState {
            client,
            user_pool_id: "test-pool".to_string(),
        };

        let result = get_password_policy(&app_state).await.unwrap();
        assert_eq!(result.minimum_length, 6);
        assert_eq!(result.require_uppercase, false);
        assert_eq!(result.require_lowercase, false);
        assert_eq!(result.require_numbers, false);
        assert_eq!(result.require_symbols, false);
    }
}
