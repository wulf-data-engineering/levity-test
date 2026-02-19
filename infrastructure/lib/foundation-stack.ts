import * as cdk from "aws-cdk-lib";
import { Construct } from "constructs";
import * as route53 from "aws-cdk-lib/aws-route53";
import * as ses from "aws-cdk-lib/aws-ses";
import * as iam from "aws-cdk-lib/aws-iam";

export class FoundationStack extends cdk.Stack {
  public readonly hostedZone?: route53.IHostedZone;
  public readonly sesIdentity?: ses.EmailIdentity;

  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const domainName = scope.node.getContext("domain");
    const githubRepo = scope.node.getContext("githubRepo");

    // Hosted Zone (DNS for the domain)
    this.hostedZone = new route53.PublicHostedZone(this, 'HostedZone', {
        zoneName: domainName
    });

    // SES Identity (allows app and Cognito to send emails from the domain)
    this.sesIdentity = new ses.EmailIdentity(this, "SesIdentity", {
      identity: ses.Identity.domain(domainName),
      dkimSigning: true,
    });

    // DKIM Records (configures DNS entries to verify the SES identity)
    this.sesIdentity.dkimRecords.forEach((record, index) => {
      // record.name is something like "token._domainkey.example.com"
      // We need just "token._domainkey"
      // Since it's a Token, we use CloudFormation intrinsic functions
      const recordName = cdk.Fn.select(0, cdk.Fn.split(`.${domainName}`, record.name));
      
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
                'token.actions.githubusercontent.com:sub': `repo:${githubRepo}:*`
            }
        }),
        description: 'Role for GitHub Actions to deploy stacks',
        roleName: 'GitHubActionRole'
    });

    // Grant permissions to deploy CDK stacks
    // For now, let's give AdministratorAccess.
    githubRole.addManagedPolicy(iam.ManagedPolicy.fromAwsManagedPolicyName('AdministratorAccess'));

    new cdk.CfnOutput(this, 'GitHubRoleArn', {
        value: githubRole.roleArn,
        description: 'ARN of the GitHub Actions Role',
    });
  }
}
