import {Construct} from 'constructs';
import * as apigateway from 'aws-cdk-lib/aws-apigateway';
import * as cognito from 'aws-cdk-lib/aws-cognito';
import {FrontendStorage} from './frontend/storage';
import {FrontendDeployment} from './frontend/deployment';
import {DeploymentConfig} from "../config";
import {FrontendDistribution} from "./frontend/distribution";

interface FrontendProps {
    config: DeploymentConfig;
    backendApi?: apigateway.RestApi; // optionally forwards /api to backend API
    userPool?: cognito.IUserPool
    userPoolClient?: cognito.IUserPoolClient
}

export class Frontend extends Construct {
    constructor(scope: Construct, id: string, props: FrontendProps) {
        super(scope, id);
        console.assert(props.config.aws) // frontend only makes sense in AWS deployments

        const deploymentConfig = props.config;

        const storage = new FrontendStorage(this, 'Storage', {deploymentConfig});

        const distribution =
            new FrontendDistribution(this, 'Distribution', {
                deploymentConfig,
                siteBucket: storage.siteBucket,
                backendApi: props.backendApi
            });

        new FrontendDeployment(this, 'Deployment', {
            siteBucket: storage.siteBucket,
            distribution: distribution.distribution,
            userPool: props.userPool,
            userPoolClient: props.userPoolClient,
            deploymentConfig
        });
    }
}
