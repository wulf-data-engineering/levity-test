import { Construct } from 'constructs';
import * as cdk from 'aws-cdk-lib';
import * as route53 from 'aws-cdk-lib/aws-route53';

export interface DomainConfig {
  domainName: string; // FQDN (e.g. "staging.example.com")
}

export interface FoundationConfig {
  githubRepo: string;
  domain: string;
  productionAccountId?: string;
  stagingNameServers?: string;
  removalPolicy: cdk.RemovalPolicy;
}

export interface CertificateConfig {
  domain: string;
}

export interface AppConfig {
  mode: 'local' | 'sandbox' | 'environment';
  environment?: 'staging' | 'production';
  aws: boolean;
  removalPolicy: cdk.RemovalPolicy;
  autoDeleteObjects: boolean;
  terminationProtection: boolean;
  domain: DomainConfig;
  build: boolean;
  backendPath?: string;
  frontendPath?: string;
  imageDigest?: string;
  serverRepositoryArn?: string;
}

export interface DeploymentConfigs {
  foundation?: FoundationConfig;
  certificate?: CertificateConfig;
  app: AppConfig;
}

/**
 * Checks the current environment and loads the appropriate mode configuration.
 *
 * local mode for localstack is indicated by the presence of AWS_ENDPOINT_URL starting with "http://":
 * sandbox mode is indicated by the CDK context variable "mode" set to "sandbox". (`-c mode=sandbox`)
 * environment mode is the default if neither of the above conditions are met.
 *
 * local & sandbox modes use resource removal policies that allow easy cleanup.
 *
 * stage mode requires a domain configuration via CDK context variables:
 * `-c domain=sandbox example.com -c hostedZoneId=Z123456ABCDEFG`.
 * The domain will be used for CloudFront distribution, API Gateway & Cognito user pool.
 *
 * In constructs check for `aws` flag to decided whether resources could & should be deployed to localstack.
 * - Cognito is omitted (replaced by cognito-local)
 * - CloudFront & frontend bucket is omitted (replaced by npm run dev)
 * - Lambdas are proxied to local cargo lambda watch server
 * - API Gateway is omitted (replaced by direct calls to cargo lambda watch)
 */
export function loadDeploymentConfigs(scope: Construct): DeploymentConfigs {
  const mode = scope.node.tryGetContext('mode') || 'environment';
  const environment = scope.node.tryGetContext('environment');

  // 1. Foundation Configuration
  const githubRepo = scope.node.tryGetContext('githubRepo');
  const domainName = scope.node.tryGetContext('domain');

  if (mode === 'environment' && !domainName) {
    throw new Error(
      '❌ Context variable "domain" is required for environment mode (staging/production).',
    );
  }

  let foundation: FoundationConfig | undefined;
  if (githubRepo) {
    foundation = {
      githubRepo,
      domain: domainName,
      productionAccountId: scope.node.tryGetContext('productionAccountId'),
      stagingNameServers: scope.node.tryGetContext('stagingNameServers'),
      removalPolicy:
        mode === 'local' || mode === 'sandbox'
          ? cdk.RemovalPolicy.DESTROY
          : cdk.RemovalPolicy.RETAIN_ON_UPDATE_OR_DELETE,
    };
  }

  // 2. Certificate Configuration
  let certificate: CertificateConfig | undefined;
  if (domainName) {
    certificate = {
      domain: domainName
    };
  }

  // 3. App Configuration
  const backendPath = scope.node.tryGetContext('backendPath');
  const frontendPath = scope.node.tryGetContext('frontendPath');
  const explicitBuild = scope.node.tryGetContext('build');
  const imageDigest = scope.node.tryGetContext('imageDigest');
  const serverRepositoryArn = scope.node.tryGetContext('serverRepositoryArn');

  let build = false;
  if (explicitBuild === 'true' || explicitBuild === true) {
    build = true;
  }

  // Check for Localstack
  const awsEndpointUrl = process.env.AWS_ENDPOINT_URL;
  const isLocal = awsEndpointUrl && awsEndpointUrl.startsWith('http://');

  let appMode: 'local' | 'sandbox' | 'environment' = isLocal
    ? 'local'
    : mode === 'sandbox'
      ? 'sandbox'
      : 'environment';

  if (appMode === 'environment' && environment !== 'staging' && environment !== 'production') {
    throw new Error(
      '❌ Context variable "environment" is required and must be either "staging" or "production" when mode is "environment".',
    );
  }



  const app: AppConfig = {
    mode: appMode,
    environment: environment as 'staging' | 'production' | undefined,
    aws: appMode !== 'local',
    removalPolicy:
      appMode === 'environment'
        ? cdk.RemovalPolicy.RETAIN_ON_UPDATE_OR_DELETE
        : cdk.RemovalPolicy.DESTROY,
    autoDeleteObjects: appMode !== 'environment',
    terminationProtection: appMode === 'environment',
    domain: { domainName: domainName || 'localhost' },
    build,
    backendPath,
    frontendPath,
    imageDigest,
    serverRepositoryArn,
  };

  return { foundation, certificate, app };
}
