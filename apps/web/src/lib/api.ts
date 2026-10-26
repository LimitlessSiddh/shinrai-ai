'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';
// Local-only operator identity (not a secret). The API refuses dev tokens in the aws profile.
const TOKEN = process.env.NEXT_PUBLIC_OPERATOR_TOKEN ?? 'dev-operator-local-only';

export class ApiFailure extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly correlationId: string | null,
    readonly data: unknown = null,
  ) {
    super(message);
  }
}

export type ApiOk<T> = { data: T; correlationId: string };

export async function api<T>(
  path: string,
  init?: { method?: 'GET' | 'POST'; body?: unknown },
): Promise<ApiOk<T>> {
  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, {
      method: init?.method ?? 'GET',
      headers: {
        authorization: `Bearer ${TOKEN}`,
        ...(init?.body === undefined ? {} : { 'content-type': 'application/json' }),
      },
      ...(init?.body === undefined ? {} : { body: JSON.stringify(init.body) }),
      cache: 'no-store',
    });
  } catch {
    throw new ApiFailure(
      0,
      'API_UNREACHABLE',
      `Cannot reach the Shinrai API at ${API_URL}. Is \`pnpm dev\` running?`,
      null,
    );
  }
  const json = (await res.json().catch(() => ({}))) as {
    data?: T;
    error?: { code: string; message: string };
    correlationId?: string;
  };
  if (!res.ok || json.error) {
    throw new ApiFailure(
      res.status,
      json.error?.code ?? 'HTTP_ERROR',
      json.error?.message ?? res.statusText,
      json.correlationId ?? null,
      json.data,
    );
  }
  return { data: json.data as T, correlationId: json.correlationId ?? '' };
}

export type Poll<T> = {
  data: T | null;
  error: ApiFailure | null;
  loading: boolean;
  refresh: () => void;
};

/** Polls a read endpoint (V1 uses polling, not sockets). Pauses while the tab is hidden. */
export function usePoll<T>(path: string | null, intervalMs = 2000): Poll<T> {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<ApiFailure | null>(null);
  const [loading, setLoading] = useState(path !== null);
  const [tick, setTick] = useState(0);
  const alive = useRef(true);

  const refresh = useCallback(() => setTick((t) => t + 1), []);

  useEffect(() => {
    alive.current = true;
    if (!path) return;
    let timer: ReturnType<typeof setTimeout>;
    const load = async () => {
      if (document.visibilityState === 'visible') {
        try {
          const r = await api<T>(path);
          if (alive.current) {
            setData(r.data);
            setError(null);
          }
        } catch (e) {
          if (alive.current)
            setError(e instanceof ApiFailure ? e : new ApiFailure(0, 'UNKNOWN', String(e), null));
        } finally {
          if (alive.current) setLoading(false);
        }
      }
      timer = setTimeout(load, intervalMs);
    };
    void load();
    return () => {
      alive.current = false;
      clearTimeout(timer);
    };
  }, [path, intervalMs, tick]);

  return { data, error, loading, refresh };
}

export const credits = (creditCents: number | null | undefined) =>
  creditCents === null || creditCents === undefined
    ? '—'
    : (creditCents / 100).toLocaleString('en-US', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      });

export const signedCredits = (cc: number) => `${cc >= 0 ? '+' : '−'}${credits(Math.abs(cc))}`;

export const percent = (x: number | null | undefined, digits = 1) =>
  x === null || x === undefined ? '—' : `${(x * 100).toFixed(digits)}%`;

export const time = (iso: string | null | undefined) =>
  iso
    ? new Date(iso).toLocaleTimeString('en-US', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false,
      })
    : '—';

export const newKey = (prefix: string) => `${prefix}-${crypto.randomUUID()}`;
