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

      // --- Race Condition Fix ---
      // Cognito requires the email to be verified immediately upon creation.
      // SES DNS verification takes time. We need a waiter.
      const verifier = new cdk.CustomResource(this, "SesVerifier", {
        serviceToken: new lambda.Function(this, "SesVerifierLambda", {
          runtime: lambda.Runtime.NODEJS_20_X,
          handler: "index.handler",
          timeout: cdk.Duration.minutes(15), // Allow enough time for DNS propagation
          code: lambda.Code.fromInline(`
            const { SESClient, GetIdentityVerificationAttributesCommand } = require("@aws-sdk/client-ses");
            const ses = new SESClient();

            exports.handler = async (event) => {
              if (event.RequestType === 'Delete') return { PhysicalResourceId: event.PhysicalResourceId };

              const identity = event.ResourceProperties.Identity;
              const maxRetries = 40; // ~4-5 minutes
              const delay = 5000;

              for (let i = 0; i < maxRetries; i++) {
                try {
                  console.log("Checking verification status for:", identity);
                  const data = await ses.send(new GetIdentityVerificationAttributesCommand({ Identities: [identity] }));
                  const attrs = data.VerificationAttributes[identity];
                  
                  if (attrs && attrs.VerificationStatus === 'Success') {
                   console.log("Verified!");
                   return { PhysicalResourceId: "ses-verifier-" + identity };
                  }
                  console.log("Status:", attrs ? attrs.VerificationStatus : "Unknown", "- Retrying...");
                } catch (e) {
                  console.log("Error checking status:", e);
                }
                await new Promise(r => setTimeout(r, delay));
              }
              throw new Error("SES Identity verification timed out for " + identity);
            };
          `),
          initialPolicy: [
            new cdk.aws_iam.PolicyStatement({
              actions: ["ses:GetIdentityVerificationAttributes"],
              resources: ["*"],
            }),
          ],
        }).functionArn,
        properties: {
          Identity: domainName,
          // Add a random property to force re-check on update if needed, 
          // or rely on Identity change.
          Timestamp: new Date().toISOString(), 
        },
      });

      // Ensure the Waiter runs AFTER the DKIM records are created
      // (The records must be in Route53 for SES to verify)
      sesIdentity.dkimRecords.forEach((record, index) => {
         const dkimRecord = this.node.tryFindChild(`DkimRecord${index}`) as cdk.Construct;
         if(dkimRecord) {
             verifier.node.addDependency(dkimRecord);
         }
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
    
    // Ensure UserPool waits for the Verifier
    if (props.deploymentConfig.domain) {
        // We can't access 'verifier' scope here easily without restructuring block,
        // so we find it or move definition out. 
        // Let's refactor slightly to expose verifier.
        const verifier = this.node.tryFindChild("SesVerifier") as cdk.CustomResource;
        if (verifier) {
            this.userPool.node.addDependency(verifier);
        }
    }

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
