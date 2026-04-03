---
description: Initial setup guide (GitHub repository, AWS account, foundation/certificate stack, Github variables and secrets)
---

# Initial Setup

Guide the user through the steps you as an agent together with the user have to do to set up the project.

// turbo-all

## Formatting

Suggest to run formatter in backend and frontend because value substitution in cookiecutter not necessarily produces formatted code.


## Connect to GitHub Repository

Check if the local project is connected to a GitHub repository:

```bash
git remote -v
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

Make sure the developer has logged into AWS with both profiles:

   ```bash
   aws sts get-caller-identity --profile levity-test-staging
   aws sts get-caller-identity --profile levity-test-production
   ```

**Action:** Capture the account ids for both environents.

## Bootstrap both accounts

Bootstrap cdk for both environments:

   ```bash
   cd infrastructure
   npx cdk bootstrap aws://<staging account id>/eu-central-1 aws://<staging account id>/us-east-1 \
     --profile levity-test-staging
   npx cdk bootstrap aws://<production account id>/eu-central-1 aws://<production account id>/us-east-1 \
     --profile levity-test-production
   ```

## Deploy foundation stack (Cross-Account Setup)

Deploy the `FoundationStack` to set up the base infrastructure for both accounts:

@../rules/foundation-stack.md

**Action:** Capture the `HostedZoneNameServers` from the **production** deployment outputs.

## Configure DNS at Registrar

Guide the user to configure their DNS registrar.

1.  **Notify the User**: Provide the 4 **production** NS records from the second deployment.
2.  Ask them to configure these 4 Name Servers as the Custom DNS for the root domain `levity.wulf.technology` at their registrar.
3.  Explain that they do *not* configure the staging NS records at the registrar; the production AWS account is now delegating traffic to them automatically.
4.  Wait for propagation (usually minutes).

## Deploy certificate stack

Now the certificate stack can be deployed:

```bash
npx cdk deploy CertificateStack \
     --profile levity-test-staging \
     --require-approval never \
     -c environment=staging \
     -c domain=staging.levity.wulf.technology \


npx cdk deploy CertificateStack \
     --profile levity-test-production \
     --require-approval never \
     -c environment=production \
     -c domain=levity.wulf.technology \
```

## Configure GitHub Secrets and Variables

Offer to store them in the GitHub repository using the `gh` CLI.

1.  Check if `gh` is installed (`gh --version`).
2.  If installed, ask the user if they want you to set them automatically.
3.  If yes, run:

    ```bash
    # Login check
    gh auth status || gh auth login

    # Set Variables (Non-sensitive)
    gh variable set DOMAIN_STAGING -b"<domain-name>" -R <org/repo>

    # Set Secrets (Sensitive)
    gh secret set AWS_ROLE_ARN_STAGING -b"<GitHubRoleArn>" -R <org/repo>
    ```
4. same for production.

**Important:** Use exactly those names.
Other names can be added if they are required for the application but follow the `_STAGING|PRODUCTION` suffix.


## Verify

1. Check the SES verification status:

   ```bash
   aws sesv2 get-email-identity \
     --email-identity <domain-name> \
     --profile <user-profile>
   ```

   - **Expected Status**: `SUCCESS` (Verified)
   - **If PENDING**: Check `DkimAttributes.Status` and ensure DNS records are correct.
   - If correct: Check DNS propagation using `dig`.
   - Explain the result, suggest waiting and retrying the check.

2. Once verified, suggest pushing to main to trigger the first deployment.