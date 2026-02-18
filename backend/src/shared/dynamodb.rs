use aws_sdk_dynamodb::types::AttributeValue;
use schemars::JsonSchema;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;

#[derive(Serialize, Deserialize, JsonSchema, Clone, Debug)]
pub struct Versioned<T> {
    #[serde(flatten)]
    pub data: T,
    pub data_version: u16,
    pub last_write: i64,
}

impl<T> Versioned<T> {
    pub fn new(data: T) -> Self {
        Self {
            data,
            data_version: 1,
            last_write: chrono::Utc::now().timestamp_millis(),
        }
    }
}

pub fn to_item<T: Serialize>(
    item: &T,
) -> Result<HashMap<String, AttributeValue>, serde_dynamo::Error> {
    serde_dynamo::to_item(item)
}

pub fn from_item<T: for<'a> Deserialize<'a>>(
    item: HashMap<String, AttributeValue>,
) -> Result<T, serde_dynamo::Error> {
    serde_dynamo::from_item(item)
}
