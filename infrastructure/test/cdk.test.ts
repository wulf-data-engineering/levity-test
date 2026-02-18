import * as cdk from 'aws-cdk-lib';
import { Template } from 'aws-cdk-lib/assertions';
import * as Cdk from '../lib/cdk-stack';

test('Infrastructure Created', () => {
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
  const template = Template.fromStack(stack);

  // Verify API Gateway
  template.hasResourceProperties('AWS::ApiGateway::RestApi', {
    Name: 'RestApi',
  });
});
