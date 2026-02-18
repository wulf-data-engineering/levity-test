use aws_sdk_dynamodb::Client;
use backend::{load_aws_config, CognitoUserPoolEvent };
use lambda_runtime::{run, service_fn, Error, LambdaEvent};
use protocol_macro::protocols;

#[protocols("sign_up_data")]
pub mod protocols {}

///
/// This lambda reacts on Cognito's lifecycle events.
///
/// The default version stores sign up data in the users table at post confirmation.
///
/// If you add more cases, make sure to add them to local/cognito-local-volume/config.json
/// and to infrastructure/lib/constructs/backend/identity.ts
///
async fn function_handler(
    event: LambdaEvent<CognitoUserPoolEvent>,
    repo: &backend::shared::users::UserRepo,
) -> Result<CognitoUserPoolEvent, Error> {
    let mut cognito_event = event.payload;
    match &mut cognito_event {
        CognitoUserPoolEvent::PreSignup(_pre_sign_up) => {
            // Pre-sign up validation or modification can be done here
        }
        CognitoUserPoolEvent::PostConfirmation(post_confirmation) => {
            // Write entry to the users table
            if let Ok(sign_up_data) =
                extract_sign_up_data(&post_confirmation.request.client_metadata)
            {
                verify_not_empty(&sign_up_data)?;

                let user_data = backend::shared::users::UserData {
                    username: post_confirmation
                        .request
                        .user_attributes
                        .get("sub")
                        .cloned()
                        .unwrap_or_default(),
                    email: post_confirmation
                        .request
                        .user_attributes
                        .get("email")
                        .cloned()
                        .unwrap_or_default(),
                    first_name: sign_up_data.first_name,
                    last_name: sign_up_data.last_name,
                };

                if let Err(e) = repo.insert(user_data).await {
                    println!("Failed to insert user: {:?}", e);
                    return Err(Error::from(format!("Failed to insert user: {:?}", e)));
                }
            }
        }
        CognitoUserPoolEvent::CustomMessage(_custom_message) => {
            // Set custom messages for confirm and password forgotten
            // (depending on `_custom_message.cognito_event_user_pools_header.trigger_source`)
        }
        // Check the enum `CognitoUserPoolEvent` for more lifecycle events
        _ => {}
    }

    Ok(cognito_event)
}

fn extract_sign_up_data(
    client_metadata: &std::collections::HashMap<String, String>,
) -> Result<SignUpData, Error> {
    client_metadata
        .get("sign_up_data")
        .ok_or_else(|| Error::from("Missing sign_up_data in client metadata"))
        .and_then(|json| {
            serde_json::from_str(json)
                .map_err(|e| Error::from(format!("Failed to parse sign_up_data: {}", e)))
        })
}

fn verify_not_empty(data: &SignUpData) -> Result<(), Error> {
    if data.first_name.is_empty() || data.last_name.is_empty() {
        Err(Error::from("Missing firstName or lastName in sign_up_data"))
    } else {
        Ok(())
    }
}

#[cfg(debug_assertions)]
fn get_table_name() -> String {
    std::env::var("USERS_TABLE_NAME").unwrap_or_else(|_| "users".to_string())
}

#[cfg(not(debug_assertions))]
fn get_table_name() -> String {
    std::env::var("USERS_TABLE_NAME").expect("USERS_TABLE_NAME must be set")
}

#[tokio::main]
async fn main() -> Result<(), Error> {
    let table_name = get_table_name();
    let config = load_aws_config().await;

    let client = Client::new(&config);
    let repo = backend::shared::users::UserRepo::new(client, table_name);

    run(service_fn(move |event| {
        let repo = repo.clone();
        async move { function_handler(event, &repo).await }
    }))
    .await
}

#[cfg(test)]
mod tests {
    use super::*;
    use aws_lambda_events::cognito::{
        CognitoEventUserPoolsPostConfirmation, CognitoEventUserPoolsPostConfirmationRequest,
    };
    use wiremock::matchers::{body_string_contains, method, path};
    use wiremock::{Mock, MockServer, ResponseTemplate};

    #[tokio::test]
    async fn test_post_confirmation_writes_to_dynamodb() {
        let server = MockServer::start().await;

        // Mock DynamoDB PutItem
        Mock::given(method("POST"))
            .and(path("/"))
            .and(body_string_contains("DynamoDB_20120810.PutItem"))
            .respond_with(ResponseTemplate::new(200).set_body_json(serde_json::json!({})))
            .mount(&server)
            .await;

        let shared_config = backend::shared::aws_config::load_aws_config_for_mock(&server).await;
        let client = aws_sdk_dynamodb::Client::new(&shared_config);
        let repo = backend::shared::users::UserRepo::new(client, "users".to_string());

        let sign_up_data = serde_json::json!({
            "first_name": "Test",
            "last_name": "User"
        })
        .to_string();

        let mut client_metadata = std::collections::HashMap::new();
        client_metadata.insert("sign_up_data".to_string(), sign_up_data);

        let mut user_attributes = std::collections::HashMap::new();
        user_attributes.insert("sub".to_string(), "test-sub".to_string());
        user_attributes.insert("email".to_string(), "test@example.com".to_string());

        let mut request = CognitoEventUserPoolsPostConfirmationRequest::default();
        request.user_attributes = user_attributes;
        request.client_metadata = client_metadata;

        let mut post_confirmation = CognitoEventUserPoolsPostConfirmation::default();
        post_confirmation.request = request;

        let event = LambdaEvent::new(
            CognitoUserPoolEvent::PostConfirmation(post_confirmation),
            Default::default(),
        );

        let result = function_handler(event, &repo).await;
        assert!(result.is_ok());
    }
}
