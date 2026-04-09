use lambda_runtime::{run, service_fn, tracing, Error, LambdaEvent};
use serde::Deserialize;
use std::collections::{HashMap, HashSet};
use once_cell::sync::Lazy;
use anyhow::anyhow;
#[cfg(any(debug_assertions, test))]
use backend::get_sub_from_authorization;

static TOPIC_WHITELIST: Lazy<HashSet<&'static str>> = Lazy::new(|| {
    let mut m = HashSet::new();
    m.insert("updates");
    m
});

#[derive(Deserialize, Debug)]
#[serde(rename_all = "camelCase")]
struct Authorizer {
    #[serde(default)]
    claims: HashMap<String, String>,
    #[serde(flatten)]
    fields: HashMap<String, String>,
}

#[derive(Deserialize, Debug)]
#[serde(rename_all = "camelCase")]
struct WebsocketRequestContext {
    connection_id: String,
    route_key: String,
    authorizer: Option<Authorizer>,
}

#[derive(Deserialize, Debug)]
#[serde(rename_all = "camelCase")]
struct WebsocketEvent {
    request_context: WebsocketRequestContext,
    #[serde(default)]
    query_string_parameters: HashMap<String, String>,
    #[serde(default)]
    headers: HashMap<String, String>,
}


/// Get authorizer claims (for production)
#[cfg(not(any(debug_assertions, test)))]
pub fn get_sub(event: &WebsocketEvent) -> Result<String, Error> {
    event.request_context.authorizer.as_ref()
        .and_then(|auth| auth.claims.get("sub").or_else(|| auth.fields.get("sub")).cloned())
        .ok_or_else(|| anyhow!("Missing sub in claims").into())
}

/// Get sub from Authorization header (in debug with localstack).
#[cfg(any(debug_assertions, test))]
fn get_sub(event: &WebsocketEvent) -> Result<String, Error> {
    // Priority 1: Request context (Lambda Authorizer)
    if let Some(auth) = &event.request_context.authorizer {
        if let Some(sub) = auth.claims.get("sub").or_else(|| auth.fields.get("sub")) {
            return Ok(sub.clone());
        }
    }

    // Priority 2: Authorization header
    event.headers.get("Authorization")
        .and_then(|h| get_sub_from_authorization(h).ok())
        .ok_or_else(|| anyhow!("Missing sub in claims").into())
}

async fn function_handler(event: LambdaEvent<WebsocketEvent>) -> Result<(), Error> {
    let connections: backend::websockets::WebsocketConnections = backend::websockets::WebsocketConnections::new().await;
    let route_key = &event.payload.request_context.route_key;
    let connection_id = &event.payload.request_context.connection_id;

    tracing::info!("WebSocket event: {} for connection: {}", route_key, connection_id);

    match route_key.as_str() {
        "$connect" => {
            if let Some(topic_id) = event.payload.query_string_parameters.get("topicId") {
                if TOPIC_WHITELIST.contains(topic_id.as_str()) {
                    let user_id = get_sub(&event.payload)?;
                    tracing::info!("Whitelisted topic connection: {} for user: {}", topic_id, user_id);
                    connections.upsert_connection_id(user_id, topic_id.clone(), connection_id.clone()).await?;
                } else {
                    tracing::info!("Connecting to topic: {}", topic_id);
                    if let Err(e) = connections.set_connection_id(topic_id.clone(), connection_id.clone()).await {
                        tracing::warn!("Failed to link connection: {:?}", e);
                        return Err(e);
                    }
                }
            }
        }
        "$disconnect" => {
            if let Some(topic_id) = event.payload.query_string_parameters.get("topicId") {
                if TOPIC_WHITELIST.contains(topic_id.as_str()) {
                    if let Ok(user_id) = get_sub(&event.payload) {
                        tracing::info!("Whitelisted topic disconnect: {} for user: {}", topic_id, user_id);
                        connections.clear_value_explicit(user_id, topic_id.clone()).await?;
                    }
                } else {
                    tracing::info!("Disconnected: {connection_id}, clearing topic {topic_id}");
                    if let Err(e) = connections.clear_value(topic_id.clone()).await {
                        tracing::warn!("Failed to clear value: {:?}", e);
                    }
                }
            }
        }
        _ => {
            tracing::info!("Other route key: {}", route_key);
        }
    }

    Ok(())
}

#[tokio::main]
async fn main() -> Result<(), Error> {
    tracing_subscriber::fmt::init();
    run(service_fn(function_handler)).await
}
