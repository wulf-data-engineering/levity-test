# Infrastructure

The infrastructure is defined using **AWS CDK** in **TypeScript**.

It is split into two stacks to separate persistent resources from the application lifecycle:

1.  **FoundationStack**: Persistent resources (HostedZone, SES Identity, OIDC Provider). Deployed infrequently.
2.  **AppStack**: The application resources (Backend, Frontend). Deployed frequently via CI/CD.

## Configuration

Configuration is handled in [lib/config.ts](lib/config.ts) and avoids runtime lookups for better determinism.

### Context Variables

Configuration is passed via CDK context variables (`-c key=value`).

| Variable       | Description                                  | Stacks                    |
| :------------- | :------------------------------------------- | :------------------------ |
| `mode`         | `local`, `sandbox`, `stage` (default)        | Both                      |
| `domain`       | The domain name (e.g. `staging.example.com`) | Both (`stage` mode)       |
| `githubRepo`   | GitHub repository (e.g. `org/repo`) for OIDC | `FoundationStack`         |
| `hostedZoneId` | ID of the hosted zone                        | `AppStack` (`stage` mode) |
| `skipBuild`    | Skip building application code               | Both                      |

## Modes

There are three modes of deployment defined in [lib/config.ts](lib/config.ts).

- **stage**: deployed from Github Actions to an AWS account, staging or production
- **sandbox**: deployed from local cdk to an isolated AWS account, e.g. for branch testing
- **local**: deployed from local cdk to localstack for local testing

### environment (default / `mode=stage`)

Deploys against an **AWS** account, typically by CI/CD into an environment like _production_ or _staging_.

- **FoundationStack**: Contains stateful resources (Hosted Zone, SES). Termination protection is enabled. Requires `domain` and `githubRepo`.
- **AppStack**: Contains the application (Backend, Frontend). Termination protection is enabled. Requires `domain` and `hostedZone`.

### sandbox (`cdk deploy -c mode=sandbox`)

Deploys against an **AWS** account for personal testing. Stateful resources are destroyed on deletion. Termination protection is disabled.

The sandbox does not require the **FoundationStack**, a domain or a hosted zone.
It uses a simple cloud front distribution URL and default email from Cognito.

### local (`AWS_ENDPOINT_URL=http://...`)

Deploys against **localstack**.

- Cognito is not deployed automatically because **cognito-local** is used for local development.
- For local development all Lambda functions are forwarded to **cargo lambda watch**.
- Frontend is not deployed to CloudFront & S3 and served by **npm run dev** instead.

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

- `cdk bootstrap`: bootstrap the environment
- `cdk deploy FoundationStack|AppStack`: deploys one of the stacks
- `cdk diff`: compare deployed stack with current state
- `cdk synth`: emits the synthesized CloudFormation template
- `npm run test`: perform the jest unit tests

## Deploy to a stage on AWS

### 1. FoundationStack (Setup)

You can use the `/initial-setup` workflow to let the agent guide you through the set up of the Github repository, the AWS account and the foundation stack.

The foundation stack is deployed once to set up the account.

First, bootstrap the environment (if not already done):

```bash
npx cdk bootstrap --profile [profile] -c skipBuild=true
```

Then deploy the stack:

```bash
npx cdk deploy FoundationStack \
  --profile <profile> \
  -c domain=<domain> \
  -c githubRepo=<org/repo> \
  -c skipBuild=true
```

`skipBuild` is important to omit building the Rust binaries.

**After deployment:**

Update your domain registrar with the output Name Servers.

Store the outputs in GitHub Secrets:

- `HOSTED_ZONE_ID_[STAGING|PRODUCTION]`: `HostedZoneId`
- `AWS_ROLE_ARN_[STAGING|PRODUCTION]`: `GitHubRoleArn`
- `DOMAIN_[STAGING|PRODUCTION]`: domain name

### 2. AppStack (Application)

The app stack is deployed frequently, usually via GitHub Actions.

```bash
npx cdk deploy AppStack \
  --profile <profile> \
  -c domain=<domain> \
  -c hostedZoneId=<id>
```

## Deploy to a sandbox AWS account

Just deploy the app stack without domain or hosted zone.

```bash
npx cdk deploy AppStack \
  --profile <profile>
```

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
