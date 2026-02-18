use crate::shared::dynamodb::{to_item, Versioned};
use aws_sdk_dynamodb::Client;
use schemars::JsonSchema;
use serde::{Deserialize, Serialize};

#[derive(Serialize, Deserialize, JsonSchema, Clone, Debug)]
pub struct UserData {
    pub username: String, // Cognito Sub
    pub email: String,
    pub first_name: String,
    pub last_name: String,
}

pub type User = Versioned<UserData>;

#[derive(Clone)]
pub struct UserRepo {
    client: Client,
    table_name: String,
}

impl UserRepo {
    pub fn new(client: Client, table_name: String) -> Self {
        Self { client, table_name }
    }

    pub async fn insert(&self, user_data: UserData) -> Result<(), anyhow::Error> {
        let user = User::new(user_data);
        let item = to_item(&user)?;

        // We use the username (sub) as pk
        let pk = user.data.username.clone();

        let mut item_map = item;
        item_map.insert(
            "pk".to_string(),
            aws_sdk_dynamodb::types::AttributeValue::S(pk),
        );

        self.client
            .put_item()
            .table_name(&self.table_name)
            .set_item(Some(item_map))
            .condition_expression("attribute_not_exists(pk)")
            .send()
            .await?;

        Ok(())
    }

    pub async fn read(&self, username: &str) -> Result<Option<User>, anyhow::Error> {
        let resp = self
            .client
            .get_item()
            .table_name(&self.table_name)
            .key("pk", aws_sdk_dynamodb::types::AttributeValue::S(username.to_string()))
            .send()
            .await?;

        if let Some(item) = resp.item {
            Ok(Some(crate::shared::dynamodb::from_item(item)?))
        } else {
            Ok(None)
        }
    }

    pub async fn find_by_email(&self, email: &str) -> Result<Option<User>, anyhow::Error> {
        let resp = self
            .client
            .query()
            .table_name(&self.table_name)
            .index_name("email-index")
            .key_condition_expression("email = :email")
            .expression_attribute_values(
                ":email",
                aws_sdk_dynamodb::types::AttributeValue::S(email.to_string()),
            )
            .send()
            .await?;

        if let Some(items) = resp.items {
            if let Some(item) = items.into_iter().next() {
                return Ok(Some(crate::shared::dynamodb::from_item(item)?));
            }
        }
        Ok(None)
    }

    pub async fn update(&self, user_data: UserData, version: u16) -> Result<(), anyhow::Error> {
        let mut user = User::new(user_data);
        user.data_version = version + 1;
        let item = to_item(&user)?;

        let pk = user.data.username.clone();
        let mut item_map = item;
        item_map.insert(
            "pk".to_string(),
            aws_sdk_dynamodb::types::AttributeValue::S(pk),
        );

        self.client
            .put_item()
            .table_name(&self.table_name)
            .set_item(Some(item_map))
            .condition_expression("data_version = :version")
            .expression_attribute_values(
                ":version",
                aws_sdk_dynamodb::types::AttributeValue::N(version.to_string()),
            )
            .send()
            .await?;

        Ok(())
    }

    pub async fn delete(&self, username: String, version: u16) -> Result<(), anyhow::Error> {
        self.client
            .delete_item()
            .table_name(&self.table_name)
            .key("pk", aws_sdk_dynamodb::types::AttributeValue::S(username))
            .condition_expression("data_version = :version")
            .expression_attribute_values(
                ":version",
                aws_sdk_dynamodb::types::AttributeValue::N(version.to_string()),
            )
            .send()
            .await?;

        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use wiremock::matchers::{method, path};
    use wiremock::{Mock, MockServer, ResponseTemplate};

    #[tokio::test]
    async fn test_insert_user() {
        let server = MockServer::start().await;

        Mock::given(method("POST"))
            .and(path("/"))
            .respond_with(ResponseTemplate::new(200).set_body_json(serde_json::json!({})))
            .mount(&server)
            .await;

        let shared_config = crate::shared::aws_config::load_aws_config_for_mock(&server).await;
        let client = aws_sdk_dynamodb::Client::new(&shared_config);
        let repo = UserRepo::new(client, "users".to_string());

        let user_data = UserData {
            username: "test_user".to_string(),
            email: "test@example.com".to_string(),
            first_name: "Test".to_string(),
            last_name: "User".to_string(),
        };

        let result = repo.insert(user_data).await;
        assert!(result.is_ok());
    }

    #[tokio::test]
    async fn test_read_user() {
        let server = MockServer::start().await;

        Mock::given(method("POST"))
            .and(path("/"))
            .respond_with(ResponseTemplate::new(200).set_body_json(serde_json::json!({
                "Item": {
                    "pk": {"S": "test_user"},
                    "username": {"S": "test_user"},
                    "email": {"S": "test@example.com"},
                    "first_name": {"S": "Test"},
                    "last_name": {"S": "User"},
                    "data_version": {"N": "1"},
                    "last_write": {"N": "1234567890"}
                }
            })))
            .mount(&server)
            .await;

        let shared_config = crate::shared::aws_config::load_aws_config_for_mock(&server).await;
        let client = aws_sdk_dynamodb::Client::new(&shared_config);
        let repo = UserRepo::new(client, "users".to_string());

        let result = repo.read("test_user").await;
        assert!(result.is_ok());
        let user = result.unwrap();
        assert!(user.is_some());
        assert_eq!(user.unwrap().data.username, "test_user");
    }
}
