import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as acm from 'aws-cdk-lib/aws-certificatemanager';
import * as route53 from 'aws-cdk-lib/aws-route53';
import { CertificateConfig } from './config';

export interface CertificateStackProps extends cdk.StackProps {
  config: CertificateConfig;
}

export class CertificateStack extends cdk.Stack {
  public readonly certificateArn?: string;

  constructor(scope: Construct, id: string, props: CertificateStackProps) {
    super(scope, id, props);

    const { domain } = props.config;

    const hostedZone = route53.HostedZone.fromLookup(this, 'HostedZone', {
      domainName: domain,
    });

    if (hostedZone) {
      const certificate = new acm.Certificate(this, 'SiteCert', {
        domainName: domain,
        // Validates via the hostedZone
        validation: acm.CertificateValidation.fromDns(hostedZone),
      });

      this.certificateArn = certificate.certificateArn;

      // Output the ARN for traceability
      new cdk.CfnOutput(this, 'CertificateArnOutput', {
        value: certificate.certificateArn,
        description: 'ARN of the us-east-1 ACM Certificate',
      });
    }
  }
}
