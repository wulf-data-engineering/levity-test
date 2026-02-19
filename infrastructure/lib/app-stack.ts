import * as cdk from "aws-cdk-lib";
import { Construct } from "constructs";
import { Backend } from "./constructs/backend";
import { loadDeploymentConfig } from "./config";
import { Frontend } from "./constructs/frontend";
import * as route53 from "aws-cdk-lib/aws-route53";
import * as ses from "aws-cdk-lib/aws-ses";

interface AppStackProps extends cdk.StackProps {
    hostedZone?: route53.IHostedZone;
    sesIdentity?: ses.IEmailIdentity;
}

export class AppStack extends cdk.Stack {
    constructor(scope: Construct, id: string, props?: AppStackProps) {
        super(scope, id, props);

        let config = loadDeploymentConfig(this);

        this.terminationProtection = config.terminationProtection;

        const backend = new Backend(this, 'Backend', {
            config,
            hostedZone: props?.hostedZone,
            sesIdentity: props?.sesIdentity
        });

        // Locally npm run dev is used instead
        if (config.aws) {
            new Frontend(this, 'Frontend', {
                config,
                backendApi: backend.restApi,
                userPool: backend.userPool,
                userPoolClient: backend.userPoolClient,
                hostedZone: props?.hostedZone 
            });
        }
    }
}
