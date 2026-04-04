---
trigger: model_decision
description: Changing/Deploying the FoundationStack
---

When you deploy the application for the first time or change the foundation stack in infrastructure the stack has to be deployed.

It has to be run for **staging** and **production** in that particular order.

**Order is critical here!**

### 1. Ensure AWS CLI is logged in

Make sure the developer has logged into AWS with both profiles:

   ```bash
   aws sts get-caller-identity --profile levity-test-staging
   aws sts get-caller-identity --profile levity-test-production
   ```

### 2. Deploy Staging Account
1. The domain name for staging is: `staging.levity-test.wulf.technology`
2. Run the deployment against the staging profile:

   ```bash
   git remote get-url origin
   cd infrastructure
   npx cdk deploy FoundationStack \
     --profile levity-test-staging \
     --require-approval never \
     -c environment=staging \
     -c domain=staging.levity-test.wulf.technology \
     -c githubRepo=<org/repo> # Get from git remote get-url origin
     -c ... # other application dependent values
   ```

**Action:** Capture the `HostedZoneId`, `GitHubRoleArn`, and crucially, the **`HostedZoneNameServers`** from the Staging deployment outputs.

### 3. Deploy Production Account (with DNS Delegation)

1. The domain name for production is: `levity-test.wulf.technology`

2. Check the diff:

   ```bash
   cd infrastructure
   npx cdk diff FoundationStack \
     --profile levity-test-production \
     --require-approval never \
     -c environment=production \
     -c domain=levity-test.wulf.technology \
     -c githubRepo=<org/repo> \
     -c stagingNameServers="ns-XXXX.awsdns-XX.org, ns-YYYY.awsdns-YY.co.uk, ..." # Use comma-separated list from Step 1
     -c ... # other application dependent values
   ```

Check if the hosted zone is subject to replacement. **Important:** If that is the case, notfiy the user that the change would require updates at the registrar.

3. Run the deployment against the production profile, passing the Staging Name Servers for DNS delegation (mandatory in production mode):

### 3. Deploy Production Account (with DNS Delegation)

   ```bash
   cd infrastructure
   npx cdk deploy FoundationStack \
     --profile levity-test-production \
     --require-approval never \
     -c mode=environment \
     -c environment=production \
     -c domain=levity-test.wulf.technology \
     -c githubRepo=<org/repo> \
     -c stagingNameServers="ns-XXXX.awsdns-XX.org, ns-YYYY.awsdns-YY.co.uk, ..." # Use comma-separated list from Step 1
     -c ... # other application dependent values
   ```