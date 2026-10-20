import { describe, expect, it } from 'vitest';
import { DomainEvent, EVENT_SCHEMA_VERSION } from '@shinrai/contracts';
import { agent, cmd, MARKET_ID, operator } from '../support/commands';
import { seededExchange } from '../support/memory';

describe('domain events', () => {
  it('every event is schema-valid and carries full causal metadata', async () => {
    const ex = await seededExchange({ alice: 5_000, bob: 100 });
    await ex.execute(
      cmd(agent('bob'), {
        type: 'PlaceOrder',
        marketId: MARKET_ID,
        outcome: 'NO',
        price: 42,
        quantity: 2,
      }),
    );
    await ex.execute(
      cmd(
        agent('alice'),
        { type: 'PlaceOrder', marketId: MARKET_ID, outcome: 'YES', price: 58, quantity: 5 },
        'trace-key-01',
        'corr-trace-1',
      ),
    );
    await ex.execute(
      cmd(agent('bob'), {
        type: 'PlaceOrder',
        marketId: MARKET_ID,
        outcome: 'NO',
        price: 42,
        quantity: 50,
      }),
    );
    await ex.execute(
      cmd(operator, {
        type: 'ResolveMarket',
        marketId: MARKET_ID,
        winningOutcome: 'YES',
        source: 'fixture',
      }),
    );

    const events = await ex.events('demo');
    expect(new Set(events.map((e) => e.type))).toEqual(
      new Set([
        'market.opened',
        'credits.granted',
        'order.placed',
        'command.rejected',
        'market.resolved',
      ]),
    );
    for (const e of events) {
      expect(DomainEvent.parse(e)).toEqual(e);
      expect(e.schemaVersion).toBe(EVENT_SCHEMA_VERSION);
      expect(e.correlationId).toBeTruthy();
      expect(e.causationId).toBeTruthy();
      expect(e.actor.tenantId).toBe('demo');
      expect(Date.parse(e.occurredAt)).not.toBeNaN();
    }
    expect(new Set(events.map((e) => e.eventId)).size).toBe(events.length);
    expect(events.find((e) => e.correlationId === 'corr-trace-1')?.causationId).toBe(
      'cause-trace-key-01',
    );
  });
});
