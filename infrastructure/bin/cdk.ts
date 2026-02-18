#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib';
import {CdkStack} from '../lib/cdk-stack';

const app = new cdk.App();
const isLocal = process.env.AWS_ENDPOINT_URL?.startsWith('http://') ?? false;

new CdkStack(app, 'CdkStack', {
    env: {
        account: isLocal ? '000000000000' : process.env.CDK_DEFAULT_ACCOUNT,
        region: isLocal ? 'eu-central-1' : process.env.CDK_DEFAULT_REGION
    },
});
