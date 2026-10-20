import { z } from 'zod';
import { Principal, Scope } from '@shinrai/contracts';

const Env = z.object({
  DATABASE_URL: z.string().default('postgres://shinrai:shinrai_local@localhost:5432/shinrai'),
  NATS_URL: z.string().default('nats://localhost:4222'),
  API_PORT: z.coerce.number().int().positive().default(4000),
  WEB_ORIGIN: z.string().default('http://localhost:3000'),
  SHINRAI_PROFILE: z.enum(['local', 'aws']).default('local'),
  SHINRAI_DEV_TOKENS: z.string().default(''),
  SHINRAI_MODEL: z.enum(['fake', 'openai']).default('fake'),
  SHINRAI_OPENAI_MODEL: z.string().default('gpt-5-mini'),
  OPENAI_API_KEY: z.string().optional(),
  SHINRAI_MODEL_MAX_TOOL_CALLS: z.coerce.number().int().min(1).max(12).default(8),
  SHINRAI_MODEL_MAX_RUNS_PER_DAY: z.coerce.number().int().min(0).max(50).default(5),
});

export type Config = ReturnType<typeof loadConfig>;

/** Scopes an agent principal may ever hold. Agents change state only through a gateway run. */
const AGENT_SCOPES = new Set<Scope>(['read', 'agent']);

/** Parses `token=tenant:actor:kind:scope|scope;...`. Agent principals are clamped to read-only scopes. */
export function parseDevTokens(raw: string): Map<string, Principal> {
  const out = new Map<string, Principal>();
  for (const entry of raw
    .split(';')
    .map((s) => s.trim())
    .filter(Boolean)) {
    const [token, spec] = entry.split('=');
    const [tenantId, actorId, kind, scopes] = (spec ?? '').split(':');
    const principal = Principal.parse({
      tenantId,
      actorId,
      kind,
      scopes: (scopes ?? '').split('|').filter(Boolean),
    });
    if (principal.kind === 'agent')
      principal.scopes = principal.scopes.filter((s) => AGENT_SCOPES.has(s));
    if (!token || token.length < 16) throw new Error('dev tokens must be at least 16 characters');
    out.set(token, principal);
  }
  return out;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env) {
  const e = Env.parse(env);
  const tokens = parseDevTokens(e.SHINRAI_DEV_TOKENS);
  if (e.SHINRAI_PROFILE === 'aws' && tokens.size > 0) {
    throw new Error(
      'dev tokens are refused in the aws profile; configure a real identity provider',
    );
  }
  const openaiEnabled = e.SHINRAI_MODEL === 'openai' && Boolean(e.OPENAI_API_KEY);
  return {
    databaseUrl: e.DATABASE_URL,
    natsUrl: e.NATS_URL,
    port: e.API_PORT,
    webOrigin: e.WEB_ORIGIN,
    profile: e.SHINRAI_PROFILE,
    tokens,
    model: {
      openaiEnabled,
      openaiModel: e.SHINRAI_OPENAI_MODEL,
      maxToolCalls: e.SHINRAI_MODEL_MAX_TOOL_CALLS,
      maxRunsPerDay: e.SHINRAI_MODEL_MAX_RUNS_PER_DAY,
    },
  };
}
