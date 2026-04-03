# Infrastructure

The infrastructure is defined using **AWS CDK** in **TypeScript**.

It is split into three stacks to separate persistent resources from the application lifecycle:

1.  **FoundationStack**: Persistent resources (HostedZone, SES Identity, OIDC Provider). Deployed infrequently.
2.  **CertificateStack**: Cross-region resources (ACM in us-east-1). Deployed initially alongside FoundationStack.
3.  **AppStack**: The application resources (Backend, Frontend). Deployed frequently via CI/CD.

## Configuration

Configuration is handled in [lib/config.ts](lib/config.ts) and avoids runtime lookups for better determinism.

### Context Variables

Configuration is passed via CDK context variables (`-c key=value`).

| Variable             | Description                                             | Stacks                   |
| :------------------- | :------------------------------------------------------ | :----------------------- |
| `mode`               | `local`, `environment`, `sandbox` (default)             | all                      |
| `environment`        | `staging` or `production` (required for `environment`)  | all                      |
| `domain`             | The domain name (e.g. `staging.example.com`)            | all (`environment` mode) |
| `githubRepo`         | GitHub repository (e.g. `org/repo`) for OIDC            | `FoundationStack`        |
| `stagingNameServers` | Name servers for staging delegation (`production` only) | `FoundationStack`        |
| `backendPath`        | Path to pre-compiled backend                            | `AppStack`               |
| `frontendPath`       | Path to pre-compiled frontend                           | `AppStack`               |
| `build`              | Build application code locally (default: false)         | `AppStack`               |

## Modes

There are three modes of deployment defined in [lib/config.ts](lib/config.ts).

- **environment**: deployed from Github Actions to an AWS account, staging or production. Requires `-c environment=staging|production`.
- **sandbox**: deployed from local cdk to an isolated AWS account, e.g. for branch testing.
- **local**: deployed from local cdk to localstack for local testing.

### environment (`environment=production|staging`)

Deploys against an **AWS** account like _production_ or _staging_.
Termination protection is enabled for both environments.
_production_ is configured to keep persistent resources after stack deletion.
_staging_ is configured to destroy resources after stack deletion.

- **FoundationStack**: Contains stateful resources (Hosted Zone, SES). Requires `domain`, `githubRepo`, and `environment`. When `environment=production`, the `stagingNameServers` context variable is **mandatory** to delegate the `staging` subdomain to the staging account.
- **CertificateStack**: Contains the ACM Certificate deployed to us-east-1. Requires `domain` and `environment`.
- **AppStack**: Contains the application (Backend, Frontend). Requires `domain`, `hostedZone`, and `environment`, typically by CI/CD.

### sandbox (`mode=sandbox`, default)

Deploys against an **AWS** account for personal testing. Stateful resources are destroyed on deletion. Termination protection is disabled.

The sandbox does not require the **FoundationStack**, **CertificateStack** or a domain.
It uses a simple cloud front distribution URL and default email from Cognito.

You need to pass `-c build=true` to build backend and frontend locally during CDK deployment.

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

- `cdk bootstrap`: bootstraps CDK for an AWS region
- `cdk deploy FoundationStack|CertificateStack|AppStack`: deploys one of the stacks
- `cdk diff`: compare deployed stack with current state
- `cdk synth`: emits the synthesized CloudFormation template
- `npm run test`: perform the jest unit tests

## Deploy to an environment on AWS

### 1. FoundationStack (Setup)

You can use the `/initial-setup` workflow to let the agent guide you through the set up of the Github repository, the AWS account and the foundation stack.

The foundation stack is deployed once to set up the account.

First, bootstrap the environment (if not already done):

```bash
npx cdk bootstrap --profile [profile]
```

Then deploy the foundation stack for staging:

**Staging:**

```bash
npx cdk deploy FoundationStack \
  --profile <profile> \
  -c environment=staging \
  -c domain=<domain> \
  -c githubRepo=<org/repo>
```

Capture the outputs.
You need the staging name servers for the production deployment.

**Production:**

```bash
npx cdk deploy FoundationStack \
  --profile <profile> \
  -c environment=production \
  -c domain=<domain> \
  -c githubRepo=<org/repo> \
  -c stagingNameServers=<ns1,ns2...>
```

`build` defaults to `false`, which is important to omit building the Rust binaries during foundation setup (uses stubs).

**After deployment:**

Update your domain registrar with the **production** name servers.

Store the outputs in GitHub Secrets:

- `AWS_ROLE_ARN_[STAGING|PRODUCTION]`: `GitHubRoleArn`
- `DOMAIN_[STAGING|PRODUCTION]`: domain name
- `CERTIFICATE_ARN_[STAGING|PRODUCTION]`: domain name

### 2. CertificateStack

The certificate stacks may take a while until AWS validates the domain ownership.

**Staging:**

```bash
npx cdk deploy CertificateStack \
  --profile <profile> \
  -c environment=staging \
  -c domain=<domain>
```

**Production:**

```bash
npx cdk deploy CertificateStack \
  --profile <profile> \
  -c environment=production \
  -c domain=<domain>
```

### 3. AppStack (Application)

The app stack is deployed frequently, usually via GitHub Actions.

```bash
npx cdk deploy AppStack \
  --profile <profile> \
  -c environment=<staging|production> \
  -c domain=<domain> \
  -c backendPath=<path>
  -c frontendPath=<path>
```

## Deploy to a sandbox AWS account

Just deploy the app stack without domain, hosted zone and therefore no certificate.

```bash
npx cdk deploy AppStack \
  --profile <profile> \
  -c mode=sandbox \
  -c build=true
```

Pass `build=true` if you want cdk to bundle the application code locally.

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
