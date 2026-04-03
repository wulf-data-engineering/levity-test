import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as route53 from 'aws-cdk-lib/aws-route53';
import * as ses from 'aws-cdk-lib/aws-ses';
import { DeploymentConfig } from './config';
import * as iam from 'aws-cdk-lib/aws-iam';

export interface FoundationStackProps extends cdk.StackProps {
  deploymentConfig: DeploymentConfig;
  githubRepo: string;
}

/**
 * This stack deploys stable infrastructure:
 * - IAM roles for GitHub Actions
 * - Hosted zone for the domain
 * - SES for sending emails
 *
 * IMPORTANT: For the staging subdomain to work, it must be delegated by the the production hosted zone.
 * Therefore, in production environment the foundation stack required the flag `stagingNameServers`:
 *
 * ```bash
 * cdk deploy FoundationStack -c environment=production -c domain=example.com -c stagingNameServers="ns1.example.com,ns2.example.com,ns3.example.com,ns4.example.com"
 * ```
 */
export class FoundationStack extends cdk.Stack {
  public readonly hostedZone?: route53.IHostedZone;
  public readonly sesIdentity?: ses.EmailIdentity;

  constructor(scope: Construct, id: string, props: FoundationStackProps) {
    super(scope, id, props);

    const config = props.deploymentConfig;

    // Hosted Zone (DNS for the domain)
    this.hostedZone = new route53.PublicHostedZone(this, 'HostedZone', {
      zoneName: config.domainName!,
    });

    // SES Identity (allows app and Cognito to send emails from the domain)
    this.sesIdentity = new ses.EmailIdentity(this, 'SesIdentity', {
      identity: ses.Identity.domain(config.domainName!),
      dkimSigning: true,
    });

    // DKIM Records (configures DNS entries to verify the SES identity)
    this.sesIdentity.dkimRecords.forEach((record: any, index: number) => {
      // record.name is something like "token._domainkey.example.com"
      // We need just "token._domainkey"
      // Since it's a Token, we use CloudFormation intrinsic functions
      const recordName = cdk.Fn.select(0, cdk.Fn.split(`.${config.domainName}`, record.name));

      new route53.CnameRecord(this, `DkimRecord${index}`, {
        zone: this.hostedZone!,
        recordName: recordName,
        domainName: record.value,
      });
    });

    // GitHub Actions Role with OIDC (used by CD to deploy the application)
    const githubProvider = new iam.OpenIdConnectProvider(this, 'GitHubOIDCProvider', {
      url: 'https://token.actions.githubusercontent.com',
      clientIds: ['sts.amazonaws.com'],
    });

    const githubRole = new iam.Role(this, 'GitHubActionRole', {
      assumedBy: new iam.WebIdentityPrincipal(githubProvider.openIdConnectProviderArn, {
        StringLike: {
          'token.actions.githubusercontent.com:sub': `repo:${props.githubRepo}:*`,
        },
      }),
      description: 'Role for GitHub Actions to deploy stacks',
      roleName: 'GitHubActionRole',
    });

    // Grant limited permissions to deploy CDK stacks instead of AdministratorAccess
    githubRole.addToPolicy(
      new iam.PolicyStatement({
        actions: ['sts:AssumeRole'],
        resources: ['arn:aws:iam::*:role/cdk-*'], // Allow assuming CDK execution roles
        effect: iam.Effect.ALLOW,
      }),
    );

    githubRole.addToPolicy(
      new iam.PolicyStatement({
        actions: ['cloudformation:*'],
        resources: ['*'],
        effect: iam.Effect.ALLOW,
      }),
    );

    githubRole.addToPolicy(
      new iam.PolicyStatement({
        actions: ['s3:*', 'ecr:*', 'ssm:GetParameter*'],
        resources: ['*'],
        effect: iam.Effect.ALLOW,
      }),
    );

    // Explicitly Deny highly sensitive or destructive structural changes
    githubRole.addToPolicy(
      new iam.PolicyStatement({
        actions: [
          'iam:CreateUser',
          'iam:DeleteUser',
          'iam:CreateAccessKey',
          'iam:DeleteAccessKey',
          'organizations:*',
          'account:*',
          'billing:*',
          'route53:DeleteHostedZone',
          'cloudtrail:StopLogging',
          'cloudtrail:DeleteTrail',
          'backup:Delete*',
          'dynamodb:DeleteBackup',
          'rds:DeleteDBCluster',
          'rds:DeleteDBInstance',
          's3:DeleteBucket',
        ],
        resources: ['*'],
        effect: iam.Effect.DENY,
      }),
    );

    new cdk.CfnOutput(this, 'GitHubRoleArn', {
      value: githubRole.roleArn,
      description: 'ARN of the GitHub Actions Role',
    });

    if (this.hostedZone.hostedZoneNameServers) {
      new cdk.CfnOutput(this, 'HostedZoneNameServers', {
        value: cdk.Fn.join(',', this.hostedZone.hostedZoneNameServers),
        description:
          'Name Servers for the Hosted Zone. Provide these to the parent domain registrar or delegation record.',
      });
    }

    new cdk.CfnOutput(this, 'HostedZoneId', {
      value: this.hostedZone.hostedZoneId,
      description:
        'Hosted Zone ID for this environment. Provide this to the AppStack GitHub Actions variables.',
    });

    // Cross-Account Staging Delegation
    const stagingNameServersStr = scope.node.tryGetContext('stagingNameServers');
    const environment = config.environment;

    if (stagingNameServersStr) {
      if (environment === 'production') {
        const stagingNameServers = stagingNameServersStr.split(',').map((ns: string) => ns.trim());
        new route53.ZoneDelegationRecord(this, 'StagingDelegation', {
          zone: this.hostedZone!,
          recordName: 'staging',
          nameServers: stagingNameServers,
        });
      } else {
        throw new Error(
          '❌ "stagingNameServers" context variable is only allowed for production deployments.',
        );
      }
    }
  }
}
