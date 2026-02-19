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
  sesIdentity?: ses.IEmailIdentity;
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
      const { domainName, hostedZone: hostedZoneConfig } = props.deploymentConfig.domain;

      let hostedZone = props.hostedZone;
      let sesIdentity = props.sesIdentity;

      // Create resources if not passed in
      if (!hostedZone && hostedZoneConfig) {
         // Fallback or self-managed mode (e.g. Sandbox)
         hostedZone = hostedZoneConfig; 
      }

      let dkimRecordsCreatedHere: Construct[] = [];
      let newIdentity: ses.EmailIdentity | undefined;

      if (!sesIdentity) {
          // Create SES Identity (verifies the domain for sending), same region as the pool required
          newIdentity = new ses.EmailIdentity(this, "SesIdentity", {
            identity: ses.Identity.domain(domainName),
            dkimSigning: true,
          });
          sesIdentity = newIdentity;
          
          // Only create DKIM records if we are creating the identity AND have the zone
          if (hostedZone) {
               // add DKIM Records to Route53 (required for deliverability)
               newIdentity.dkimRecords.forEach((record, index) => {
                 new route53.CnameRecord(this, `DkimRecord${index}`, {
                   zone: hostedZone as route53.IHostedZone,
                   recordName: record.name,
                   domainName: record.value,
                 });
               });
          }
      }
      
      // If we have an identity (passed or created), use it for UserPool
      if (sesIdentity) {
        // Configure User Pool to use this SES Identity
        userPoolEmail = cognito.UserPoolEmail.withSES({
            sesRegion: cdk.Stack.of(this).region,
            fromEmail: `no-reply@${domainName}`, // Use dynamic domain name
            fromName: "Tool-Set Project",
            replyTo: `no-reply@${domainName}`,
        });
      }
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
