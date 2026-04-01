import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as ecs from 'aws-cdk-lib/aws-ecs';
import * as autoscaling from 'aws-cdk-lib/aws-autoscaling';
import * as servicediscovery from 'aws-cdk-lib/aws-servicediscovery';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as ecr from 'aws-cdk-lib/aws-ecr';
import * as elbv2 from 'aws-cdk-lib/aws-elasticloadbalancingv2';
import { AppConfig } from '../../config';

export interface ServerProps {
  config: AppConfig;
}

/**
 * Standalone ECS Server on EC2 (t4g.nano).
 * Uses Spot instances for staging/sandbox environments.
 */
export class Server extends Construct {
  public readonly vpc: ec2.IVpc;
  public readonly cluster: ecs.Cluster;
  public readonly nlb: elbv2.NetworkLoadBalancer;
  public readonly service: ecs.Ec2Service;

  constructor(scope: Construct, id: string, props: ServerProps) {
    super(scope, id);

    const { config } = props;

    // 1. VPC - Public subnets only to save NAT Gateway costs
    this.vpc = new ec2.Vpc(this, 'Vpc', {
      maxAzs: 2,
      subnetConfiguration: [
        {
          name: 'Public',
          subnetType: ec2.SubnetType.PUBLIC,
        },
      ],
    });

    // 2. ECS Cluster
    this.cluster = new ecs.Cluster(this, 'Cluster', {
      vpc: this.vpc,
      containerInsights: true,
      defaultCloudMapNamespace: {
        name: 'levity.local',
        type: servicediscovery.NamespaceType.DNS_PRIVATE,
        vpc: this.vpc,
      },
    });

    // 3. Auto Scaling Group
    const asg = new autoscaling.AutoScalingGroup(this, 'Asg', {
      vpc: this.vpc,
      instanceType: ec2.InstanceType.of(ec2.InstanceClass.T4G, ec2.InstanceSize.NANO),
      machineImage: ecs.EcsOptimizedImage.amazonLinux2(ecs.AmiHardwareType.ARM),
      minCapacity: 1,
      maxCapacity: props.config.environment === 'production' ? 2 : 1,
      vpcSubnets: { subnetType: ec2.SubnetType.PUBLIC },
    });

    const capacityProvider = new ecs.AsgCapacityProvider(this, 'AsgCapacityProvider', {
      autoScalingGroup: asg,
    });
    this.cluster.addAsgCapacityProvider(capacityProvider);

    // 4. Task Definition
    const taskDefinition = new ecs.Ec2TaskDefinition(this, 'TaskDef', {
      networkMode: ecs.NetworkMode.AWS_VPC,
    });

    const repository = config.serverRepositoryArn 
      ? ecr.Repository.fromRepositoryArn(this, 'Repo', config.serverRepositoryArn)
      : ecr.Repository.fromRepositoryName(this, 'Repo', 'levity-test/server');

    const container = taskDefinition.addContainer('ServerContainer', {
      image: ecs.ContainerImage.fromEcrRepository(repository, config.imageDigest || 'latest'),
      cpu: 256,
      memoryLimitMiB: 450,
      logging: ecs.LogDrivers.awsLogs({ streamPrefix: 'Server' }),
    });

    container.addPortMappings({
      containerPort: 50051,
      name: 'grpc',
    });

    // 5. Load Balancer (Network - Internal)
    this.nlb = new elbv2.NetworkLoadBalancer(this, 'Nlb', {
      vpc: this.vpc,
      internetFacing: false,
      vpcSubnets: { subnetType: ec2.SubnetType.PUBLIC },
    });

    const listener = this.nlb.addListener('GrpcListener', {
      port: 50051,
    });

    // 6. Service
    this.service = new ecs.Ec2Service(this, 'Service', {
      serviceName: 'BackendServerService',
      cluster: this.cluster,
      taskDefinition,
      capacityProviderStrategies: [
        {
          capacityProvider: capacityProvider.capacityProviderName,
          weight: 1,
        },
      ],
      cloudMapOptions: {
        name: 'server',
      },
    });

    listener.addTargets('ServerTarget', {
      port: 50051,
      targets: [this.service.loadBalancerTarget({
        containerName: 'ServerContainer',
        containerPort: 50051,
      })],
      healthCheck: {
        port: '50051',
        protocol: elbv2.Protocol.TCP,
      },
    });

    // Allow gRPC traffic to the task
    this.service.connections.allowFromAnyIpv4(ec2.Port.tcp(50051), 'Allow gRPC traffic');
  }
}
