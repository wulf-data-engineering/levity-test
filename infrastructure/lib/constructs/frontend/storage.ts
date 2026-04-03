import {Construct} from 'constructs';
import * as s3 from 'aws-cdk-lib/aws-s3';
import {DeploymentConfig} from "../../config";

interface StorageProps {
    deploymentConfig: DeploymentConfig;
}

export class FrontendStorage extends Construct {
    public readonly siteBucket: s3.Bucket;

    constructor(scope: Construct, id: string, props: StorageProps) {
        super(scope, id);

        this.siteBucket = new s3.Bucket(this, 'SiteBucket', {
            autoDeleteObjects: props.deploymentConfig.autoDeleteObjects,
            removalPolicy: props.deploymentConfig.removalPolicy,
            blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
            encryption: s3.BucketEncryption.S3_MANAGED,
            enforceSSL: true,
        });
    }
}
