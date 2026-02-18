import * as cdk from 'aws-cdk-lib';
import { Annotations, Match } from 'aws-cdk-lib/assertions';
import { AwsSolutionsChecks, NagSuppressions } from 'cdk-nag';
import * as Cdk from '../lib/cdk-stack';

test('No Unsuppressed Security Errors', () => {
  delete process.env.AWS_ENDPOINT_URL;
  const app = new cdk.App({
    context: {
      environment: 'test',
      project_slug: 'tool-set-iac-test',
      package_name: 'tool_set_iac_test',
      domain_name: 'example.com',
      hosted_zone_id: 'Z1234567890',
      email_sender_address: 'noreply@example.com',
      email_sender_name: 'Test Sender',
      email_replyto: 'noreply@example.com',
      aws: true,
      skipBuild: true,
    },
  });
  const stack = new Cdk.CdkStack(app, 'CdkTestStack');

  cdk.Aspects.of(stack).add(new AwsSolutionsChecks({ verbose: true }));

  const annotations = Annotations.fromStack(stack);
  annotations.hasNoError('/^AwsSolutions-/', Match.anyValue());
});
