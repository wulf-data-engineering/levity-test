import { Construct } from 'constructs';
import * as apigateway from 'aws-cdk-lib/aws-apigateway';
import * as cognito from 'aws-cdk-lib/aws-cognito';
import { FrontendStorage } from './frontend/storage';
import { FrontendDeployment } from './frontend/deployment';
import { AppConfig } from '../config';
import { FrontendDistribution } from './frontend/distribution';
import * as route53 from 'aws-cdk-lib/aws-route53';

interface FrontendProps {
  config: AppConfig;
  backendApi?: apigateway.RestApi; // optionally forwards /api to backend API
  userPool?: cognito.IUserPool;
  userPoolClient?: cognito.IUserPoolClient;
  hostedZone?: route53.IHostedZone;
  certificateArn?: string;
}

export class Frontend extends Construct {
  constructor(scope: Construct, id: string, props: FrontendProps) {
    super(scope, id);
    console.assert(props.config.aws); // frontend only makes sense in AWS deployments

    const { config } = props;
    const storage = new FrontendStorage(this, 'Storage', { config });

    const distribution = new FrontendDistribution(this, 'Distribution', {
      config,
      siteBucket: storage.siteBucket,
      backendApi: props.backendApi,
      hostedZone: props.hostedZone,
      certificateArn: props.certificateArn,
    });

    new FrontendDeployment(this, 'Deployment', {
      siteBucket: storage.siteBucket,
      distribution: distribution.distribution,
      userPool: props.userPool,
      userPoolClient: props.userPoolClient,
      config,
    });
  }
}
