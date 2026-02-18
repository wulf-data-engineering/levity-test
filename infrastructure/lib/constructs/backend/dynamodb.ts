import { RemovalPolicy } from 'aws-cdk-lib';
import { AttributeType, BillingMode, Table } from 'aws-cdk-lib/aws-dynamodb';
import { Construct } from 'constructs';

export interface VersionedTableProps {
  tableName: string;
  partitionKey?: string;
  removalPolicy?: RemovalPolicy;
}

export class VersionedTable extends Table {
  constructor(scope: Construct, id: string, props: VersionedTableProps) {
    super(scope, id, {
      tableName: props.tableName,
      partitionKey: {
        name: props.partitionKey || 'pk',
        type: AttributeType.STRING,
      },
      billingMode: BillingMode.PAY_PER_REQUEST,
      pointInTimeRecoverySpecification: {
        pointInTimeRecoveryEnabled: true,
      },
      removalPolicy: props.removalPolicy,
    });
  }
}
