import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import * as cdk from 'aws-cdk-lib';
import * as apigw from 'aws-cdk-lib/aws-apigatewayv2';
import { HttpLambdaIntegration } from 'aws-cdk-lib/aws-apigatewayv2-integrations';
import * as budgets from 'aws-cdk-lib/aws-budgets';
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront';
import * as origins from 'aws-cdk-lib/aws-cloudfront-origins';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as events from 'aws-cdk-lib/aws-events';
import * as targets from 'aws-cdk-lib/aws-events-targets';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import { SqsEventSource } from 'aws-cdk-lib/aws-lambda-event-sources';
import * as nodejs from 'aws-cdk-lib/aws-lambda-nodejs';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as rds from 'aws-cdk-lib/aws-rds';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as s3deploy from 'aws-cdk-lib/aws-s3-deployment';
import * as sns from 'aws-cdk-lib/aws-sns';
import * as sqs from 'aws-cdk-lib/aws-sqs';
import type { Construct } from 'constructs';

const repo = (p: string) => fileURLToPath(new URL(`../../../${p}`, import.meta.url));

export type DemoStackProps = cdk.StackProps & {
  environment: string;
  owner: string;
  /** Single-AZ RDS for a short public demo window only. Off by default; local PostgreSQL is the norm. */
  enableRds: boolean;
  /** Optional email for budget alerts; the SNS topic exists either way. */
  budgetEmail?: string;
};

/**
 * Short-lived AWS demo profile. Pay-per-use only: static site, HTTP API + Lambda, EventBridge + SQS,
 * S3 artifacts, budgets. Deliberately absent: NAT Gateway, EKS, MSK, ElastiCache, Multi-AZ RDS,
 * provisioned concurrency and any always-on container fleet.
 */
export class ShinraiDemoStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: DemoStackProps) {
    super(scope, id, props);
    const removal = cdk.RemovalPolicy.DESTROY; // teardown must remove everything

    // Static dashboard: private bucket behind CloudFront (origin access control).
    const site = new s3.Bucket(this, 'WebBucket', {
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      enforceSSL: true,
      encryption: s3.BucketEncryption.S3_MANAGED,
      removalPolicy: removal,
      autoDeleteObjects: true,
    });
    const cdn = new cloudfront.Distribution(this, 'Web', {
      defaultBehavior: {
        origin: origins.S3BucketOrigin.withOriginAccessControl(site),
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
      },
      defaultRootObject: 'index.html',
      priceClass: cloudfront.PriceClass.PRICE_CLASS_100,
    });
    const webOut = repo('apps/web/out');
    if (existsSync(webOut)) {
      new s3deploy.BucketDeployment(this, 'WebDeploy', {
        sources: [s3deploy.Source.asset(webOut)],
        destinationBucket: site,
        distribution: cdn,
      });
    }

    // Fixtures, replay reports and trace bundles.
    const artifacts = new s3.Bucket(this, 'Artifacts', {
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      enforceSSL: true,
      encryption: s3.BucketEncryption.S3_MANAGED,
      versioned: true,
      lifecycleRules: [
        { expiration: cdk.Duration.days(30), noncurrentVersionExpiration: cdk.Duration.days(7) },
      ],
      removalPolicy: removal,
      autoDeleteObjects: true,
    });

    // Optional database for a demo window: single-AZ, smallest burstable class, no NAT.
    let vpc: ec2.IVpc | undefined;
    let db: rds.DatabaseInstance | undefined;
    if (props.enableRds) {
      vpc = new ec2.Vpc(this, 'Vpc', {
        maxAzs: 2,
        natGateways: 0,
        subnetConfiguration: [
          { name: 'isolated', subnetType: ec2.SubnetType.PRIVATE_ISOLATED, cidrMask: 24 },
        ],
      });
      // Interface endpoints so isolated Lambdas reach Secrets Manager and EventBridge without a NAT (one AZ each).
      const oneAz = { subnets: vpc.isolatedSubnets.slice(0, 1) };
      vpc.addInterfaceEndpoint('SecretsEndpoint', {
        service: ec2.InterfaceVpcEndpointAwsService.SECRETS_MANAGER,
        subnets: oneAz,
      });
      vpc.addInterfaceEndpoint('EventsEndpoint', {
        service: ec2.InterfaceVpcEndpointAwsService.EVENTBRIDGE,
        subnets: oneAz,
      });
      db = new rds.DatabaseInstance(this, 'Database', {
        engine: rds.DatabaseInstanceEngine.postgres({ version: rds.PostgresEngineVersion.VER_17 }),
        instanceType: ec2.InstanceType.of(
          ec2.InstanceClass.BURSTABLE4_GRAVITON,
          ec2.InstanceSize.MICRO,
        ),
        vpc,
        vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_ISOLATED },
        multiAz: false,
        allocatedStorage: 20,
        maxAllocatedStorage: 20,
        backupRetention: cdk.Duration.days(1),
        deletionProtection: false,
        removalPolicy: removal,
        databaseName: 'shinrai',
      });
    }

    const bus = new events.EventBus(this, 'Events', {
      eventBusName: `shinrai-events-${props.environment}`,
    });
    const dlq = new sqs.Queue(this, 'ProjectionDlq', {
      retentionPeriod: cdk.Duration.days(14),
      enforceSSL: true,
    });
    const projectionQueue = new sqs.Queue(this, 'ProjectionQueue', {
      visibilityTimeout: cdk.Duration.seconds(60),
      deadLetterQueue: { queue: dlq, maxReceiveCount: 5 },
      enforceSSL: true,
    });
    new events.Rule(this, 'ProjectAll', {
      eventBus: bus,
      eventPattern: { source: ['shinrai'] },
      targets: [new targets.SqsQueue(projectionQueue)],
    });

    // Every function gets its own role; no provisioned or reserved concurrency anywhere.
    const fn = (id: string, entry: string, extra: Partial<nodejs.NodejsFunctionProps> = {}) =>
      new nodejs.NodejsFunction(this, id, {
        entry: repo(entry),
        runtime: lambda.Runtime.NODEJS_22_X,
        architecture: lambda.Architecture.ARM_64,
        memorySize: 512,
        timeout: cdk.Duration.seconds(15),
        logGroup: new logs.LogGroup(this, `${id}Logs`, {
          retention: logs.RetentionDays.ONE_WEEK,
          removalPolicy: removal,
        }),
        environment: {
          SHINRAI_PROFILE: 'aws',
          SHINRAI_MODEL: 'fake',
          LOG_LEVEL: 'info',
          ...(db ? { DATABASE_SECRET_ARN: db.secret?.secretArn ?? '' } : {}),
        },
        bundling: {
          format: nodejs.OutputFormat.ESM,
          target: 'node22',
          mainFields: ['module', 'main'],
          banner:
            "import { createRequire } from 'module'; const require = createRequire(import.meta.url);",
          externalModules: ['@aws-sdk/*', '@openai/agents'],
        },
        ...(vpc ? { vpc, vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_ISOLATED } } : {}),
        ...extra,
      });

    const api = fn('ApiFn', 'apps/api/src/lambda.ts', {
      environment: {
        SHINRAI_PROFILE: 'aws',
        SHINRAI_MODEL: 'fake',
        WEB_ORIGIN: `https://${cdn.distributionDomainName}`,
      },
    });
    // The agent gateway is the only component that may ever read a model-provider key.
    const gateway = fn('AgentGatewayFn', 'apps/api/src/lambda.ts', {
      timeout: cdk.Duration.seconds(60),
      environment: {
        SHINRAI_PROFILE: 'aws',
        SHINRAI_MODEL: 'fake',
        SHINRAI_COMPONENT: 'agent-gateway',
      },
    });
    const projector = fn('ProjectorFn', 'apps/worker/src/lambda.ts');
    const relay = fn('OutboxRelayFn', 'apps/worker/src/relay-lambda.ts', {
      environment: { SHINRAI_PROFILE: 'aws', EVENT_BUS_NAME: bus.eventBusName },
    });

    projector.addEventSource(
      new SqsEventSource(projectionQueue, { batchSize: 10, reportBatchItemFailures: true }),
    );
    bus.grantPutEventsTo(relay);
    artifacts.grantReadWrite(gateway);
    artifacts.grantRead(api);
    gateway.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ['ssm:GetParameter'],
        resources: [
          cdk.Arn.format(
            { service: 'ssm', resource: 'parameter', resourceName: 'shinrai/openai-api-key' },
            this,
          ),
        ],
      }),
    );
    if (db?.secret) for (const f of [api, gateway, projector, relay]) db.secret.grantRead(f);
    if (db)
      for (const f of [api, gateway, projector, relay]) db.connections.allowDefaultPortFrom(f);
    // The relay runs only while the stack exists; it is not an always-on process.
    new events.Rule(this, 'RelaySchedule', {
      schedule: events.Schedule.rate(cdk.Duration.minutes(1)),
      targets: [new targets.LambdaFunction(relay)],
    });

    const http = new apigw.HttpApi(this, 'HttpApi', {
      corsPreflight: {
        allowOrigins: [`https://${cdn.distributionDomainName}`],
        allowHeaders: ['authorization', 'content-type', 'x-correlation-id'],
        allowMethods: [apigw.CorsHttpMethod.GET, apigw.CorsHttpMethod.POST],
      },
      defaultIntegration: new HttpLambdaIntegration('Api', api),
    });
    for (const path of ['/agent-runs', '/approvals/{proxy+}']) {
      http.addRoutes({
        path,
        methods: [apigw.HttpMethod.POST],
        integration: new HttpLambdaIntegration(`Gw${path.length}`, gateway),
      });
    }
    const stage = http.defaultStage?.node.defaultChild as apigw.CfnStage | undefined;
    stage?.addPropertyOverride('DefaultRouteSettings', {
      ThrottlingBurstLimit: 20,
      ThrottlingRateLimit: 10,
    });

    // Cost guardrails: alerts at $5/$10/$20 and the $30 action threshold.
    const alerts = new sns.Topic(this, 'BudgetAlerts', { enforceSSL: true });
    alerts.addToResourcePolicy(
      new iam.PolicyStatement({
        principals: [new iam.ServicePrincipal('budgets.amazonaws.com')],
        actions: ['SNS:Publish'],
        resources: [alerts.topicArn],
      }),
    );
    const subscribers = [
      { subscriptionType: 'SNS', address: alerts.topicArn },
      ...(props.budgetEmail ? [{ subscriptionType: 'EMAIL', address: props.budgetEmail }] : []),
    ];
    const notify = (amount: number, type: 'ACTUAL' | 'FORECASTED') => ({
      notification: {
        comparisonOperator: 'GREATER_THAN',
        notificationType: type,
        threshold: amount,
        thresholdType: 'ABSOLUTE_VALUE',
      },
      subscribers,
    });
    new budgets.CfnBudget(this, 'MonthlyBudget', {
      budget: {
        budgetName: `shinrai-${props.environment}-monthly`,
        budgetType: 'COST',
        timeUnit: 'MONTHLY',
        budgetLimit: { amount: 30, unit: 'USD' },
        costFilters: { TagKeyValue: ['user:project$agent-market-sandbox'] },
      },
      notificationsWithSubscribers: [
        notify(5, 'ACTUAL'),
        notify(10, 'ACTUAL'),
        notify(20, 'FORECASTED'),
        notify(30, 'ACTUAL'),
      ],
    });

    new cdk.CfnOutput(this, 'WebUrl', { value: `https://${cdn.distributionDomainName}` });
    new cdk.CfnOutput(this, 'ApiUrl', { value: http.apiEndpoint });
    new cdk.CfnOutput(this, 'ArtifactsBucket', { value: artifacts.bucketName });
  }
}
