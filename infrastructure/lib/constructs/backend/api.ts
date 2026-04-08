import { Construct } from "constructs";
import * as apigateway from "aws-cdk-lib/aws-apigateway";
import { backendLambdaApi, backendLambda } from "./backend-lambda";
import { WebSocketLambdaAuthorizer } from "aws-cdk-lib/aws-apigatewayv2-authorizers";
import { WebSocketLambdaIntegration } from "aws-cdk-lib/aws-apigatewayv2-integrations";
import * as cognito from "aws-cdk-lib/aws-cognito";
import * as dynamodb from "aws-cdk-lib/aws-dynamodb";
import * as logs from "aws-cdk-lib/aws-logs";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as cdk from "aws-cdk-lib";
import { DeploymentConfig } from "../../config";
import * as apigatewayv2 from "aws-cdk-lib/aws-apigatewayv2";
import * as sqs from "aws-cdk-lib/aws-sqs";
import * as ssm from "aws-cdk-lib/aws-ssm";
import * as iam from "aws-cdk-lib/aws-iam";
import { SqsEventSource } from "aws-cdk-lib/aws-lambda-event-sources";
interface ApiProps {
  deploymentConfig: DeploymentConfig;
  userPool: cognito.IUserPool;
  usersTable: dynamodb.ITable;
  websocketConnectionsTable: dynamodb.ITable;
  processQueue: sqs.IQueue;
  processorFunction: lambda.Function;
}

/**
 * Sets up the API Gateway with a resource /api as entrypoint for CloudFront.
 *
 * Sets up the API Lambda functions of the backend and routes them.
 */
export class Api extends Construct {
  public readonly gateway: apigateway.RestApi;
  public readonly authorizer: apigateway.CognitoUserPoolsAuthorizer;
  public readonly apiRoot: apigateway.Resource;
  public readonly webSocketApi: apigatewayv2.WebSocketApi;
  public readonly webSocketStage: apigatewayv2.WebSocketStage;

  constructor(scope: Construct, id: string, props: ApiProps) {
    super(scope, id);

    this.gateway = this.setupApi(props);

    this.apiRoot = this.gateway.root.addResource("api");

    const authorizer = new apigateway.CognitoUserPoolsAuthorizer(
      this,
      "CognitoAuth",
      {
        cognitoUserPools: [props.userPool],
      },
    );
    authorizer._attachToApi(this.gateway); // required until some lambda uses it

    const passwordPolicyFunction = backendLambdaApi(
      this,
      "PasswordPolicyFunction",
      {
        deploymentConfig: props.deploymentConfig,
        apiRoot: this.apiRoot,
        binaryName: "password-policy",
        environment: {
          USER_POOL_ID: props.userPool.userPoolId,
        },
      },
    );

    const userProfileFunction = backendLambdaApi(
      this,
      "UserProfileFunction",
      {
        deploymentConfig: props.deploymentConfig,
        apiRoot: this.apiRoot,
        binaryName: "user-profile",
        environment: {
          USERS_TABLE_NAME: props.usersTable.tableName,
          USER_POOL_ID: props.userPool.userPoolId,
        },
        authorizer,
      },
    );
    props.usersTable.grantReadData(userProfileFunction);

    const processFunction = backendLambdaApi(
      this,
      "ProcessFunction",
      {
        deploymentConfig: props.deploymentConfig,
        apiRoot: this.apiRoot,
        binaryName: "process",
        authorizer,
      }
    );
    props.websocketConnectionsTable.grantReadWriteData(processFunction);
    props.processQueue.grantSendMessages(processFunction);
    
    processFunction.addToRolePolicy(new iam.PolicyStatement({
      actions: ["ssm:GetParameter"],
      resources: [`arn:aws:ssm:${cdk.Stack.of(this).region}:${cdk.Stack.of(this).account}:parameter/app/*`],
    }));

    // WebSocket Implementation (V2 API)
    this.setupWebSocketApi(props, processFunction);

    // Grant the lambda permission to describe the user pool
    props.userPool.grant(
      passwordPolicyFunction,
      "cognito-idp:DescribeUserPool",
    );
  }

  private setupWebSocketApi(props: ApiProps, processFunction: lambda.Function) {

    // a. Authorizer Lambda
    const authFunction = backendLambda(this, "CognitoAuthorizerFunction", {
      deploymentConfig: props.deploymentConfig,
      binaryName: "cognito-authorizer",
      environment: {
        USER_POOL_ID: props.userPool.userPoolId,
      },
    });

    const webSocketAuthorizer = new WebSocketLambdaAuthorizer("WebSocketAuthorizer", authFunction, {
      identitySource: ["route.request.header.Sec-WebSocket-Protocol"],
    });

    // b. WebSocket Handler Lambda
    const websocketFunction = backendLambda(this, "WebsocketFunction", {
      deploymentConfig: props.deploymentConfig,
      binaryName: "websocket",
    });
    props.websocketConnectionsTable.grantReadWriteData(websocketFunction);
    
    websocketFunction.addToRolePolicy(new iam.PolicyStatement({
      actions: ["ssm:GetParameter"],
      resources: [`arn:aws:ssm:${cdk.Stack.of(this).region}:${cdk.Stack.of(this).account}:parameter/app/*`],
    }));

    // c. WebSocket API
    (this as any).webSocketApi = new apigatewayv2.WebSocketApi(this, "WebSocketApi", {
      connectRouteOptions: {
        integration: new WebSocketLambdaIntegration("ConnectIntegration", websocketFunction),
        authorizer: webSocketAuthorizer,
      },
      disconnectRouteOptions: {
        integration: new WebSocketLambdaIntegration("DisconnectIntegration", websocketFunction),
      },
      defaultRouteOptions: {
        integration: new WebSocketLambdaIntegration("DefaultIntegration", websocketFunction),
      },
    });

    (this as any).webSocketStage = new apigatewayv2.WebSocketStage(this, "WebSocketStage", {
      webSocketApi: this.webSocketApi,
      stageName: "prod",
      autoDeploy: true,
    });

    // d. Permissions for process function to push updates
    this.webSocketApi.grantManageConnections(processFunction);
    processFunction.addEnvironment("WEBSOCKET_API_URL", this.webSocketStage.callbackUrl);

    // Provide WebSocket API to processor lambda
    props.processorFunction.addEnvironment(
      "WEBSOCKET_API_URL",
      this.webSocketStage.callbackUrl,
    );
    this.webSocketApi.grantManageConnections(props.processorFunction);
  }

  private setupApi(props: ApiProps) {
    const stageName = "prod";

    const accessLogGroup = new logs.LogGroup(this, "AccessLogs", {
      logGroupName: "API-Gateway-Access-Logs",
      retention: logs.RetentionDays.THREE_DAYS,
      removalPolicy: props.deploymentConfig.removalPolicy,
    });

    const gateway = new apigateway.RestApi(this, "RestApi", {
      defaultCorsPreflightOptions: {
        allowOrigins: apigateway.Cors.ALL_ORIGINS,
        allowMethods: apigateway.Cors.ALL_METHODS,
      },
      cloudWatchRole: true,
      // register Protocol Buffers as a binary type
      binaryMediaTypes: ["application/x-protobuf", "application/octet-stream"],
      deployOptions: {
        stageName,
        loggingLevel: apigateway.MethodLoggingLevel.INFO,
        dataTraceEnabled: false, // would log full payloads (great for dev, disabled for high-volume prod)
        tracingEnabled: true, // Enable X-Ray Tracing
        accessLogDestination: new apigateway.LogGroupLogDestination(
          accessLogGroup,
        ),
        accessLogFormat: apigateway.AccessLogFormat.jsonWithStandardFields(),
      },
    });

    const executionLogGroup = new logs.LogGroup(this, "ExecutionLogs", {
      logGroupName: `API-Gateway-Execution-Logs_${gateway.restApiId}/${stageName}`,
      retention: logs.RetentionDays.THREE_DAYS,
      removalPolicy: props.deploymentConfig.removalPolicy,
    });

    // This prevents the Stage from auto-creating a "Never Expire" log group
    // which causes the "Resource already exists" error in CloudFormation.
    gateway.deploymentStage.node.addDependency(executionLogGroup);

    return gateway;
  }
}
