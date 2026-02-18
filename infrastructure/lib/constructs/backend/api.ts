import { Construct } from "constructs";
import * as apigateway from "aws-cdk-lib/aws-apigateway";
import { backendLambdaApi } from "./backend-lambda";
import * as cognito from "aws-cdk-lib/aws-cognito";
import * as dynamodb from "aws-cdk-lib/aws-dynamodb";
import * as logs from "aws-cdk-lib/aws-logs";
import { DeploymentConfig } from "../../config";

interface ApiProps {
  deploymentConfig: DeploymentConfig;
  userPool: cognito.IUserPool;
  usersTable: dynamodb.ITable;
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

    // Grant the lambda permission to describe the user pool
    props.userPool.grant(
      passwordPolicyFunction,
      "cognito-idp:DescribeUserPool",
    );
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
