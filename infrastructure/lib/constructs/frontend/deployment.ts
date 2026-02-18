import {Construct} from 'constructs';
import * as s3deploy from 'aws-cdk-lib/aws-s3-deployment';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront';
import * as cdk from 'aws-cdk-lib';
import * as path from 'path';
import {execSync} from 'child_process';
import * as fs from 'fs';
import * as cognito from "aws-cdk-lib/aws-cognito";
import {DeploymentConfig} from "../../config";

interface DeploymentProps {
    siteBucket: s3.IBucket;
    distribution: cloudfront.IDistribution;
    userPool?: cognito.IUserPool
    userPoolClient?: cognito.IUserPoolClient
    deploymentConfig: DeploymentConfig
}

export class FrontendDeployment extends Construct {
    constructor(scope: Construct, id: string, props: DeploymentProps) {
        super(scope, id);

        const frontendPath = path.join(__dirname, '../../../../frontend');

        // contains the values that the frontend app will use at runtime for Cognito auth
        const runtimeConfig = {
            userPoolId: props.userPool?.userPoolId,
            userPoolClientId: props.userPoolClient?.userPoolClientId,
        };

        let assetSource: s3deploy.ISource;
        if (props.deploymentConfig.skipBuild) {
            assetSource = s3deploy.Source.asset(path.join(process.cwd(), 'stub/frontend'));
        } else {
            assetSource = s3deploy.Source.asset(frontendPath, {
                exclude: ['node_modules', 'build', '.svelte-kit', 'dist', '.git'],
                bundling: {
                    image: cdk.DockerImage.fromRegistry('alpine'),
                    local: {
                        tryBundle(outputDir: string) {
                            // FIX: Always build locally, even for LocalStack (AWS_ENDPOINT_URL).
                            // If we return false, it falls back to Alpine Docker which fails
                            // because it doesn't have npm/node installed.

                            console.log('Building Svelte Frontend...');

                            // Fail fast if build errors
                            execSync('npm run build', { cwd: frontendPath, stdio: 'inherit' });

                            const buildPath = path.join(frontendPath, 'build');
                            if (!fs.existsSync(buildPath)) throw new Error(`Frontend build output missing at ${buildPath}`);

                            execSync(`cp -r ${buildPath}/* ${outputDir}`, { stdio: 'inherit' });
                            return true;
                        }
                    }
                }
            });
        }

        new s3deploy.BucketDeployment(this, 'DeploySvelte', {
            destinationBucket: props.siteBucket,
            distribution: props.distribution,
            distributionPaths: ['/*'],
            sources: [
                // npm run build output
                assetSource,
                // dynamic config
                s3deploy.Source.jsonData('config.json', runtimeConfig)
            ],
        });
    }
}
