import * as lambda from 'aws-cdk-lib/aws-lambda';
import {Construct} from 'constructs';
import * as path from 'path';
import * as apigateway from "aws-cdk-lib/aws-apigateway";
import * as cdk from 'aws-cdk-lib';
import * as fs from 'fs';
import * as logs from 'aws-cdk-lib/aws-logs';
import {execSync} from 'child_process';
import * as os from 'os';
import {DeploymentConfig} from "../../config";

export interface BackendLambdaProps extends lambda.FunctionOptions {
    deploymentConfig: DeploymentConfig,
    binaryName: string; // The name of the [[bin]] in Cargo.toml
    environment?: { [key: string]: string }; // Environment variables
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
    if (props.deploymentConfig.buildConfig.backendPath) {
        // Find the specific binary from the pre-built backend path
        const binPath = path.resolve(process.cwd(), props.deploymentConfig.buildConfig.backendPath, props.binaryName);
        if (!fs.existsSync(binPath)) throw new Error(`Pre-built binary not found: ${binPath}`);
        
        // AWS Lambda custom runtimes require the binary to be named 'bootstrap'
        const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), `lambda-${props.binaryName}-`));
        fs.copyFileSync(binPath, path.join(tempDir, 'bootstrap'));
        fs.chmodSync(path.join(tempDir, 'bootstrap'), 0o755);
        code = lambda.Code.fromAsset(tempDir);
    } else if (props.deploymentConfig.buildConfig.build) {
        code = bundleRustCode(props.binaryName, props.deploymentConfig.mode === 'sandbox' ? 'sandbox' : 'release');
    } else {
        // Default to stub for foundation synthesis speed
        code = lambda.Code.fromAsset(path.join(process.cwd(), 'stub'));
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
function bundleRustCode(binName: string, profile: string): lambda.AssetCode {

    // Calculate Relative Path safely (Host OS -> Docker Linux Path)
    let relativeCratePath = path.isAbsolute(cratePath)
        ? path.relative(workspacePath, cratePath)
        : cratePath;

    // Ensure forward slashes for Docker (even if Host is Windows)
    relativeCratePath = relativeCratePath.replace(/\\/g, '/');

    // We map the host to container to keep caches
    const hostTargetDir = path.join(cratePath, 'target', 'docker-cargo-target');
    const hostRegistryDir = path.join(cratePath, 'target', 'docker-cargo-registry');
    const hostRustupDir = path.join(cratePath, 'target', 'docker-rustup');

    const target = 'aarch64-unknown-linux-gnu';

    return lambda.Code.fromAsset(workspacePath, {
        exclude: [
            '**',
            '!backend/**',
            '!protocols/**',
            'backend/target/**',
        ],
        bundling: {
            image: cdk.DockerImage.fromRegistry('ghcr.io/wulf-data-engineering/levity-lambda-builder:20260331'),
            user: 'root',
            volumes: [
                {hostPath: hostTargetDir, containerPath: '/var/cargo/target'},
                {hostPath: hostRegistryDir, containerPath: '/var/cargo/registry'},
                {hostPath: hostRustupDir, containerPath: '/var/cargo/rustup'}
            ],
            environment: {
                CARGO_TARGET_DIR: '/var/cargo/target',
                CARGO_HOME: '/var/cargo/registry',
                RUSTUP_HOME: '/var/cargo/rustup',
                CARGO_INCREMENTAL: '0',
            },
            command: [
                'bash', '-c',
                `cd /asset-input/${relativeCratePath} && ` +
                `cargo build --profile ${profile} --target ${target} --bin ${binName} && ` +
                // Copy from the cached target directory:
                `cp /var/cargo/target/${target}/${profile}/${binName} /asset-output/bootstrap && ` +
                '[ -f /asset-output/bootstrap ] || { echo "❌ Binary not found in output"; exit 1; } && ' +
                'chmod -R 777 /var/cargo/target /var/cargo/registry || true'
            ],
            local: {
                tryBundle(outputDir: string) {
                    if (process.platform !== 'linux') {
                        return false;
                    }

                    console.log(`[Local Build] Building Rust binary: ${binName}`);

                    // We must run the build inside the specific crate directory
                    // cratePath is absolute, so we use it directly.
                    const buildDir = cratePath;

                    execSync(`cargo build --profile ${profile} --target ${target} --bin ${binName}`, {
                        cwd: buildDir,
                        stdio: 'inherit',
                        env: {
                            ...process.env,
                            // Tell cargo to use the cross-compiler linker
                            CARGO_TARGET_AARCH64_UNKNOWN_LINUX_GNU_LINKER: 'aarch64-linux-gnu-gcc'
                        }
                    });


                    const binPath = path.join(buildDir, `target/${target}/${profile}/${binName}`);
                    if (!fs.existsSync(binPath)) {
                        throw new Error(`Binary ${binName} not found after build at ${binPath}`);
                    }

                    execSync(`cp ${binPath} ${path.join(outputDir, 'bootstrap')}`);
                    return true;
                }
            }
        }
    });
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
