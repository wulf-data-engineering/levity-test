#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib';
import { AppStack } from '../lib/app-stack';
import { FoundationStack } from '../lib/foundation-stack';
import { CertificateStack } from '../lib/certificate-stack';

const app = new cdk.App();
const isLocal = process.env.AWS_ENDPOINT_URL?.startsWith('http://') ?? false;

const env: cdk.Environment = {
  account: isLocal ? '000000000000' : (process.env.CDK_DEFAULT_ACCOUNT || process.env.AWS_ACCOUNT_ID),
  region: isLocal ? 'eu-central-1' : (process.env.CDK_DEFAULT_REGION || process.env.AWS_REGION || process.env.AWS_DEFAULT_REGION),
};

const githubRepo = app.node.tryGetContext('githubRepo');
if (githubRepo) {
  new FoundationStack(app, 'FoundationStack', { env });
}

let certificateArn: string | undefined = undefined;

// Create the cross-region dependencies if we are provided a domain configuration
// For staging and production, we typically pass the context flags needed.
const domainName = app.node.tryGetContext('domain');
if (domainName) {
  const certStack = new CertificateStack(app, 'CertificateStack', {
    env: {
      account: env.account,
      region: 'us-east-1', // CloudFront strictly enforces ACM certificates to be in us-east-1
    },
    crossRegionReferences: true,
  });
  certificateArn = certStack.certificateArn;
}

new AppStack(app, 'AppStack', {
  env,
  crossRegionReferences: true,
  certificateArn,
});
