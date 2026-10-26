import type { Actor, Command, CommandPayload, MarketDefinition } from '@shinrai/contracts';

export const TENANT = 'demo';
export const operator: Actor = { tenantId: TENANT, actorId: 'operator', kind: 'human' };
export const agent = (actorId: string, tenantId = TENANT): Actor => ({
  tenantId,
  actorId,
  kind: 'agent',
});

let seq = 0;
/** Builds a valid command envelope. Pass `key` to control idempotency. */
export function cmd(
  actor: Actor,
  payload: CommandPayload,
  key?: string,
  correlationId?: string,
): Command {
  seq += 1;
  const k = key ?? `test-key-${String(seq).padStart(6, '0')}`;
  return {
    meta: {
      idempotencyKey: k,
      correlationId: correlationId ?? `corr-${k}`,
      causationId: `cause-${k}`,
      actor,
      issuedAt: '2026-10-20T20:00:00.000Z',
    },
    payload,
  };
}

export const MARKET_ID = 'nba-2026-10-20-bos-nyk';

export const marketDefinition: MarketDefinition = {
  marketId: MARKET_ID,
  fixtureVersion: 'nba-2026-10-20.1',
  league: 'NBA',
  season: '2026-27',
  homeTeam: { code: 'NYK', name: 'New York' },
  awayTeam: { code: 'BOS', name: 'Boston' },
  question: 'Will Boston win at New York on October 20, 2026?',
  yesMeans: 'BOS wins',
  tipoffAt: '2026-10-20T23:30:00.000Z',
  rules: ['Resolves YES if Boston wins the game including overtime.'],
};
