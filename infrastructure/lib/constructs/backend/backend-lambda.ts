import * as lambda from 'aws-cdk-lib/aws-lambda';
import {Construct} from 'constructs';
import * as path from 'path';
import * as apigateway from "aws-cdk-lib/aws-apigateway";
import * as cdk from 'aws-cdk-lib';
import * as fs from 'fs';
import * as logs from 'aws-cdk-lib/aws-logs';
import {execSync} from 'child_process';
import {DeploymentConfig} from "../../config";

export interface BackendLambdaProps extends lambda.FunctionOptions {
    deploymentConfig: DeploymentConfig,
    binaryName: string; // The name of the [[bin]] in Cargo.toml
}

/**
 * In an AWS deployment creates a Rust-based Lambda function.
 *
 * In a local deployment, creates a Node.js Lambda function
 * that forwards requests to the local cargo-lambda HTTP server (cargo lambda watch).
 * That allows hot-reloading, easier log access and faster development cycles.
 */
export function backendLambda(scope: Construct, id: string, props: BackendLambdaProps): lambda.Function {
    if (props.deploymentConfig.aws)
        return rustLambda(scope, id, props);
    else
        return proxyLambda(scope, id, props);
}

export interface BackendLambdaApiProps extends BackendLambdaProps {
    apiRoot: apigateway.Resource; // The API Gateway resource to attach the lambda to
    authorizer?: apigateway.IAuthorizer; // Whether to protect the endpoint with an authorizer
    authorizationType?: apigateway.AuthorizationType; // Specifies the type of authorization (default: Cognito)
    path?: string; // The path under the apiRoot to attach the lambda to (default: binaryName)
}

/**
 * Creates a cargo lambda function which is wired as an API Gateway handler.
 * Uses the configured path or else the binary name to route requests to the lambda.
 * Lambda is optionally protected with a (Cognito) Authorizer.
 *
 * @see backendLambda
 */
export function backendLambdaApi(scope: Construct, id: string, props: BackendLambdaApiProps): lambda.Function {
    const lambdaFunction = backendLambda(scope, id, props);

    const integration = new apigateway.LambdaIntegration(lambdaFunction);

    const resource = props.apiRoot.addResource(props.path || props.binaryName);

    const methodOptions: apigateway.MethodOptions = props.authorizer ? {
        authorizer: props.authorizer,
        authorizationType: props.authorizationType || apigateway.AuthorizationType.COGNITO,
    } : {};

    resource.addMethod('ANY', integration, methodOptions);

    resource.addProxy({
        defaultIntegration: integration,
        anyMethod: true,
        defaultMethodOptions: methodOptions
    });

    return lambdaFunction;
}

// Production deployment

function rustLambda(scope: Construct, id: string, props: BackendLambdaProps) {

    const logGroup = new logs.LogGroup(scope, `${id}LogGroup`, {
        logGroupName: `/aws/lambda/${props.functionName || props.binaryName}`,
        retention: logs.RetentionDays.ONE_WEEK,
        removalPolicy: props.deploymentConfig.removalPolicy,
    });

    let code: lambda.Code;
    if (props.deploymentConfig.skipBuild) {
        code = lambda.Code.fromAsset(path.join(process.cwd(), 'stub'));
    } else {
        code = bundleRustCode(props.binaryName);
    }

    return new lambda.Function(scope, id, {
        ...props,
        functionName: props.functionName || props.binaryName,
        runtime: lambda.Runtime.PROVIDED_AL2023,
        handler: 'bootstrap',
        architecture: lambda.Architecture.ARM_64,
        code,
        logGroup
    })
}

const workspacePath = path.join(__dirname, "..", "..", "..", "..");
const cratePath = path.join(workspacePath, "backend");

/**
 * On Linux ARM64 hosts, builds the Rust binary locally.
 * On other platforms (Mac, Windows), uses Docker to build the binary.
 */
function bundleRustCode(binName: string): lambda.AssetCode {

    // Calculate Relative Path safely (Host OS -> Docker Linux Path)
    let relativeCratePath = path.isAbsolute(cratePath)
        ? path.relative(workspacePath, cratePath)
        : cratePath;

    // Ensure forward slashes for Docker (even if Host is Windows)
    relativeCratePath = relativeCratePath.replace(/\\/g, '/');

    const exclude = dynamicExclusions(['backend', 'protocols'], ['**/target']);

    // We map the host's 'backend/target/docker-cache' -> Container's '/var/cargo/target'
    // This keeps the cache self-contained in the crate's target folder on your host.
    const hostTargetDir = path.join(workspacePath, relativeCratePath, 'target', 'docker-cargo-target');

    // We keep the registry in the workspace root target to share downloads across crates/projects if needed
    const hostRegistryDir = path.join(workspacePath, 'target', 'docker-cargo-registry');

    return lambda.Code.fromAsset(workspacePath, {
        exclude,
        bundling: {
            image: cdk.DockerImage.fromRegistry('ghcr.io/wulf-data-engineering/levity-lambda-builder:20251230'),
            user: 'root',
            volumes: [
                {hostPath: hostTargetDir, containerPath: '/var/cargo/target'},
                {hostPath: hostRegistryDir, containerPath: '/var/cargo/registry'}
            ],
            environment: {
                CARGO_TARGET_DIR: '/var/cargo/target',
                CARGO_HOME: '/var/cargo/registry'
            },
            command: [
                'bash', '-c',
                `cd /asset-input/${relativeCratePath} && ` +
                `cargo build --release --target aarch64-unknown-linux-gnu --bin ${binName} && ` +
                // Copy from the cached target directory:
                `cp /var/cargo/target/aarch64-unknown-linux-gnu/release/${binName} /asset-output/bootstrap && ` +
                '[ -f /asset-output/bootstrap ] || { echo "❌ Binary not found in output"; exit 1; } && ' +
                'chmod -R 777 /var/cargo/target /var/cargo/registry || true'
            ],
            local: {
                tryBundle(outputDir: string) {
                    if (process.platform !== 'linux' || process.arch !== 'arm64') {
                        return false;
                    }

                    try {
                        console.log(`[Local Build] Building Rust binary: ${binName}`);

                        // We must run the build inside the specific crate directory
                        const buildDir = path.join(workspacePath, cratePath);

                        execSync(`cargo build --release --bin ${binName}`, {
                            cwd: buildDir,
                            stdio: 'inherit'
                        });

                        const binPath = path.join(buildDir, `target/release/${binName}`);
                        if (!fs.existsSync(binPath)) {
                            console.error(`Binary ${binName} not found after build.`);
                            return false;
                        }

                        execSync(`cp ${binPath} ${path.join(outputDir, 'bootstrap')}`);
                        return true;
                    } catch (error) {
                        console.warn(`[Local Build] Failed, falling back to Docker. Error: ${error}`);
                        return false;
                    }
                }
            }
        }
    });
}

/**
 * Generates a list of files/folders to exclude by listing everything in the
 * workspace and filtering out only the specific paths we want to keep.
 */
function dynamicExclusions(include: string[], exclude: string[]): string[] {
    const exclusions: string[] = [...exclude];
    try {
        const allFiles = fs.readdirSync(workspacePath);
        exclusions.push(...allFiles.filter(file => !include.includes(file)));
        return exclusions;
    } catch (e) {
        console.warn(`[CDK Warning] Could not read workspace path '${workspacePath}' to generate exclusions. Defaulting to empty list.`);
        return [];
    }
}

// Local development

function proxyLambda(scope: Construct, id: string, props: BackendLambdaProps) {
    const lambdaPath = props.binaryName;
    const url = `http://host.docker.internal:9000/2015-03-31/functions/${lambdaPath}/invocations`
    return new lambda.Function(scope, id, {
        functionName: props.functionName || props.binaryName,
        runtime: lambda.Runtime.NODEJS_22_X,
        handler: 'index.handler',
        code: lambda.Code.fromInline(code(url))
    })
}

function code(url: string): string {
    return `exports.handler = async (event) => {
    
  console.log("Forwarding event to cargo-lambda server at ${url}: ", JSON.stringify(event));
    
  const response = await fetch("${url}", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(event),
  });

  // Read the response as raw bytes
  const buffer = await response.arrayBuffer();
  const body = Buffer.from(buffer).toString("base64");

  // Forward everything back as Lambda Proxy integration expects
  return {
    statusCode: response.status,
    headers: Object.fromEntries(response.headers.entries()),
    body,
    isBase64Encoded: true,
  };
};`
}
