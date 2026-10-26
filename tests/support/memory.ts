import { counterIds, InMemoryExchange, steppingClock } from '@shinrai/domain';
import { cmd, marketDefinition, operator } from './commands';

/** A fresh exchange with one open market and the given agents funded. */
export async function seededExchange(
  funding: Record<string, number> = { alice: 10_000, bob: 10_000 },
) {
  const ex = new InMemoryExchange(counterIds(), steppingClock('2026-10-20T20:00:00.000Z'));
  await ex.execute(cmd(operator, { type: 'OpenMarket', market: marketDefinition }));
  for (const [ownerId, amount] of Object.entries(funding)) {
    await ex.execute(cmd(operator, { type: 'GrantCredits', ownerId, amount }));
  }
  return ex;
}
