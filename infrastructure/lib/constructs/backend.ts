import { Construct } from 'constructs';
import * as apigateway from 'aws-cdk-lib/aws-apigateway';
import * as cognito from 'aws-cdk-lib/aws-cognito';
import { Api } from './backend/api';
import { Identity } from './backend/identity';
import { Server } from './backend/server';
import { AppConfig } from '../config';
import * as route53 from 'aws-cdk-lib/aws-route53';
import * as ses from 'aws-cdk-lib/aws-ses';
import { VersionedTable } from './backend/dynamodb';
import { AttributeType, ProjectionType } from 'aws-cdk-lib/aws-dynamodb';

export interface BackendProps {
  config: AppConfig;
  hostedZone?: route53.IHostedZone;
}

/**
 * Sets up the backend resources.
 * Exposes the /api entrypoint for CloudFront.
 * Exposes the Cognito User Pool for authentication from frontend.
 */
export class Backend extends Construct {
  public readonly restApi?: apigateway.RestApi;
  public readonly userPool?: cognito.UserPool;
  public readonly userPoolClient?: cognito.UserPoolClient;

  constructor(scope: Construct, id: string, props: BackendProps) {
    super(scope, id);
    const { config } = props;

    const usersTable = new VersionedTable(this, 'UsersTable', {
      tableName: 'users',
      removalPolicy: config.removalPolicy,
    });

    usersTable.addGlobalSecondaryIndex({
      indexName: 'email-index',
      partitionKey: {
        name: 'email',
        type: AttributeType.STRING,
      },
      projectionType: ProjectionType.ALL,
    });

    // Locally cognito-local and cargo lambda watch are used instead
    if (config.aws) {
      const identity = new Identity(this, 'Identity', {
        config,
        usersTable,
        hostedZone: props.hostedZone,
      });

      this.userPool = identity.userPool;
      this.userPoolClient = identity.userPoolClient;

      const server = new Server(this, 'Server', {
        config,
      });

      const api = new Api(this, 'Api', {
        config,
        userPool: this.userPool,
        usersTable,
        server,
      });
      this.restApi = api.gateway;
    }
  }
}
