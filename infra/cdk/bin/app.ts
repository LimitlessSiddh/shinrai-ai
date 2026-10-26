import * as cdk from 'aws-cdk-lib';
import { ShinraiDemoStack } from '../lib/demo-stack';

/** Synth only. There is deliberately no deploy script; deploying requires explicit approval. */
const app = new cdk.App();
const environment = app.node.tryGetContext('environment') ?? 'demo';
const owner = app.node.tryGetContext('owner') ?? 'siddh';
for (const [k, v] of Object.entries({ project: 'agent-market-sandbox', environment, owner }))
  cdk.Tags.of(app).add(k, v);

new ShinraiDemoStack(app, `Shinrai-${environment}`, {
  environment,
  owner,
  enableRds: app.node.tryGetContext('enableRds') === 'true',
  budgetEmail: app.node.tryGetContext('budgetEmail'),
});
