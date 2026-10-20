import { AsyncLocalStorage } from 'node:async_hooks';
import { context, SpanStatusCode, trace, type Attributes, type Span } from '@opentelemetry/api';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { BatchSpanProcessor, type SpanProcessor } from '@opentelemetry/sdk-trace-base';
import { NodeTracerProvider } from '@opentelemetry/sdk-trace-node';
import pino, { type Logger } from 'pino';

/** Paths never written to logs. Agent tool inputs flagged sensitive and any credential-shaped field. */
export const REDACT_PATHS = [
  'authorization',
  'headers.authorization',
  'req.headers.authorization',
  'apiKey',
  '*.apiKey',
  'token',
  '*.token',
  'password',
  '*.password',
  'secret',
  '*.secret',
  'OPENAI_API_KEY',
  '*.OPENAI_API_KEY',
];

/** Pino options shared by every service; Fastify takes these directly. */
export function loggerOptions(service: string, level = process.env.LOG_LEVEL ?? 'info') {
  return {
    name: service,
    level,
    redact: { paths: REDACT_PATHS, censor: '[REDACTED]' },
    base: { service },
    timestamp: pino.stdTimeFunctions.isoTime,
  };
}

export function createLogger(service: string, level?: string): Logger {
  return pino(loggerOptions(service, level));
}

let started = false;

/**
 * Registers an OpenTelemetry tracer provider. Spans are exported over OTLP/HTTP only when
 * OTEL_EXPORTER_OTLP_ENDPOINT is set (e.g. the compose `otel` profile); otherwise they are no-ops.
 */
export function startTracing(service: string): void {
  if (started) return;
  started = true;
  const endpoint = process.env.OTEL_EXPORTER_OTLP_ENDPOINT;
  const spanProcessors: SpanProcessor[] = endpoint
    ? [
        new BatchSpanProcessor(
          new OTLPTraceExporter({ url: `${endpoint.replace(/\/$/, '')}/v1/traces` }),
        ),
      ]
    : [];
  const provider = new NodeTracerProvider({ spanProcessors });
  provider.register();
  process.env.OTEL_SERVICE_NAME ??= service;
}

export type Correlation = { correlationId: string; causationId?: string };
const correlationStore = new AsyncLocalStorage<Correlation>();

/** Runs `fn` with a correlation id visible to every log line and span created inside it. */
export const withCorrelation = <T>(c: Correlation, fn: () => T): T => correlationStore.run(c, fn);
export const currentCorrelation = (): Correlation | undefined => correlationStore.getStore();

/** Wraps `fn` in a span tagged with the current correlation id; records errors. */
export async function traced<T>(
  name: string,
  attributes: Attributes,
  fn: (span: Span) => Promise<T>,
): Promise<T> {
  const tracer = trace.getTracer('shinrai');
  const correlation = currentCorrelation();
  return tracer.startActiveSpan(
    name,
    {
      attributes: {
        ...attributes,
        ...(correlation ? { 'shinrai.correlation_id': correlation.correlationId } : {}),
      },
    },
    context.active(),
    async (span) => {
      try {
        return await fn(span);
      } catch (err) {
        span.recordException(err as Error);
        span.setStatus({ code: SpanStatusCode.ERROR });
        throw err;
      } finally {
        span.end();
      }
    },
  );
}

export type { Logger };
