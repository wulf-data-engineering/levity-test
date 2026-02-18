---
name: Database Development
description: Patterns for DynamoDB access and repositories
---

# Database Rules

## Repositories

Repositories abstract the DynamoDB access. They should be implemented in `backend/src/shared/<entity>.rs`.

### UserRepo

The `UserRepo` handles access to the `users` table.

```rust
pub struct UserRepo {
    client: Client,
    table_name: String,
}

impl UserRepo {
    pub fn new(client: Client, table_name: String) -> Self;
    pub async fn insert(&self, user_data: UserData) -> Result<(), anyhow::Error>;
    pub async fn read(&self, username: &str) -> Result<Option<User>, anyhow::Error>;
    // Example for a table specific GSI
    pub async fn find_by_email(&self, email: &str) -> Result<Option<User>, anyhow::Error>;
    pub async fn update(&self, user_data: UserData, version: u16) -> Result<(), anyhow::Error>;
    pub async fn delete(&self, username: String, version: u16) -> Result<(), anyhow::Error>;
}
```

## Dependency Injection

To use repositories in Lambda functions, follow this pattern:

1.  **Infrastructure**: Pass the DynamoDB table to the Lambda construct.

    ```typescript
    // infrastructure/lib/constructs/backend.ts
    const usersTable = new VersionedTable(this, 'UsersTable', { ... });
    const identity = new Identity(this, 'Identity', { deploymentConfig, usersTable });
    ```

2.  **Lambda Construct**: Pass the table name as an environment variable and grant permissions.

    ```typescript
    // infrastructure/lib/constructs/backend/identity.ts
    this.cognitoHandler = backendLambda(this, "CognitoHandlerFunction", {
      // ...
      environment: {
        USERS_TABLE_NAME: props.usersTable.tableName,
      },
    });
    props.usersTable.grantReadWriteData(this.cognitoHandler);
    ```

3.  **Lambda Main**: Read the environment variable and initialize the repository.

    ```rust
    // backend/src/cognito-handler.rs
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
        let config = aws_config::load_defaults(aws_config::BehaviorVersion::latest()).await;
        let client = aws_sdk_dynamodb::Client::new(&config);
        let repo = backend::shared::users::UserRepo::new(client, table_name);

        run(service_fn(move |event| {
            let repo = repo.clone();
            async move { function_handler(event, &repo).await }
        })).await
    }
    ```

4.  **Lambda Handler**: Accept the repository as an argument.
    ```rust
    async fn function_handler(
        event: LambdaEvent<CognitoUserPoolEvent>,
        repo: &UserRepo,
    ) -> Result<CognitoUserPoolEvent, Error> { ... }
    ```
