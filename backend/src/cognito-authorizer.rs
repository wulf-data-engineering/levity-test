use aws_lambda_events::apigw::{
    ApiGatewayV2CustomAuthorizerSimpleResponse, ApiGatewayV2CustomAuthorizerV2Request,
};
use backend::http::get_claims_from_token;
use lambda_runtime::{run, service_fn, Error, LambdaEvent};
use serde::{Deserialize, Serialize};
use tracing_subscriber;
use tracing;

#[derive(Serialize, Deserialize, Default)]
struct AuthorizerContext {
    pub sub: String,
    pub email: String,
    pub username: String,
}

async fn function_handler(
    event: LambdaEvent<ApiGatewayV2CustomAuthorizerV2Request>,
) -> Result<ApiGatewayV2CustomAuthorizerSimpleResponse<AuthorizerContext>, Error> {
    let headers = &event.payload.headers;

    // 1. Check Sec-WebSocket-Protocol (priority for WebSocket handshakes)
    let protocol_token = headers
        .get("sec-websocket-protocol")
        .or_else(|| headers.get("Sec-WebSocket-Protocol"))
        .and_then(|h| h.to_str().ok())
        .map(|t| t.split(',').next().unwrap_or(t).trim());

    // 2. Check Authorization header (fallback/support for HTTP or other clients)
    let auth_token = headers
        .get("authorization")
        .or_else(|| headers.get("Authorization"))
        .and_then(|h| h.to_str().ok())
        .map(|h| h.trim_start_matches("Bearer ").trim());

    let token = protocol_token.or(auth_token);

    let claims = token.and_then(|t| get_claims_from_token(t).ok());

    match claims {
        Some(c) => {
            let mut context = AuthorizerContext::default();
            if let Some(sub) = c.get("sub").and_then(|s| s.as_str()) {
                context.sub = sub.to_string();
            }
            if let Some(email) = c.get("email").and_then(|s| s.as_str()) {
                context.email = email.to_string();
            }
            if let Some(username) = c
                .get("cognito:username")
                .or_else(|| c.get("username"))
                .and_then(|s| s.as_str()) {
                context.username = username.to_string();
            }

            tracing::info!("Authorizing user: {}", context.sub);

            Ok(ApiGatewayV2CustomAuthorizerSimpleResponse::builder()
                .is_authorized(true)
                .context(context)
                .build())
        }
        None => {
            tracing::warn!("Authorization failed: Missing or invalid token");
            Ok(ApiGatewayV2CustomAuthorizerSimpleResponse::builder()
                .is_authorized(false)
                .context(AuthorizerContext::default())
                .build())
        }
    }
}

#[tokio::main]
async fn main() -> Result<(), Error> {
    tracing_subscriber::fmt::init();
    run(service_fn(function_handler)).await
}
