import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { Backend } from './constructs/backend';
import { Frontend } from './constructs/frontend';
import { DeploymentConfig } from './config';
import * as route53 from 'aws-cdk-lib/aws-route53';

export interface AppStackProps extends cdk.StackProps {
  deploymentConfig: DeploymentConfig;
}

export class AppStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: AppStackProps) {
    super(scope, id, props);

    const config = props.deploymentConfig;

    this.terminationProtection = config.terminationProtection;

    const hostedZone = config.domainName
      ? route53.HostedZone.fromLookup(this, 'Zone', {
          domainName: config.domainName,
        })
      : undefined;

    const backend = new Backend(this, 'Backend', {
      config,
      hostedZone,
    });

    // Locally npm run dev is used instead
    if (config.aws) {
      new Frontend(this, 'Frontend', {
        config,
        backendApi: backend.restApi,
        userPool: backend.userPool,
        userPoolClient: backend.userPoolClient,
        hostedZone,
        certificateArn: this.node.tryGetContext('certificateArn'),
      });
    }
  }
}
