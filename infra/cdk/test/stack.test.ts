import * as cdk from 'aws-cdk-lib';
import { Match, Template } from 'aws-cdk-lib/assertions';
import { describe, expect, it } from 'vitest';
import { ShinraiDemoStack } from '../lib/demo-stack';

function synth(enableRds: boolean) {
  // Skip Lambda bundling in assertions (the CLI synth bundles for real).
  const app = new cdk.App({ context: { 'aws:cdk:bundling-stacks': [] } });
  for (const [k, v] of Object.entries({
    project: 'agent-market-sandbox',
    environment: 'test',
    owner: 'ci',
  }))
    cdk.Tags.of(app).add(k, v);
  const stack = new ShinraiDemoStack(app, 'Test', { environment: 'test', owner: 'ci', enableRds });
  return Template.fromStack(stack);
}

const FORBIDDEN = [
  'AWS::EC2::NatGateway',
  'AWS::EKS::Cluster',
  'AWS::MSK::Cluster',
  'AWS::MSK::ServerlessCluster',
  'AWS::ElastiCache::CacheCluster',
  'AWS::ElastiCache::ReplicationGroup',
  'AWS::ElastiCache::ServerlessCache',
  'AWS::ECS::Service',
  'AWS::EC2::Instance',
  'AWS::AutoScaling::AutoScalingGroup',
];

describe.each([false, true])('ShinraiDemoStack (enableRds=%s)', (enableRds) => {
  const t = synth(enableRds);

  it('contains none of the forbidden cost primitives', () => {
    for (const type of FORBIDDEN) expect(Object.keys(t.findResources(type)), type).toEqual([]);
  });

  it('uses no provisioned or reserved concurrency', () => {
    expect(
      Object.keys(
        t.findResources('AWS::Lambda::Alias', {
          Properties: { ProvisionedConcurrencyConfig: Match.anyValue() },
        }),
      ),
    ).toEqual([]);
    expect(
      Object.keys(
        t.findResources('AWS::Lambda::Version', {
          Properties: { ProvisionedConcurrencyConfig: Match.anyValue() },
        }),
      ),
    ).toEqual([]);
    for (const [id, fn] of Object.entries(t.findResources('AWS::Lambda::Function'))) {
      expect(fn.Properties.ReservedConcurrentExecutions, id).toBeUndefined();
    }
  });

  it('tags every taggable application resource with project, environment and owner', () => {
    for (const type of [
      'AWS::Lambda::Function',
      'AWS::S3::Bucket',
      'AWS::SQS::Queue',
      'AWS::SNS::Topic',
      'AWS::CloudFront::Distribution',
      'AWS::Events::EventBus',
    ]) {
      for (const [id, r] of Object.entries(t.findResources(type))) {
        // CDK's own deploy-time providers (e.g. Custom::S3AutoDeleteObjects) are not reachable by Tags aspects.
        if (id.startsWith('Custom')) continue;
        const tags = Object.fromEntries(
          (r.Properties.Tags ?? []).map((x: { Key: string; Value: string }) => [x.Key, x.Value]),
        );
        expect(tags, `${type} ${id}`).toMatchObject({
          project: 'agent-market-sandbox',
          environment: 'test',
          owner: 'ci',
        });
      }
    }
  });

  it('has a $30 monthly budget with $5/$10/$20/$30 alerts', () => {
    t.hasResourceProperties('AWS::Budgets::Budget', {
      Budget: Match.objectLike({ BudgetLimit: { Amount: 30, Unit: 'USD' }, TimeUnit: 'MONTHLY' }),
      NotificationsWithSubscribers: Match.arrayWith([
        Match.objectLike({ Notification: Match.objectLike({ Threshold: 5 }) }),
        Match.objectLike({ Notification: Match.objectLike({ Threshold: 10 }) }),
        Match.objectLike({ Notification: Match.objectLike({ Threshold: 20 }) }),
        Match.objectLike({ Notification: Match.objectLike({ Threshold: 30 }) }),
      ]),
    });
  });

  it('gives each application function its own least-privilege role (no admin, no wildcard actions)', () => {
    const fns = Object.values(t.findResources('AWS::Lambda::Function')).filter(
      (f) => f.Properties.Environment?.Variables?.SHINRAI_PROFILE === 'aws',
    );
    const roles = new Set(fns.map((f) => JSON.stringify(f.Properties.Role)));
    expect(fns.length).toBe(4);
    expect(roles.size).toBe(4);
    for (const role of Object.values(t.findResources('AWS::IAM::Role'))) {
      for (const arn of role.Properties.ManagedPolicyArns ?? [])
        expect(JSON.stringify(arn)).not.toContain('AdministratorAccess');
    }
    for (const [id, policy] of Object.entries(t.findResources('AWS::IAM::Policy'))) {
      for (const st of policy.Properties.PolicyDocument.Statement) {
        expect([st.Action].flat(), id).not.toContain('*');
      }
    }
  });

  it('only the agent gateway may read the model-provider key', () => {
    const readers = Object.entries(t.findResources('AWS::IAM::Policy')).filter(([, p]) =>
      JSON.stringify(p).includes('ssm:GetParameter'),
    );
    expect(readers).toHaveLength(1);
    expect(readers[0]?.[0]).toMatch(/AgentGateway/);
  });

  it('keeps the projection consumer behind a dead-letter queue', () => {
    t.hasResourceProperties('AWS::SQS::Queue', {
      RedrivePolicy: Match.objectLike({ maxReceiveCount: 5 }),
    });
  });

  it('serves the dashboard from a private bucket through CloudFront', () => {
    t.hasResourceProperties('AWS::S3::Bucket', {
      PublicAccessBlockConfiguration: {
        BlockPublicAcls: true,
        BlockPublicPolicy: true,
        IgnorePublicAcls: true,
        RestrictPublicBuckets: true,
      },
    });
    t.resourceCountIs('AWS::CloudFront::OriginAccessControl', 1);
  });

  if (enableRds) {
    it('optional RDS is single-AZ, micro, and reachable without a NAT', () => {
      t.hasResourceProperties('AWS::RDS::DBInstance', {
        MultiAZ: false,
        DBInstanceClass: 'db.t4g.micro',
      });
      t.resourceCountIs('AWS::EC2::NatGateway', 0);
    });
  } else {
    it('has no database or VPC by default', () => {
      t.resourceCountIs('AWS::RDS::DBInstance', 0);
      t.resourceCountIs('AWS::EC2::VPC', 0);
    });
  }
});
