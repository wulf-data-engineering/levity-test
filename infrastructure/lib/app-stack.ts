import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { Backend } from './constructs/backend';
import { AppConfig } from './config';
import { Frontend } from './constructs/frontend';
import * as route53 from 'aws-cdk-lib/aws-route53';

export interface AppStackProps extends cdk.StackProps {
  certificateArn?: string;
  config: AppConfig;
}

export class AppStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: AppStackProps) {
    super(scope, id, props);

    const { config } = props;
    const domainName = config.domain.domainName;
    const isLocal = config.mode === 'local';

    const hostedZone = !isLocal ? route53.HostedZone.fromLookup(this, 'Zone', {
      domainName,
    }) : undefined;

    this.terminationProtection = config.terminationProtection;

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
        certificateArn: props?.certificateArn,
      });
    }
  }
}
