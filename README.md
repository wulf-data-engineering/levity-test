
# Structure

The project is structured as follows:

- `frontend` contains the SvelteKit frontend application.
- `backend` contains Lambdas written in Rust.
- `protocols`: contains API definitions (Protocol Buffers)
- `infrastructure` contains CDK code to deploy the application to AWS.
- `local` contains volumes for local development with Docker Compose.
- `docker-compose.yml` defines services for local development.

# Development

## Getting Started

To get started, launch the onboarding workflow in Antigravity:

Just type `/onboarding` in the chat. The agent will guide you through the onboarding process.

## Docker Service

First you need to start the docker containers in one terminal:

```bash
docker-compose up
```

It starts **localstack** and **cognito-local**.

## Backend

See the [backend/README.md](backend/README.md) for requirements and details.
Then start the backend in another terminal:

```bash
cd backend
cargo lambda watch
```

The lambda functions will be automatically rebuilt on code changes.

## Infrastructure

See the [infrastructure/README.md](infrastructure/README.md) for requirements and details.
Then deploy the infrastructure against **localstack** in another terminal.

```bash
cd infrastructure
cdklocal deploy
```

Infrastructure is deployed against **localstack**.  
Cognito is not deployed automatically because **cognito-local** is used for local
development. But there is an initial user pool, a client and a test user _test@wulf.technology_
with password _Password123!_.  
The lambdas are forwarded to **cargo lambda watch**.

## Frontend

See the [frontend/README.md](frontend/README.md) for requirements and details.
Then start the frontend in another terminal.

```bash
cd frontend
npm run dev
```
