use axum::{
    extract::{
        ws::{Message, WebSocket, WebSocketUpgrade},
        Path, State,
    },
    http::StatusCode,
    response::IntoResponse,
    routing::{get, post},
    Router,
};
use futures_util::{sink::SinkExt, stream::StreamExt};
use serde::Serialize;
use std::{collections::HashMap, sync::Arc};
use tokio::sync::{mpsc, RwLock};
use uuid::Uuid;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct Authorizer {
    #[serde(flatten)]
    fields: HashMap<String, String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct WebsocketRequestContext {
    connection_id: String,
    event_type: String, // CONNECT, MESSAGE, DISCONNECT
    route_key: String,  // $connect, $default, $disconnect
    domain_name: String,
    stage: String,
    api_id: String,
    query_string_parameters: HashMap<String, String>,
    authorizer: Option<Authorizer>,
}

type ConnectionRegistry = Arc<RwLock<HashMap<String, mpsc::UnboundedSender<Message>>>>;

#[derive(Clone)]
struct AppState {
    connections: ConnectionRegistry,
    http_client: reqwest::Client,
}

#[tokio::main]
async fn main() {
    tracing_subscriber::fmt::init();

    let state = AppState {
        connections: Arc::new(RwLock::new(HashMap::new())),
        http_client: reqwest::Client::new(),
    };

    let app = Router::new()
        .route("/:lambda", get(ws_handler))
        .route("/@connections/:id", post(management_handler).delete(management_delete_handler))
        .layer(axum::middleware::from_fn(request_logger))
        .fallback(fallback_handler)
        .with_state(state);

    let listener = tokio::net::TcpListener::bind("0.0.0.0:3001").await.unwrap();
    println!("WebSocket mock server listening on ws://localhost:3001/:lambda");
    println!("Management API listening on POST http://localhost:3001/@connections/:id");
    axum::serve(listener, app).await.unwrap();
}

async fn request_logger(
    req: axum::http::Request<axum::body::Body>,
    next: axum::middleware::Next,
) -> impl IntoResponse {
    println!("Incoming Request: {:?} {:?}", req.method(), req.uri());
    next.run(req).await
}

async fn fallback_handler(req: axum::http::Request<axum::body::Body>) -> impl IntoResponse {
    let method = req.method().clone();
    let uri = req.uri().clone();
    eprintln!("UNMATCHED ROUTE: {:?} {:?}", method, uri);
    (StatusCode::NOT_FOUND, format!("No route for {} {}", method, uri))
}

async fn ws_handler(
    ws: WebSocketUpgrade,
    Path(lambda): Path<String>,
    axum::extract::Query(params): axum::extract::Query<HashMap<String, String>>,
    State(state): State<AppState>,
    headers: axum::http::HeaderMap,
) -> impl IntoResponse {
    // Extract token from Sec-WebSocket-Protocol if present
    let protocol = headers
        .get("sec-websocket-protocol")
        .or_else(|| headers.get("Sec-WebSocket-Protocol"))
        .and_then(|h| h.to_str().ok().map(|s| s.to_string()));

    let mut ws = ws;
    if let Some(p) = &protocol {
        // Echo back the requested protocol so the browser accepts the connection
        ws = ws.protocols([p.clone()]);
    }

    ws.on_upgrade(move |socket| handle_socket(socket, lambda, params, state, protocol))
}

async fn handle_socket(
    socket: WebSocket,
    lambda: String,
    params: HashMap<String, String>,
    state: AppState,
    protocol: Option<String>,
) {
    let (mut sink, mut stream) = socket.split();
    let connection_id = Uuid::new_v4().to_string();
    let (tx, mut rx) = mpsc::unbounded_channel();

    // Register connection
    state.connections.write().await.insert(connection_id.clone(), tx);

    println!("New connection: {} for lambda: {}", connection_id, lambda);

    // 1. $connect event
    if let Err(e) = forward_event(
        &state,
        &lambda,
        &connection_id,
        "CONNECT",
        "$connect",
        params.clone(),
        None,
        protocol.clone(),
    )
    .await
    {
        eprintln!("Failed to forward $connect: {}", e);
        return;
    }

    // Task to pipe messages from the channel to the websocket sink
    let mut send_task = tokio::spawn(async move {
        while let Some(message) = rx.recv().await {
            if sink.send(message).await.is_err() {
                break;
            }
        }
    });

    // Task to pipe messages from the websocket stream to the Lambda
    let conn_id_clone = connection_id.clone();
    let lambda_clone = lambda.clone();
    let state_clone = state.clone();
    let params_clone = params.clone();
    let protocol_clone = protocol.clone();

    let mut recv_task = tokio::spawn(async move {
        while let Some(Ok(message)) = stream.next().await {
            match message {
                Message::Text(text) => {
                    if let Err(e) = forward_event(
                        &state_clone,
                        &lambda_clone,
                        &conn_id_clone,
                        "MESSAGE",
                        "$default",
                        params_clone.clone(),
                        Some(text),
                        protocol_clone.clone(),
                    )
                    .await
                    {
                        eprintln!("Failed to forward message: {}", e);
                    }
                }
                Message::Close(_) => break,
                _ => (),
            }
        }
    });

    // Wait for either task to finish
    tokio::select! {
        _ = (&mut send_task) => recv_task.abort(),
        _ = (&mut recv_task) => send_task.abort(),
    };

    // Clean up
    state.connections.write().await.remove(&connection_id);
    println!("Connection closed: {}", connection_id);

    // 3. $disconnect event
    if let Err(e) = forward_event(
        &state,
        &lambda,
        &connection_id,
        "DISCONNECT",
        "$disconnect",
        params,
        None,
        protocol,
    )
    .await
    {
        eprintln!("Failed to forward $disconnect: {}", e);
    }
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct WebsocketEvent {
    request_context: WebsocketRequestContext,
    query_string_parameters: HashMap<String, String>,
    #[serde(default)]
    headers: HashMap<String, String>,
    body: Option<String>,
    is_base_64_encoded: bool,
}

async fn forward_event(
    state: &AppState,
    lambda: &str,
    connection_id: &str,
    event_type: &str,
    route_key: &str,
    params: HashMap<String, String>,
    body: Option<String>,
    protocol: Option<String>,
) -> anyhow::Result<()> {
    let url = format!(
        "http://localhost:9000/2015-03-31/functions/{}/invocations",
        lambda
    );

    let mut headers = HashMap::new();
    let mut authorizer = None;

    // Use Sec-WebSocket-Protocol (or fallback to query param)
    let token = protocol
        .as_ref()
        .and_then(|p| p.split(',').next().map(|s| s.trim().to_string()))
        .or_else(|| params.get("token").cloned());

    if let Some(token) = token {
        headers.insert("Authorization".to_string(), format!("Bearer {}", token));
        headers.insert("Sec-WebSocket-Protocol".to_string(), token.clone());

        // Extract sub, email, username to simulate Lambda Authorizer output
        if let Ok(claims) = get_claims_from_token(&token) {
            let mut fields = HashMap::new();
            if let Some(sub) = claims.get("sub").and_then(|s| s.as_str()) {
                fields.insert("sub".to_string(), sub.to_string());
            }
            if let Some(email) = claims.get("email").and_then(|s| s.as_str()) {
                fields.insert("email".to_string(), email.to_string());
            }
            if let Some(username) = claims
                .get("cognito:username")
                .or_else(|| claims.get("username"))
                .and_then(|s| s.as_str())
            {
                fields.insert("username".to_string(), username.to_string());
            }
            authorizer = Some(Authorizer { fields });
        }
    }

    let event = WebsocketEvent {
        request_context: WebsocketRequestContext {
            connection_id: connection_id.to_string(),
            event_type: event_type.to_string(),
            route_key: route_key.to_string(),
            domain_name: "localhost".to_string(),
            stage: "prod".to_string(),
            api_id: "mock".to_string(),
            query_string_parameters: params.clone(),
            authorizer,
        },
        query_string_parameters: params,
        headers,
        body,
        is_base_64_encoded: false,
    };

    let res = state.http_client.post(url).json(&event).send().await?;

    if !res.status().is_success() {
        let text = res.text().await?;
        return Err(anyhow::anyhow!("Lambda error: {}", text));
    }

    Ok(())
}

fn get_claims_from_token(token: &str) -> anyhow::Result<serde_json::Value> {
    let parts: Vec<&str> = token.split('.').collect();
    if parts.len() != 3 {
        return Err(anyhow::anyhow!("Invalid token format"));
    }

    use base64::{engine::general_purpose, Engine as _};
    let payload = parts[1];
    let len = payload.len();
    let padded = if len % 4 != 0 {
        let pad_len = 4 - (len % 4);
        format!("{}{}", payload, "=".repeat(pad_len))
    } else {
        payload.to_string()
    };

    let decoded = general_purpose::URL_SAFE
        .decode(padded)
        .map_err(|e| anyhow::anyhow!("Failed to decode base64: {}", e))?;

    let json = serde_json::from_slice::<serde_json::Value>(&decoded)
        .map_err(|e| anyhow::anyhow!("Failed to parse JSON: {}", e))?;

    Ok(json)
}

async fn management_handler(
    Path(id): Path<String>,
    State(state): State<AppState>,
    body: axum::body::Bytes,
) -> impl IntoResponse {
    use base64::{engine::general_purpose, Engine as _};

    println!("Management API: POST /@connections/{}", id);

    let registry = state.connections.read().await;
    if let Some(tx) = registry.get(&id) {
        // Try to decode as base64 if it's a valid UTF-8 string that looks like base64
        let decoded_body = if let Ok(body_str) = String::from_utf8(body.to_vec()) {
            general_purpose::STANDARD
                .decode(body_str.trim())
                .unwrap_or_else(|_| body.to_vec())
        } else {
            body.to_vec()
        };

        let msg = if let Ok(text) = String::from_utf8(decoded_body.clone()) {
            Message::Text(text)
        } else {
            Message::Binary(decoded_body)
        };

        if tx.send(msg).is_ok() {
            println!("Management API: Sent message to {}", id);
            StatusCode::OK
        } else {
            eprintln!("Management API: Failed to send message to {}", id);
            StatusCode::INTERNAL_SERVER_ERROR
        }
    } else {
        eprintln!("Management API: Connection {} not found (410 Gone)", id);
        StatusCode::GONE
    }
}

async fn management_delete_handler(
    Path(id): Path<String>,
    State(state): State<AppState>,
) -> impl IntoResponse {
    println!("Management API: DELETE /@connections/{}", id);

    let registry = state.connections.read().await;
    if let Some(tx) = registry.get(&id) {
        if tx.send(Message::Close(None)).is_ok() {
            println!("Management API: Closed connection {}", id);
            StatusCode::OK
        } else {
            eprintln!("Management API: Failed to close connection {}", id);
            StatusCode::INTERNAL_SERVER_ERROR
        }
    } else {
        eprintln!("Management API: Connection {} not found (410 Gone)", id);
        StatusCode::GONE
    }
}
