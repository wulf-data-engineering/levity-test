import { Construct } from "constructs";
import * as cdk from "aws-cdk-lib";
import * as route53 from "aws-cdk-lib/aws-route53";

export interface DomainConfig {
  domainName: string; // FQDN (e.g. "staging.example.com")
  hostedZone: route53.IHostedZone;
}

export interface DeploymentConfig {
  mode: "local" | "sandbox" | "environment";
  aws: boolean;
  removalPolicy: cdk.RemovalPolicy;
  autoDeleteObjects: boolean;
  terminationProtection: boolean;
  domain?: DomainConfig;
  skipBuild?: boolean;
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
 * AWS modes support optional domain configuration via CDK context variables:
 * `-c domain=sandbox example.com [-c hostedZoneId=Z123456ABCDEFG]`.
 * The domain will be used for CloudFront distribution, API Gateway & Cognito user pool.
 *
 * In constructs check for `aws` flag to decided whether resources could & should be deployed to localstack.
 * - Cognito is omitted (replaced by cognito-local)
 * - CloudFront & frontend bucket is omitted (replaced by npm run dev)
 * - Lambdas are proxied to local cargo lambda watch server
 * - API Gateway is omitted (replaced by direct calls to cargo lambda watch)
 */
export function loadDeploymentConfig(scope: Construct): DeploymentConfig {
  const skipBuild = scope.node.tryGetContext("skipBuild") === true || scope.node.tryGetContext("skipBuild") === "true";

  // Check for Localstack & Lambda Proxy mode
  const awsEndpointUrl = process.env.AWS_ENDPOINT_URL;
  const dev = awsEndpointUrl && awsEndpointUrl.startsWith("http://");
  if (dev) {
    return {
      mode: "local",
      aws: false,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
      terminationProtection: false,
      skipBuild,
    };
  }

  // Use a domain if provided in a non-local mode (-c domain=...)
  const domainName = scope.node.tryGetContext("domain");
  const hostedZoneId = scope.node.tryGetContext("hostedZoneId");

  let domain: DomainConfig | undefined;
  if (domainName) {
    let hostedZone;
    if (hostedZoneId) {
      hostedZone = route53.HostedZone.fromHostedZoneAttributes(scope, "Zone", {
        hostedZoneId,
        zoneName: domainName,
      });
    } else {
      hostedZone = route53.HostedZone.fromLookup(scope, "Zone", {
        domainName: domainName,
      });
    }
    domain = {
      domainName,
      hostedZone,
    };
  }

  // Check CDK Context (-c mode=sandbox)
  const mode = scope.node.tryGetContext("mode") || "stage";
  if (mode === "sandbox") {
    return {
      mode: "sandbox",
      aws: true,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
      terminationProtection: false,
      domain,
      skipBuild,
    };
  }

  return {
    mode: "environment",
    aws: true,
    // Protects data on delete/update, but cleans up if initial creation fails (rollback).
    removalPolicy: cdk.RemovalPolicy.RETAIN_ON_UPDATE_OR_DELETE,
    autoDeleteObjects: false,
    terminationProtection: true,
    domain,
    skipBuild,
  };
}
