import * as cdk from "aws-cdk-lib";
import {Construct} from "constructs";
import {Backend} from "./constructs/backend";
import {loadDeploymentConfig} from "./config";
import {Frontend} from "./constructs/frontend";

export class CdkStack extends cdk.Stack {
    constructor(scope: Construct, id: string, props?: cdk.StackProps) {
        super(scope, id, props);

        let config = loadDeploymentConfig(scope);

        this.terminationProtection = config.terminationProtection;

        const backend = new Backend(this, 'Backend', {config});

        // Locally npm run dev is used instead
        if (config.aws) {
            new Frontend(this, 'Frontend', {
                config,
                backendApi: backend.restApi,
                userPool: backend.userPool,
                userPoolClient: backend.userPoolClient
            });
        }
    }
}
