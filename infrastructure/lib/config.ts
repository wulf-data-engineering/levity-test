import { Construct } from 'constructs';
import * as cdk from 'aws-cdk-lib';

export interface BuildConfig {
  build: boolean;
  backendPath?: string;
  frontendPath?: string;
}
export type Mode = 'local' | 'sandbox' | 'environment';
export type Environment = 'staging' | 'production';

export interface DeploymentConfig {
  mode: Mode;
  environment?: Environment;
  aws: boolean;
  removalPolicy: cdk.RemovalPolicy;
  autoDeleteObjects: boolean;
  terminationProtection: boolean;
  domainName?: string;
  buildConfig: BuildConfig;
}

/**
 * Checks the current environment and loads the appropriate mode configuration.
 *
 * local mode for localstack is indicated by the presence of AWS_ENDPOINT_URL starting with "http://":
 * environment mode is indicated by the 'environment' flag (staging|production) for AWS deployments (`-c environment=staging`).
 * sandbox mode is the default mode.
 *
 * local & sandbox modes don't use a domain name and are not intended for production use.
 * local, sandbox & staging environment use resource removal policies that allow easy cleanup.
 *
 * environment mode requires a domain name via CDK context variable:
 * `-c environment=staging -c domain=staging.example.com`.
 * The domain will be used for CloudFront distribution, API Gateway & Cognito user pool.
 *
 * In your own constructs check for `aws` flag to decided whether resources could & should be deployed to localstack.
 * - Cognito is omitted (replaced by cognito-local)
 * - CloudFront & frontend bucket is omitted (replaced by npm run dev)
 * - Lambdas are proxied to local cargo lambda watch server
 * - API Gateway is omitted (replaced by direct calls to cargo lambda watch)
 */
export function loadDeploymentConfig(scope: Construct): DeploymentConfig {
  let mode: Mode | undefined = scope.node.tryGetContext('mode');

  // Check for Localstack & Lambda Proxy mode
  const awsEndpointUrl = process.env.AWS_ENDPOINT_URL;
  const dev = awsEndpointUrl && awsEndpointUrl.startsWith('http://');

  if (!mode) {
    if (dev) {
      mode = 'local';
    } else if (scope.node.tryGetContext('environment')) {
      mode = 'environment';
    } else {
      mode = 'sandbox';
    }
  }

  // Identify the build mode
  const buildConfig: BuildConfig = {
    build:
      scope.node.tryGetContext('build') === 'true' || scope.node.tryGetContext('build') === true,
    backendPath: scope.node.tryGetContext('backendPath'),
    frontendPath: scope.node.tryGetContext('frontendPath'),
  };

  if (mode === 'local') {
    return {
      mode,
      aws: false,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
      terminationProtection: false,
      buildConfig: { build: false, backendPath: undefined, frontendPath: undefined },
    };
  } else if (mode === 'sandbox') {
    return {
      mode,
      aws: true,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
      terminationProtection: false,
      buildConfig,
    };
  } else if (mode === 'environment') {
    const environment = scope.node.tryGetContext('environment');
    if (environment !== 'staging' && environment !== 'production') {
      throw new Error(
        '❌ Context variable "environment" is required and must be either "staging" or "production" when mode is "environment".',
      );
    }

    const domainName = scope.node.tryGetContext('domain');
    if (!domainName) {
      throw new Error(
        '❌ Context variable "domain" is required for staging/production deployments.',
      );
    }

    let autoDeleteObjects = false;
    // Protects data on delete/update, but cleans up if initial creation fails (rollback).
    let removalPolicy = cdk.RemovalPolicy.RETAIN_ON_UPDATE_OR_DELETE;

    if (environment === 'staging') {
      // for faster intentional clean up on staging (termination protection is still activated)
      autoDeleteObjects = true;
      removalPolicy = cdk.RemovalPolicy.DESTROY;
    }

    return {
      mode,
      environment,
      aws: true,
      removalPolicy,
      autoDeleteObjects,
      terminationProtection: true,
      domainName,
      buildConfig,
    };
  } else {
    throw new Error(`Unknown mode: ${mode}`);
  }
}
