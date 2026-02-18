import { Construct } from "constructs";
import * as cdk from "aws-cdk-lib";
import * as cloudfront from "aws-cdk-lib/aws-cloudfront";
import * as origins from "aws-cdk-lib/aws-cloudfront-origins";
import * as acm from "aws-cdk-lib/aws-certificatemanager";
import * as apigateway from "aws-cdk-lib/aws-apigateway";
import * as s3 from "aws-cdk-lib/aws-s3";
import { DeploymentConfig } from "../../config";
import { BehaviorOptions } from "aws-cdk-lib/aws-cloudfront";

interface DistributionProps {
  deploymentConfig: DeploymentConfig;
  siteBucket: s3.IBucket;
  backendApi?: apigateway.RestApi;
}

export class FrontendDistribution extends Construct {
  public readonly distribution: cloudfront.Distribution;

  constructor(scope: Construct, id: string, props: DistributionProps) {
    super(scope, id);

    const { deploymentConfig, siteBucket, backendApi } = props;

    // certificate setup (required by CloudFront if custom domain is used)
    let certificate: acm.ICertificate | undefined = undefined;

    const domainConfig = deploymentConfig.domain;
    if (domainConfig) {
      const { domainName, hostedZone } = domainConfig;

      certificate = new acm.Certificate(this, "SiteCert", {
        domainName: domainName,
        validation: acm.CertificateValidation.fromDns(hostedZone),
      });
    }

    let apiBehavior: Record<string, BehaviorOptions> = {};

    // if backendApi is provided, set up CloudFront behavior to forward /api/* requests to the API Gateway
    if (backendApi) {
      apiBehavior = {
        "/api/*": {
          origin: new origins.RestApiOrigin(backendApi),
          viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.HTTPS_ONLY,
          allowedMethods: cloudfront.AllowedMethods.ALLOW_ALL,
          cachePolicy: cloudfront.CachePolicy.CACHING_DISABLED,
          originRequestPolicy:
            cloudfront.OriginRequestPolicy.ALL_VIEWER_EXCEPT_HOST_HEADER,
        },
      };
    }

    // default policy: short cache (1 minute) for HTML/mutable files
    // This covers load but ensures users see updates quickly.
    const shortCachePolicy = new cloudfront.CachePolicy(
      this,
      "ShortCachePolicy",
      {
        defaultTtl: cdk.Duration.minutes(1),
        minTtl: cdk.Duration.seconds(0),
        maxTtl: cdk.Duration.minutes(5),
        enableAcceptEncodingGzip: true,
        enableAcceptEncodingBrotli: true,
      },
    );

    // immutable policy: long cache (1 year) for _app/immutable/
    // SvelteKit hashes these files, so they are safe to cache forever.
    const immutableCachePolicy = new cloudfront.CachePolicy(
      this,
      "ImmutableCachePolicy",
      {
        defaultTtl: cdk.Duration.days(365),
        minTtl: cdk.Duration.days(365),
        maxTtl: cdk.Duration.days(365),
        enableAcceptEncodingGzip: true,
        enableAcceptEncodingBrotli: true,
      },
    );

    // reuse the same S3 Origin for default and immutable asset behaviors
    const s3Origin = origins.S3BucketOrigin.withOriginAccessControl(siteBucket);

    // rewrites pre-rendered /somePath to /somePath.html so S3 can find the object.
    const rewriteFunction = new cloudfront.Function(this, "RewriteFunction", {
      code: cloudfront.FunctionCode.fromInline(`
        function handler(event) {
          var request = event.request;
          var uri = request.uri;
          
          // If the URI doesn't have an extension (no dot in the last segment)
          // and doesn't end with a slash, append .html
          // e.g., /signUp -> /signUp.html
          if (!uri.includes('.')) {
             request.uri += '.html';
          }
          
          return request;
        }
      `),
    });

    // --- CloudFront Distribution ---
    this.distribution = new cloudfront.Distribution(this, "SiteDistribution", {
      certificate,
      domainNames: domainConfig ? [domainConfig.domainName] : undefined,
      defaultRootObject: "index.html",

      // fallback for SPA/Dynamic routes
      // If S3 returns 403/404 (because rewrite to .html didn't match a static file),
      // serve fallback.html with a 200 OK status so Svelte can handle client-side routing.
      errorResponses: [
        {
          httpStatus: 403, // S3 often returns 403 for missing keys with OAC
          responseHttpStatus: 200,
          responsePagePath: "/fallback.html",
          ttl: cdk.Duration.minutes(0), // don't cache errors
        },
        {
          httpStatus: 404,
          responseHttpStatus: 200,
          responsePagePath: "/fallback.html",
          ttl: cdk.Duration.minutes(0),
        },
      ],

      // root HTML files -> short cache, rewrite URLs
      defaultBehavior: {
        origin: s3Origin,
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        compress: true,
        cachePolicy: shortCachePolicy,
        functionAssociations: [
          {
            function: rewriteFunction,
            eventType: cloudfront.FunctionEventType.VIEWER_REQUEST,
          },
        ],
      },

      additionalBehaviors: {
        // immutable assets -> long cache, no rewrite required
        "/_app/immutable/*": {
          origin: s3Origin,
          viewerProtocolPolicy:
            cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
          compress: true,
          cachePolicy: immutableCachePolicy,
        },
        ...apiBehavior,
      },
    });

    new cdk.CfnOutput(this, "Url", {
      value: domainConfig
        ? `https://${domainConfig.domainName}`
        : `https://${this.distribution.distributionDomainName}`,
      description: "CloudFront URL",
    });
  }
}
