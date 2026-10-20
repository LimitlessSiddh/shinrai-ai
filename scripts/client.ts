/** Minimal CLI client for the local API (the "Agent SDK client" shape: start runs, read traces). */
export const API =
  process.env.API_URL ?? process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';
const TOKEN = process.env.SHINRAI_CLI_TOKEN ?? 'dev-operator-local-only';

export async function call<T>(
  method: 'GET' | 'POST',
  path: string,
  body?: unknown,
): Promise<{ data: T; correlationId: string }> {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: {
      authorization: `Bearer ${TOKEN}`,
      ...(body === undefined ? {} : { 'content-type': 'application/json' }),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  }).catch(() => {
    throw new Error(`cannot reach ${API}; start the stack with \`pnpm stack:up && pnpm dev\``);
  });
  const json = (await res.json()) as {
    data: T;
    correlationId: string;
    error?: { code: string; message: string };
  };
  if (!res.ok)
    throw new Error(
      `${method} ${path} -> ${res.status} ${json.error?.code}: ${json.error?.message} (trace ${json.correlationId})`,
    );
  return json;
}
