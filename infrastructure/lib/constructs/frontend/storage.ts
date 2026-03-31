import { Construct } from 'constructs';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as cdk from 'aws-cdk-lib';
import { AppConfig } from '../../config';

export interface FrontendStorageProps {
  config: AppConfig;
}

export class FrontendStorage extends Construct {
  public readonly siteBucket: s3.Bucket;

  constructor(scope: Construct, id: string, props: FrontendStorageProps) {
    super(scope, id);

    const { config } = props;

    this.siteBucket = new s3.Bucket(this, 'SiteBucket', {
      removalPolicy: config.removalPolicy,
      autoDeleteObjects: config.removalPolicy === cdk.RemovalPolicy.DESTROY,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      encryption: s3.BucketEncryption.S3_MANAGED,
      enforceSSL: true,
    });
  }
}
