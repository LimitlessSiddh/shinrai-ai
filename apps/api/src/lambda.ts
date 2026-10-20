/** AWS demo profile entry (API Gateway HTTP API -> Lambda). Same Fastify app as local. */
import awsLambdaFastify from '@fastify/aws-lambda';
import { buildApp } from './app';
import { loadConfig } from './config';

const app = await buildApp(loadConfig());
await app.ready();
export const handler = awsLambdaFastify(app);
