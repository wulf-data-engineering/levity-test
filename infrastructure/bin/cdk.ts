#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib';
import { AppStack } from '../lib/app-stack';
import { FoundationStack } from '../lib/foundation-stack';

const app = new cdk.App();
const isLocal = process.env.AWS_ENDPOINT_URL?.startsWith('http://') ?? false;

const env = {
    account: isLocal ? '000000000000' : process.env.CDK_DEFAULT_ACCOUNT,
    region: isLocal ? 'eu-central-1' : process.env.CDK_DEFAULT_REGION
};

const githubRepo = app.node.tryGetContext("githubRepo");
if (githubRepo) {
    new FoundationStack(app, 'FoundationStack', { env });
}

new AppStack(app, 'AppStack', { env });
