---
trigger: model_decision
description: Changing/Deploying the FoundationStack
---

When you deploy the application for the first time or change the foundation in infrastructure the stack have to be deployed.

It has to be run for **staging** and **production** in that particular order.

**Order is critical here!**

### 1. Ensure AWS CLI is logged in

Make sure the developer has logged into AWS with both profiles:

   ```bash
   aws sts get-caller-identity --profile levity-test-staging
   aws sts get-caller-identity --profile levity-test-production
   ```

### 2. Bootstrap Staging Account First
1. The domain name for staging is: `staging.levity-test.wulf.technology`
2. Run the deployment against the staging profile:

   ```bash
   cd infrastructure
   npx cdk bootstrap aws://<account id from sts>/eu-central-1 aws://<account id from sts>/us-east-1 \
     --profile levity-test-staging

   npx cdk deploy FoundationStack \
     --profile %[ cookiecutter.project_slug ]%-staging \
     --require-approval never \
     -c environment=staging \
     -c domain=staging.levity-test.wulf.technology \
     -c githubRepo=<org/repo>
   ```

**Action:** Capture the `HostedZoneId`, `GitHubRoleArn`, and crucially, the **`HostedZoneNameServers`** from the Staging deployment outputs.

### 3. Bootstrap Production Account Second (with DNS Delegation)
1. The domain name for production is: `levity-test.wulf.technology`
2. Run the deployment against the production profile, passing the Staging Name Servers for DNS delegation (mandatory in production environment):

   ```bash
   cd infrastructure
   npx cdk bootstrap aws://<account id from sts>/eu-central-1 aws://<account id from sts>/us-east-1 \
     --profile levity-test-production

   npx cdk deploy FoundationStack \
     --profile levity-test-production \
     --require-approval never \
     -c environment=production \
     -c domain=levity-test.wulf.technology \
     -c githubRepo=<org/repo> \
     -c stagingNameServers="ns-XXXX.awsdns-XX.org, ns-YYYY.awsdns-YY.co.uk, ..." # Use comma-separated list from Step 1
   ```