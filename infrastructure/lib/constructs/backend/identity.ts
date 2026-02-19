import { Construct } from "constructs";
import * as cognito from "aws-cdk-lib/aws-cognito";
import * as route53 from "aws-cdk-lib/aws-route53";
import * as ses from "aws-cdk-lib/aws-ses";
import * as cdk from "aws-cdk-lib";
import * as lambda from "aws-cdk-lib/aws-lambda";
import { backendLambda } from "./backend-lambda";
import { DeploymentConfig } from "../../config";

import { Table } from "aws-cdk-lib/aws-dynamodb";

interface IdentityProps {
  deploymentConfig: DeploymentConfig;
  usersTable: Table;
  // Optional: Pass existing network resources
  hostedZone?: route53.IHostedZone;
}

export class Identity extends Construct {
  public readonly userPool: cognito.UserPool;
  public readonly userPoolClient: cognito.UserPoolClient;
  public readonly cognitoHandler: lambda.Function;

  constructor(scope: Construct, id: string, props: IdentityProps) {
    super(scope, id);

    // set up the Lifecycle Lambda function
    this.cognitoHandler = backendLambda(this, "CognitoHandlerFunction", {
      deploymentConfig: props.deploymentConfig,
      binaryName: "cognito-handler",
      environment: {
        USERS_TABLE_NAME: props.usersTable.tableName,
      },
    });

    props.usersTable.grantReadWriteData(this.cognitoHandler);

    let userPoolEmail: cognito.UserPoolEmail | undefined = undefined;
    let verifier: cdk.CustomResource | undefined = undefined; // Declare verifier here to make it accessible later

    // --- domain & email setup ---
    if (props.deploymentConfig.domain) {
      const { domainName } = props.deploymentConfig.domain;

      // We assume the identity name is the domain name and it was created by FoundationStack
      // We just need to reference it to configure the User Pool valid sender
      userPoolEmail = cognito.UserPoolEmail.withSES({
          sesRegion: cdk.Stack.of(this).region,
          fromEmail: `no-reply@${domainName}`,
          fromName: "Tool-Set Project",
          replyTo: `no-reply@${domainName}`,
      });
    }

    this.userPool = new cognito.UserPool(this, "UserPool", {
      selfSignUpEnabled: true,
      signInAliases: { email: true },
      autoVerify: { email: true },
      accountRecovery: cognito.AccountRecovery.EMAIL_ONLY,
      email: userPoolEmail,
      passwordPolicy: {
        minLength: 8,
        requireSymbols: true,
      },
      lambdaTriggers: {
        preSignUp: this.cognitoHandler,
        postConfirmation: this.cognitoHandler,
        customMessage: this.cognitoHandler,
      },
      removalPolicy: props.deploymentConfig.removalPolicy,
    });

    this.userPoolClient = new cognito.UserPoolClient(this, "UserPoolClient", {
      userPool: this.userPool,
      generateSecret: false,
      authFlows: {
        userSrp: true,
      },
      preventUserExistenceErrors: true,
    });
  }
}
