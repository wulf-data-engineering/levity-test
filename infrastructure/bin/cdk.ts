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

new AppStack(app, 'CdkStack', { // Keep stack name 'CdkStack' for now to avoid rapid drift/issues with existing deployments, or rename to AppStack if we want a clean break. User said 'AppStack' in plan.
    // Actually, sticking to 'CdkStack' name for the App stack might be confusing if we renamed the class.
    // Let's use 'AppStack' as ID, but maybe we need consistency.
    // User already has 'CdkStack' deployed (stuck).
    // If we change ID to 'AppStack', CDK will try to create NEW stack and delete OLD key.
    // Since old key is stuck, maybe a new name IS better to bypass it?
    // User said "The stack will never be deployed together."
    // Let's call it 'AppStack' to be clean.
    env,
    hostedZone: foundationStack.hostedZone,
    sesIdentity: foundationStack.sesIdentity
});
