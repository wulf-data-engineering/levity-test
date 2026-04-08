import * as cdk from 'aws-cdk-lib';
import * as apigateway from 'aws-cdk-lib/aws-apigateway';
import * as cognito from 'aws-cdk-lib/aws-cognito';
import { AttributeType, ProjectionType } from 'aws-cdk-lib/aws-dynamodb';
import * as route53 from 'aws-cdk-lib/aws-route53';
import * as sqs from 'aws-cdk-lib/aws-sqs';
import * as ssm from 'aws-cdk-lib/aws-ssm';
import { Construct } from 'constructs';
import { DeploymentConfig } from '../config';
import { Api } from './backend/api';
import { VersionedTable } from './backend/dynamodb';
import { Identity } from './backend/identity';
import { backendLambda } from './backend/backend-lambda';
import { SqsEventSource } from 'aws-cdk-lib/aws-lambda-event-sources';

export interface BackendProps {
  config: DeploymentConfig;
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
  public readonly webSocketUrl?: string;

  constructor(scope: Construct, id: string, props: BackendProps) {
    super(scope, id);
    const deploymentConfig = props.config;

    const usersTable = new VersionedTable(this, 'UsersTable', {
      tableName: 'users',
      removalPolicy: deploymentConfig.removalPolicy,
    });

    usersTable.addGlobalSecondaryIndex({
      indexName: 'email-index',
      partitionKey: {
        name: 'email',
        type: AttributeType.STRING,
      },
      projectionType: ProjectionType.ALL,
    });

    const websocketConnectionsTable = new VersionedTable(this, 'WebsocketConnectionsTable', {
      tableName: 'websocket-connections',
      partitionKey: 'userId',
      sortKey: 'topicId',
      timeToLiveAttribute: 'ttl',
      removalPolicy: deploymentConfig.removalPolicy,
    });

    websocketConnectionsTable.addGlobalSecondaryIndex({
      indexName: 'topic-index',
      partitionKey: {
        name: 'topicId',
        type: AttributeType.STRING,
      },
      projectionType: ProjectionType.ALL,
    });

    const processQueue = new sqs.Queue(this, "ProcessQueue", {
      visibilityTimeout: cdk.Duration.seconds(300), // Random wait requires more time
      removalPolicy: props.config.removalPolicy,
      queueName: "process-queue",
    });

    new ssm.StringParameter(this, "ProcessQueueUrlParam", {
      parameterName: "/app/process-queue-url",
      stringValue: processQueue.queueUrl,
    });

    new ssm.StringParameter(this, "WebsocketConnectionsTableParam", {
      parameterName: "/app/websocket-connections-table-name",
      stringValue: websocketConnectionsTable.tableName,
    });

    const processorFunction = backendLambda(this, "ProcessorFunction", {
      deploymentConfig: props.config,
      binaryName: "processor",
      timeout: cdk.Duration.seconds(300),
    });

    processorFunction.addEventSource(new SqsEventSource(processQueue, {
      batchSize: 10,
    }));
    websocketConnectionsTable.grantReadWriteData(processorFunction);
    usersTable.grantReadData(processorFunction);

    // Locally cognito-local and cargo lambda watch are used instead
    if (deploymentConfig.aws) {
      const identity = new Identity(this, 'Identity', {
        deploymentConfig,
        usersTable,
        hostedZone: props.hostedZone,
      });

      this.userPool = identity.userPool;
      this.userPoolClient = identity.userPoolClient;

      const api = new Api(this, 'Api', {
        deploymentConfig,
        userPool: this.userPool,
        usersTable,
        websocketConnectionsTable,
        processQueue,
        processorFunction,
      });

      this.restApi = api.gateway;
      this.webSocketUrl = api.webSocketStage.callbackUrl;
    }
  }
}
