---
description: Initial setup guide (GitHub repository, AWS account, foundation/certificate stack, Github variables and secrets)
---

# Initial Setup

Guide the user through the steps you as an agent together with the user have to do to set up the project.

// turbo-all

## npm dependencies

Run `npm install` in `frontend/` and `infrastructure/`.

## Formatting

Suggest to run formatter in backend, frontend and infrastructure because this project was created from a template and value substitution not necessarily produces formatted code.
You can do this on the main branch. If there are changes, suggest to checkout branch `initial-setup`.

## Connect to GitHub Repository

Check if the local project is connected to a GitHub repository:

```bash
git remote get-url origin
```

If not:

- Ask the user to create a new repository
- You need to ask for the repo-url
- Connect it but do not push anything:

  ```bash
  git remote add origin <repo-url>
  ```

## AWS Account Setup

Explain to the user that **two AWS accounts** are required for a proper staging and production separation.

Ask the user to create or sign in to:
1.  A **Staging** AWS Account
2.  A **Production** AWS Account

Ask the user to configure SSO logins and profiles for both via CLI:

    ```bash
    aws configure sso --profile levity-test-staging
    aws configure sso --profile levity-test-production
    ```

Ask the user to log into both accounts:

    ```bash
    aws sso login --profile levity-test-staging
    aws sso login --profile levity-test-production
    ```

Then check the log in status and capture the account ids for both environments:

   ```bash
   aws sts get-caller-identity --profile levity-test-staging
   aws sts get-caller-identity --profile levity-test-production
   ```

## Bootstrap both accounts

Explain to the user, that AWS accounts need to be bootstrapped for CDK.

Then, bootstrap cdk for both environments:

   ```bash
   cd infrastructure
   npx cdk bootstrap aws://<staging account id>/eu-central-1 aws://<staging account id>/us-east-1 \
     --profile levity-test-staging
   npx cdk bootstrap aws://<production account id>/eu-central-1 aws://<production account id>/us-east-1 \
     --profile levity-test-production
   ```

## Deploy foundation stack (Cross-Account Setup)

Explain to the user, that the foundation stack has to be deployed first.

**Important:** Then, deploy the `FoundationStack` by following exactly these referenced rules:

@../rules/foundation-stack.md

**Action:** Capture the `HostedZoneNameServers` from the **production** deployment outputs.

## Configure DNS at Registrar

Guide the user to configure their DNS registrar.

1.  **Notify the User**: Provide the 4 **production** NS records from the second deployment.
2.  Ask them to configure these 4 Name Servers as the Custom DNS for the root domain `levity-test.wulf.technology` at their registrar.
3.  Explain that they do *not* configure the staging NS records at the registrar; the production AWS account is now delegating traffic to them automatically.

## Configure GitHub repo

While waiting for the DNS propagation, suggest to configure the GitHub repository:

Follow the steps of the @configure-github-repo.md workflow.

## Deploy certificate stack

Verify that the DNS has been propagated:

   ```bash
    dig +short NS staging.levity-test.wulf.technology
    dig +short NS levity-test.levity-test.wulf.technology
   ```

Explain to the user, that certificates for the domains are required in us-east-1 for CloudFront.

Then, deploy the certificate stack:

```bash
npx cdk deploy CertificateStack \
     --profile levity-test-staging \
     --require-approval never \
     -c environment=staging \
     -c domain=staging.levity-test.wulf.technology \


npx cdk deploy CertificateStack \
     --profile levity-test-production \
     --require-approval never \
     -c environment=production \
     -c domain=levity-test.wulf.technology \
```

+**Action:** Capture the `CertificateArnOutput` from both the staging and production deployment outputs.

## Configure GitHub Variables

Offer to the user to store variables in the GitHub repository using the `gh` CLI.

1.  Check if `gh` is installed (`gh --version`).
2.  If installed, ask the user if they want you to set them automatically.
3.  If yes, run:

    ```bash
    # Login check
    gh auth status || gh auth login

    # Set Variables
    gh variable set DOMAIN_STAGING -b"staging.levity-test.wulf.technology" -R <org/repo>
    gh variable set DOMAIN_PRODUCTION -b"levity-test.wulf.technology" -R <org/repo>
+    gh variable set CERTIFICATE_ARN_STAGING -b"<CertificateArnStaging>" -R <org/repo>
+    gh variable set CERTIFICATE_ARN_PRODUCTION -b"<CertificateArnProduction>" -R <org/repo>
    gh variable set AWS_ROLE_ARN_STAGING -b"<GitHubRoleArn>" -R <org/repo>
    gh variable set AWS_ROLE_ARN_PRODUCTION -b"<GitHubRoleArn>" -R <org/repo>
    ```

**Important:** Use exactly those names.
Other names can be added if they are required for the application but follow the `_STAGING|PRODUCTION` suffix.


## Verify

Explain to the user, that you will verify the domain and email configuration.

1. Check the SES verification status:

   ```bash
   aws sesv2 get-email-identity \
     --email-identity levity-test.wulf.technology \
     --profile levity-test-production

   aws sesv2 get-email-identity \
     --email-identity staging.levity-test.wulf.technology \
     --profile levity-test-staging
   ```

   - **Expected Status**: `SUCCESS` (Verified)
   - **If PENDING**: Check `DkimAttributes.Status` and ensure DNS records are correct.
   - If correct: Check DNS propagation using `dig`.
   - Explain the result, suggest waiting and retrying the check.

2. Once verified, suggest pushing to main to trigger the first deployment.