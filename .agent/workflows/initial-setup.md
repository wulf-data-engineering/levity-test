---
description: Initial setup guide (GitHub repository, AWS account, foundation stack, Github variables and secrets)
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

## Deploy FoundationStacks (Cross-Account Setup)

Deploy the `FoundationStack` to set up the base infrastructure for both accounts. **Order is critical here!**

### 1. Bootstrap Staging Account First
1. The domain name for staging is: `staging.levity.wulf.technology`
2. Run the deployment against the staging profile:

   ```bash
   cd infrastructure
   npx cdk bootstrap aws://unknown-account/eu-central-1 aws://unknown-account/us-east-1 \
     --profile levity-test-staging

   npx cdk deploy FoundationStack CertificateStack \
     --profile levity-test-staging \
     --require-approval never \
     -c skipBuild=true \
     -c domain=staging.levity-test.wulf.technology \
     -c githubRepo=<org/repo>
   ```

**Action:** Capture the `HostedZoneId`, `GitHubRoleArn`, and crucially, the **`HostedZoneNameServers`** from the Staging deployment outputs.

### 2. Bootstrap Production Account Second (with DNS Delegation)
1. The domain name for production is: `levity.wulf.technology`
2. Run the deployment against the production profile, passing the Staging Name Servers for DNS delegation:

   ```bash
   cd infrastructure
   npx cdk bootstrap aws://unknown-account/eu-central-1 aws://unknown-account/us-east-1 \
     --profile levity-test-production

   npx cdk deploy FoundationStack CertificateStack \
     --profile levity-test-production \
     --require-approval never \
     -c skipBuild=true \
     -c domain=levity-test.wulf.technology \
     -c githubRepo=<org/repo> \
     -c stagingNameServers="ns-XXXX.awsdns-XX.org, ns-YYYY.awsdns-YY.co.uk, ..." # Use comma-separated list from Step 1
   ```

**Action:** Capture the `HostedZoneNameServers` from the **Production** deployment outputs.

## Configure DNS at Registrar

Guide the user to configure their DNS registrar.

1.  **Notify the User**: Provide the 4 **Production** NS records from the second deployment.
2.  Ask them to configure these 4 Name Servers as the Custom DNS for the root domain `levity.wulf.technology` at their registrar.
3.  Explain that they do *not* configure the staging NS records at the registrar; the production AWS account is now delegating traffic to them automatically.
4.  Wait for propagation (usually minutes).

## Configure GitHub Secrets and Variables

Offer to store them in the GitHub repository using the `gh` CLI.

1.  Check if `gh` is installed (`gh --version`).
2.  If installed, ask the user if they want you to set them automatically.
3.  If yes, run:

    ```bash
    # Login check
    gh auth status || gh auth login

    # Set Variables (Non-sensitive)
    gh variable set HOSTED_ZONE_ID_STAGING -b"<HostedZoneId>" -R <org/repo>
    gh variable set DOMAIN_STAGING -b"<domain-name>" -R <org/repo>

    # Set Secrets (Sensitive)
    gh secret set AWS_ROLE_ARN_STAGING -b"<GitHubRoleArn>" -R <org/repo>
    ```

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

2. Once verified, suggest pushing to main to trigger the deployment.