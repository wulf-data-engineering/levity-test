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

    // --- domain & email setup ---
    if (props.deploymentConfig.domain) {
      const { domainName, hostedZone } = props.deploymentConfig.domain;

      // create SES Identity (verifies the domain for sending), same region as the pool required
      const sesIdentity = new ses.EmailIdentity(this, "SesIdentity", {
        identity: ses.Identity.domain(domainName),
        dkimSigning: true,
      });

      // add DKIM Records to Route53 (required for deliverability)
      // proves domain ownership and prevents emails from going to spam
      sesIdentity.dkimRecords.forEach((record, index) => {
        new route53.CnameRecord(this, `DkimRecord${index}`, {
          zone: hostedZone,
          recordName: record.name,
          domainName: record.value,
        });
      });

      // Configure User Pool to use this SES Identity
      userPoolEmail = cognito.UserPoolEmail.withSES({
        sesRegion: cdk.Stack.of(this).region, // Must match stack region
        fromEmail: `no-reply@levity-test.wulf.technology`,
        fromName: "Tool-Set Project",
        replyTo: `no-reply@levity-test.wulf.technology`,
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
