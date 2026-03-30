import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as acm from 'aws-cdk-lib/aws-certificatemanager';
import { loadDeploymentConfig } from './config';

export class CertificateStack extends cdk.Stack {
    public readonly certificateArn?: string;

    constructor(scope: Construct, id: string, props?: cdk.StackProps) {
        super(scope, id, props);

        const config = loadDeploymentConfig(this);
        const domainConfig = config.domain;

        if (domainConfig && domainConfig.hostedZone) {
            const certificate = new acm.Certificate(this, 'SiteCert', {
                domainName: domainConfig.domainName,
                // Validates via the hostedZone provided through domainConfig
                validation: acm.CertificateValidation.fromDns(domainConfig.hostedZone),
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
