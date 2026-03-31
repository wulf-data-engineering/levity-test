#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib';
import { AppStack } from '../lib/app-stack';
import { FoundationStack } from '../lib/foundation-stack';
import { CertificateStack } from '../lib/certificate-stack';
import { loadDeploymentConfigs } from '../lib/config';

const app = new cdk.App();
const { foundation, certificate, app: appConfig } = loadDeploymentConfigs(app);

const env: cdk.Environment = {
  account: appConfig.aws ? (process.env.CDK_DEFAULT_ACCOUNT || process.env.AWS_ACCOUNT_ID) : '000000000000',
  region: appConfig.aws ? (process.env.CDK_DEFAULT_REGION || process.env.AWS_REGION || process.env.AWS_DEFAULT_REGION) : 'eu-central-1',
};

if (foundation) {
  new FoundationStack(app, 'FoundationStack', { 
    env,
    config: foundation,
  });
}

let certificateArn: string | undefined = undefined;

if (certificate) {
  const certStack = new CertificateStack(app, 'CertificateStack', {
    env: {
      account: env.account,
      region: 'us-east-1', // CloudFront strictly enforces ACM certificates to be in us-east-1
    },
    crossRegionReferences: true,
    config: certificate,
  });
  certificateArn = certStack.certificateArn;
}

new AppStack(app, 'AppStack', {
  env,
  crossRegionReferences: true,
  certificateArn,
  config: appConfig,
});

