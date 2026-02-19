---
description: Initial setup guide (GitHub repository, AWS account, foundation stack, Github secrets)
---

# Initial Setup

Guide the user through the steps you as an agent together with the user have to do to set up the project.

// turbo-all

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

Explain to the user that a **fresh AWS account** is required.

Ask the user to sign up for a new account or create a sub-account.
Ask the user to log in via CLI:

    ```bash
    aws configure sso
    # OR
    aws configure
    ```

Ask for the user profile.

## Deploy FoundationStack

Deploy the `FoundationStack` to set up the base infrastructure.

1. The domain name is levity-test.wulf.technology (TODO: replace with %[ cookiecutter.domain_name ]% during backporting)
2. Derive the GitHub org/repo name from the `git remote -v` check earlier
3. Run the deployment:

   ```bash
   # Run from infrastructure directory
   cd infrastructure

   npx cdk bootstrap --profile <user-profile>

   npx cdk deploy FoundationStack \
     --profile <user-profile> \
     --require-approval never \
     -c skipBuild=true \
     -c domain=<domain-name> \
     -c githubRepo=<org/repo>
   ```

**Action:** Capture the `HostedZoneId` and `GitHubRoleArn` from the outputs.

## Configure DNS

Guide the user to configure their DNS.

1.  Retrieve the Name Servers (NS) from the created Hosted Zone.
2.  **Notify the User**: Provide the NS records and ask them to update their domain registrar.
3.  Explain that they must wait for propagation (usually minutes).

## Configure GitHub Secrets

Offer to store the secrets in the GitHub repository using the `gh` CLI.

1.  Check if `gh` is installed (`gh --version`).
2.  If installed, ask the user if they want you to set the secrets automatically.
3.  If yes, run:

    ```bash
    # Login check
    gh auth status || gh auth login

    # Set Secrets
    gh secret set HOSTED_ZONE_ID_STAGING -b"<HostedZoneId>" -R <org/repo>
    gh secret set AWS_ROLE_ARN_STAGING -b"<GitHubRoleArn>" -R <org/repo>
    gh secret set DOMAIN_STAGING -b"<domain-name>" -R <org/repo>
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