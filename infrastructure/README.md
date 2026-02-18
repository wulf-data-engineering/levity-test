# Infrastructure

The infrastructure is defined using **AWS CDK** in **TypeScript**.

## Modes

There are three modes of deployment defined in [lib/config.ts](lib/config.ts).

### environment (default)

Deploys against an **AWS** account, typically by CI/CD into an environment like _production_ or _staging_.

Stateful resources are retained in case of stack deletion. Termination protection is enabled.

### sandbox (`cdk deploy -c mode=sandbox`)

Deploys against an **AWS** account, typically manually or by a GitHub action into a personal sandbox account.

Stateful resources are destroyed in case of stack deletion. Termination protection is disabled.

### local (`AWS_ENDPOINT_URL=http://...`)

Deploys against **localstack**.

- Cognito is not deployed automatically because **cognito-local** is used for local development.
- For local development all Lambda functions are forwarded to **cargo lambda watch**.
- Frontend is not deployed to CloudFront & S3 and served by **npm run dev** instead.

### Domain

_environment_ & _sandbox_ modes can deploy CloudFront with a custom domain.

```bash
cdk deploy -c domain=mydomain.com -c [hostedZoneId=...]
```

The hosted zone id is optional, CDK will look it up automatically if not provided.

## Requirements

### Docker for Docker Compose

The easiest way is installing [Docker Desktop](https://www.docker.com/products/docker-desktop/).

Unfortunately, the AI confuses `docker compose` (sub command) with `docker-compose` a lot.
It will realize it but that takes time & tokens.  
Just add an alias to your shell in `~/.zshrc`, `~/.bashrc` or whatever you use to make it work:

```bash
alias docker-compose=docker compose
```

### CDK

```bash
npm install -g aws-cdk
cdk --version  # to verify installation
```

## Useful commands

- `cdk bootstrap aws://<ACCOUNT_ID>/eu-central-1` bootstrap this stack
- `cdk deploy` deploy the bootstrapped stack
- `npm run build` compile typescript to js
- `npm run watch` watch for changes and compile
- `npm run test` perform the jest unit tests
- `cdk diff` compare deployed stack with current state
- `cdk synth` emits the synthesized CloudFormation template

## Deploy locally

Start localstack in a terminal on top level:

```bash
docker compose up -d
```

Deploy the infrastructure in another terminal in this directory:

```bash
npm install
npm run cdklocal:bootstrap # once
npm run cdklocal:deploy
```
