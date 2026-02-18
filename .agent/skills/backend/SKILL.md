---
name: Backend Development
description: Develop and test features in the backend
---

# Change Backend

## Concepts

The `backend/` folder contains AWS Lambda functions written in Rust.

There are two types of lambdas:

- API lambdas exposed to the frontend via API Gateway
- Event handlers or lifecycle hooks

The API lambdas receive and respond with Protocol Buffer messages.
Handling is implemented in `backend/shared/protocols.rs`.

## Development

Define newly required or change configuration of Cloud resources in
`infrastructure/lib/backend.ts` and its constructs in `infrastructure/lib/constructs/backend/`
For complex changes create new constructs.

Make modifications to the shared libraries in `backend/src/shared/`.
Register them in `backend/src/lib.rs`.

Add or change Rust lambdas in the `backend/src/` folder.
Use `lambda_http` for Lambdas exposed via API Gateway.
Use `lambda_runtime` for event handlers or lifecycle hooks.

To get an AWS SDK client, use the backend helper that takes care of aws & localstack configuration:

```rust
let config = backend::load_aws_config().await;
```

### Protocols

To use a protocol defined in `protocols/<name>.proto`:

1.  Import the `protocol_macro`:
    ```rust
    use protocol_macro::protocols;
    ```
2.  Define a module for the protocol:
    `rust
    #[protocols("<name>")]
    pub mod protocols {}
    `
    The macro will make the Protocol Buffer types in the module available with `use`.

If code depends on local development or deployed AWS environment separate that behavior in two functions with same name.
Annotate the local version with `#[cfg(any(debug_assertions, test))]`.
Annotate the deployed version with `#[cfg(not(any(debug_assertions, test)))]`.

Register new lambdas in Cargo.toml.

To try out new APIs use `curl` against the `cargo lambda watch` endpoint:
```bash
curl -v -H 'Accept: application/json' http://localhost:9000/lambda-url/{lambda}/
```

Define new API lambdas in `infrastructure/lib/constructs/backend/api.ts`.

Run `cargo nextest run` during development.

If applicable consult `.agent/workflows/run-locally.md` to test the changes in the browser.

### Testing

If you introduce a new feature or make a change it has to be reflected in tests.
If there are existing unit or integration tests, extend or update them.
If not, evaluate if unit and/or integration tests are appropriate to test the change.

## MCP Tools

The `aws-knowledge-mcp-server` MCP server is available.

- Use `aws___get_regional_availability` to check regional availability of services.
- Use `aws___search_documentation` to search/read AWS documentation (prefer over general web search).

The `context7` MCP server is available for Rust crate documentation.

- Use `resolve-library-id` and `query-docs` to find documentation and examples for Rust crates.

### Final Checks (CRITICAL)

If you modified `infrastructure/package.json`, run `npm install` in `infrastructure/` to update the lock file.
Run `npm run format` in `infrastructure/`.

At the end of development run `cargo format`, `cargo check` & `cargo clippy`.

## Troubleshooting

### Rust build

If the Rust build fails in `cdk synth` (especially linking errors or missing system dependencies), check if the Docker image in `infrastructure/lib/constructs/backend/backend-lambda.ts` is outdated.

**Steps to verify:**

1.  Locate the current image tag (e.g., `20251227`) in `backend-lambda.ts`.
2.  Compare it with the tag used in the [upstream template](https://github.com/wulf-data-engineering/levity/blob/main/template/levity-test-onboarding/infrastructure/lib/constructs/backend/backend-lambda.ts).
3.  If a newer date-based tag exists upstream, suggest updating the local version.
