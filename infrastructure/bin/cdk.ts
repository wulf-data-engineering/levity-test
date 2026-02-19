#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib';
import { AppStack } from '../lib/app-stack';
import { FoundationStack } from '../lib/foundation-stack';
import { loadDeploymentConfig } from '../lib/config';

const app = new cdk.App();
const isLocal = process.env.AWS_ENDPOINT_URL?.startsWith('http://') ?? false;

const env = {
    account: isLocal ? '000000000000' : process.env.CDK_DEFAULT_ACCOUNT,
    region: isLocal ? 'eu-central-1' : process.env.CDK_DEFAULT_REGION
};

const foundationStack = new FoundationStack(app, 'FoundationStack', {
    env
});

new AppStack(app, 'AppStack', {
    env,
    hostedZone: foundationStack.hostedZone,
    sesIdentity: foundationStack.sesIdentity
});
