use aws_lambda_events::event::sqs::SqsEvent;
use lambda_runtime::{run, service_fn, tracing, Error, LambdaEvent};
use aws_sdk_apigatewaymanagement::Client as ApiGatewayClient;
use serde::Deserialize;
use backend::{load_aws_config, WebsocketConnections};
#[cfg(not(debug_assertions))]
use std::env;
use std::time::Duration;
use tokio::time::sleep;
use rand::Rng;

#[derive(Deserialize)]
struct ProcessPayload {
    topic_id: String,
    input: String,
}

#[derive(Clone)]
struct AppState {
    connections: WebsocketConnections,
    apigw_client: ApiGatewayClient,
}

#[tokio::main]
async fn main() -> Result<(), Error> {
    tracing_subscriber::fmt::init();

    let connections = WebsocketConnections::new().await;
    let aws_config = load_aws_config().await;
    
    #[cfg(debug_assertions)]
    let endpoint_url = "http://localhost:3001".to_string();
    #[cfg(not(debug_assertions))]
    let endpoint_url = env::var("WEBSOCKET_API_URL").expect("WEBSOCKET_API_URL must be set");

    // Reconfigure the AWS config to overriding the API endpoint
    let apigw_config = aws_config.into_builder().endpoint_url(endpoint_url).build();
    let apigw_client = ApiGatewayClient::new(&apigw_config);

    let state = AppState {
        connections,
        apigw_client,
    };

    run(service_fn(move |event| {
        let state = state.clone();
        async move { function_handler(event, state).await }
    }))
    .await
}

async fn function_handler(event: LambdaEvent<SqsEvent>, state: AppState) -> Result<(), Error> {
    
    let mut tasks = Vec::new();

    for record in event.payload.records {
        if let Some(body) = record.body {
            if let Ok(payload) = serde_json::from_str::<ProcessPayload>(&body) {
                tracing::info!("Processing topic: {}", payload.topic_id);
                let state_clone = state.clone();
                tasks.push(tokio::spawn(async move {
                    process_item(&payload, &state_clone).await;
                }));
            } else {
                tracing::error!("Failed to parse SQS body: {}", body);
            }
        }
    }

    for task in tasks {
        let _ = task.await;
    }
    Ok(())
}

async fn process_item(payload: &ProcessPayload, state: &AppState) {
    
    for n in 1..=10 {
        let wait_ms = rand::thread_rng().gen_range(20..=200);
        sleep(Duration::from_millis(wait_ms)).await;

        let message = format!("Processing {} {}/10...", payload.input.len(), n);
        
        match state.connections.get_connection_id(&payload.topic_id).await {
            Ok(Some(connection_id)) => {
                if let Err(e) = WebsocketConnections::send_message(&state.apigw_client, &connection_id, &message).await {
                    tracing::warn!("Failed to send process update: {:?}", e);
                }
            }
            Ok(None) => tracing::debug!("No connection found for topic {}", payload.topic_id),
            Err(e) => tracing::error!("Error getting connection for topic {}: {:?}", payload.topic_id, e),
        }
    }

    if let Ok(Some(connection_id)) = state.connections.get_connection_id(&payload.topic_id).await {
        if let Err(e) = WebsocketConnections::delete_connection(&state.apigw_client, &connection_id).await {
            tracing::warn!("Failed to close connection: {}", e);
        }
    }
    tracing::info!("Finished processing item: {}", payload.topic_id);
}
