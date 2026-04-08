use backend::{get_ssm_parameter, get_sub, read_request, write_response, WebsocketConnections, load_aws_config};
use lambda_http::{run, service_fn, tracing, Body, Error, Request, Response};
use protocol_macro::protocols;
use aws_sdk_sqs::Client as SqsClient;
use serde::Serialize;

#[protocols("process")]
pub mod protocols {}

#[derive(Clone)]
struct AppState {
    connections: WebsocketConnections,
    sqs_client: SqsClient,
    queue_url: String,
}

#[derive(Serialize)]
struct ProcessPayload {
    topic_id: String,
    input: String,
}

#[tokio::main]
async fn main() -> Result<(), Error> {
    tracing::init_default_subscriber();

    let aws_config = load_aws_config().await;
    let connections = WebsocketConnections::new().await;
    let sqs_client = SqsClient::new(&aws_config);
    let queue_url = get_ssm_parameter(&aws_config, "/app/process-queue-url").await?;

    let state = AppState { connections, sqs_client, queue_url };

    run(service_fn(move |req| {
        let state = state.clone();
        async move { function_handler(req, state).await }
    }))
    .await
}

async fn function_handler(req: Request, state: AppState) -> Result<Response<Body>, Error> {
    let sub = get_sub(&req)?;

    let payload: ProcessRequest = read_request(&req)?;
    let input = payload.create_process.unwrap_or_default().input;

    let topic = state.connections.register(sub, "process", None, None).await?;

    let message_body = serde_json::to_string(&ProcessPayload {
        topic_id: topic.clone(),
        input,
    })?;

    state.sqs_client
        .send_message()
        .queue_url(&state.queue_url)
        .message_body(message_body)
        .send()
        .await?;

    let response = ProcessResponse { topic };

    write_response(&response, &req)
}
