use anyhow::anyhow;
use crate::{get_ssm_parameter, load_aws_config};
use aws_sdk_dynamodb::{types::AttributeValue, Client};
use chrono::Utc;
use lambda_http::Error;
use uuid::Uuid;

const DEFAULT_TTL_SECONDS: u64 = 900;

/// Manages the registration and storage of websocket connection topics.
///
/// Topics are stored in a DynamoDB table with a TTL to allow for session-based
/// websocket connections. Each entry maps a user ID and a topic string (unique for the user).
#[derive(Clone)]
pub struct WebsocketConnections {
    db: Client,
    table_name: String,
}

impl WebsocketConnections {

    /// Creates a new instance of WebsocketConnections.
    ///
    /// Loads the DynamoDB table name from SSM parameter `/app/websocket-connections-table-name`
    /// and initializes the AWS SDK client.
    pub async fn new() -> Self {
        let config = load_aws_config().await;
        
        let table_name = get_ssm_parameter(&config, "/app/websocket-connections-table-name")
            .await
            .expect("Failed to get SSM parameter for websocket-connections-table-name");

        let db = Client::new(&config);

        Self { db, table_name }
    }


    /// Registers a new websocket connection topic for a user.
    ///
    /// # Arguments
    /// * `user_id` - The unique identifier of the user (e.g., Cognito sub).
    /// * `topic` - A prefix for the topic id (e.g., "process").
    /// * `id` - An optional specific ID to use as the topic suffix. If `None`,
    ///          it generates a 16-character hex suffix from the most significant
    ///          64 bits of a UUID v4.
    /// * `ttl_duration` - Optional duration for the entry TTL. Defaults to 15 minutes.
    ///
    /// # Returns
    /// The full topic id in the format `{topic}-{id}`.
    pub async fn register(
        &self,
        user_id: String,
        topic: &str,
        id: Option<String>,
        ttl_duration: Option<std::time::Duration>,
    ) -> Result<String, Error> {
        let id = id.unwrap_or_else(|| {
            let id = Uuid::new_v4();
            let (msb, _) = id.as_u64_pair();
            format!("{:016x}", msb)
        });
        let topic_id = format!("{topic}-{id}");

        let now = Utc::now().timestamp();
        let ttl_seconds = ttl_duration.map(|d| d.as_secs()).unwrap_or(DEFAULT_TTL_SECONDS);
        let ttl = now + ttl_seconds as i64;

        self.db
            .put_item()
            .table_name(&self.table_name)
            .item("userId", AttributeValue::S(user_id))
            .item("topicId", AttributeValue::S(topic_id.clone()))
            .item("value", AttributeValue::S("".to_string()))
            .item("ttl", AttributeValue::N(ttl.to_string()))
            .send()
            .await
            .map_err(|e| anyhow!("Failed to register websocket connection: {:?}", e))?;

        Ok(topic_id)
    }

    /// Sets the connectionId for a given topicId.
    ///
    /// This uses the 'topic-index' GSI to find the correct entry (since topicId is unique)
    /// and then updates the main item with the connectionId.
    pub async fn set_connection_id(&self, topic_id: String, connection_id: String) -> Result<(), Error> {
        let items = self.db
            .query()
            .table_name(&self.table_name)
            .index_name("topic-index")
            .key_condition_expression("topicId = :t")
            .expression_attribute_values(":t", AttributeValue::S(topic_id.clone()))
            .send()
            .await
            .map_err(|e| anyhow!("Failed to query topic: {:?}", e))?;

        if let Some(item) = items.items().first() {
            let user_id = item.get("userId").ok_or_else(|| anyhow!("Missing userId"))?.as_s().map_err(|_| anyhow!("userId not a string"))?;

            self.db
                .update_item()
                .table_name(&self.table_name)
                .key("userId", AttributeValue::S(user_id.to_string()))
                .key("topicId", AttributeValue::S(topic_id))
                .update_expression("SET connectionId = :c")
                .expression_attribute_values(":c", AttributeValue::S(connection_id))
                .send()
                .await
                .map_err(|e| anyhow!("Failed to update connectionId: {:?}", e))?;

            Ok(())
        } else {
            Err(anyhow!("Topic {} not found", topic_id).into())
        }
    }

    /// Directly upserts the connectionId for a given userId and topicId.
    /// This bypasses the topic-index GSI check and is useful for whitelisted topics
    /// that are not pre-registered.
    pub async fn upsert_connection_id(
        &self,
        user_id: String,
        topic_id: String,
        connection_id: String,
    ) -> Result<(), Error> {
        let now = Utc::now().timestamp();
        let ttl_seconds = DEFAULT_TTL_SECONDS;
        let ttl = now + ttl_seconds as i64;

        self.db
            .put_item()
            .table_name(&self.table_name)
            .item("userId", AttributeValue::S(user_id))
            .item("topicId", AttributeValue::S(topic_id))
            .item("connectionId", AttributeValue::S(connection_id))
            .item("value", AttributeValue::S("".to_string()))
            .item("ttl", AttributeValue::N(ttl.to_string()))
            .send()
            .await
            .map_err(|e| anyhow!("Failed to upsert connectionId: {:?}", e))?;

        Ok(())
    }

    /// Clears the value for a given topicId by setting it to an empty string.
    pub async fn clear_value(&self, topic_id: String) -> Result<(), Error> {
        let items = self.db
            .query()
            .table_name(&self.table_name)
            .index_name("topic-index")
            .key_condition_expression("topicId = :t")
            .expression_attribute_values(":t", AttributeValue::S(topic_id.clone()))
            .send()
            .await
            .map_err(|e| anyhow!("Failed to query topic: {:?}", e))?;

        if let Some(item) = items.items().first() {
            let user_id = item.get("userId").ok_or_else(|| anyhow!("Missing userId"))?.as_s().map_err(|_| anyhow!("userId not a string"))?;

            self.db
                .update_item()
                .table_name(&self.table_name)
                .key("userId", AttributeValue::S(user_id.to_string()))
                .key("topicId", AttributeValue::S(topic_id))
                .update_expression("SET #v = :empty")
                .expression_attribute_names("#v", "value".to_string())
                .expression_attribute_values(":empty", AttributeValue::S("".to_string()))
                .send()
                .await
                .map_err(|e| anyhow!("Failed to clear value: {:?}", e))?;

            Ok(())
        } else {
            Err(anyhow!("Topic {} not found", topic_id).into())
        }
    }

    pub async fn clear_value_explicit(&self, user_id: String, topic_id: String) -> Result<(), Error> {
        self.db
            .update_item()
            .table_name(&self.table_name)
            .key("userId", AttributeValue::S(user_id))
            .key("topicId", AttributeValue::S(topic_id))
            .update_expression("SET #v = :empty")
            .expression_attribute_names("#v", "value".to_string())
            .expression_attribute_values(":empty", AttributeValue::S("".to_string()))
            .send()
            .await
            .map_err(|e| anyhow!("Failed to clear value explicitly: {:?}", e))?;

        Ok(())
    }

    /// Looks up the connectionId for a given topicId via the topic-index GSI.
    pub async fn get_connection_id(&self, topic_id: &str) -> Result<Option<String>, Error> {
        let items = self.db
            .query()
            .table_name(&self.table_name)
            .index_name("topic-index")
            .key_condition_expression("topicId = :t")
            .expression_attribute_values(":t", AttributeValue::S(topic_id.to_string()))
            .send()
            .await
            .map_err(|e| anyhow!("Failed to query topic: {:?}", e))?;

        if let Some(item) = items.items().first() {
            let conn_id = item
                .get("connectionId")
                .and_then(|v| v.as_s().ok())
                .map(|s| s.to_string());
            Ok(conn_id)
        } else {
            Ok(None)
        }
    }

    /// Sends a text message to a WebSocket connection via API Gateway Management API.
    pub async fn send_message(
        api_client: &aws_sdk_apigatewaymanagement::Client,
        connection_id: &str,
        data: &str,
    ) -> Result<(), Error> {
        let result = api_client
            .post_to_connection()
            .connection_id(connection_id)
            .data(aws_sdk_apigatewaymanagement::primitives::Blob::new(data.as_bytes()))
            .send()
            .await;

        if let Err(e) = result {
            if format!("{:?}", e).contains("GoneException") {
                return Ok(());
            }
            return Err(anyhow!("Failed to send message to connection {}: {:?}", connection_id, e).into());
        }

        Ok(())
    }

    /// Deletes / closes a WebSocket connection via API Gateway Management API.
    pub async fn delete_connection(
        api_client: &aws_sdk_apigatewaymanagement::Client,
        connection_id: &str,
    ) -> Result<(), Error> {
        let result = api_client
            .delete_connection()
            .connection_id(connection_id)
            .send()
            .await;

        if let Err(e) = result {
            if format!("{:?}", e).contains("GoneException") {
                return Ok(());
            }
            return Err(anyhow!("Failed to delete connection {}: {:?}", connection_id, e).into());
        }

        Ok(())
    }
}

