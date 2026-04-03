#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib';
import { AppStack } from '../lib/app-stack';
import { FoundationStack } from '../lib/foundation-stack';
import { CertificateStack } from '../lib/certificate-stack';
import { loadDeploymentConfig } from '../lib/config';

const app = new cdk.App();
const deploymentConfig = loadDeploymentConfig(app);

const env = {
  account: deploymentConfig.mode === 'local' ? '000000000000' : process.env.CDK_DEFAULT_ACCOUNT,
  region: deploymentConfig.mode === 'local' ? 'eu-central-1' : process.env.CDK_DEFAULT_REGION,
};

// Deploys stable infrastructure (iam roles for github actions, hosted zone, SES).
// Deploying the foundation stack does not make sense without a github repo for the role or a domain name for the hosted zone.
const githubRepo = app.node.tryGetContext('githubRepo');
if (githubRepo && deploymentConfig.domainName) {
  new FoundationStack(app, 'FoundationStack', {
    env,
    deploymentConfig,
    githubRepo,
  });
}

// Create a validated certificate for the domain in us-east-1 (required for CloudFront).
// Deploying the certificate stack does not make sense without a domain name.
if (deploymentConfig.domainName) {
  new CertificateStack(app, 'CertificateStack', {
    env: {
      account: env.account,
      region: 'us-east-1', // CloudFront strictly enforces ACM certificates to be in us-east-1
    },
    domainName: deploymentConfig.domainName!,
  });
}

// Deploys the actual application stack.
new AppStack(app, 'AppStack', {
  env,
  deploymentConfig
});
