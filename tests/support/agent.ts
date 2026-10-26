import { loadFixture } from '@shinrai/adapters';
import { fixtureEvidence, MemoryRecorder, type FixtureContext } from '@shinrai/agent-tools';
import type { Fixture } from '@shinrai/contracts';
import { counterIds, InMemoryExchange, steppingClock } from '@shinrai/domain';

/** Offline context: in-memory exchange, recorder and fixture evidence, deterministic ids and clock. */
export async function memoryContext(fixture?: Fixture) {
  const fx = fixture ?? (await loadFixture());
  const clock = steppingClock(fx.manifest.replayStartsAt);
  const ids = counterIds();
  const exchange = new InMemoryExchange(ids, clock);
  const recorder = new MemoryRecorder();
  const ctx: FixtureContext = {
    fixture: fx,
    tenantId: 'eval',
    exchange,
    recorder,
    evidence: fixtureEvidence(fx),
    ids,
    clock,
    keyPrefix: 'eval',
  };
  return { ctx, exchange, recorder, fixture: fx };
}

export const scenario = (fixture: Fixture, id: string) => {
  const s = fixture.scenarios.find((x) => x.scenarioId === id);
  if (!s) throw new Error(`no scenario ${id}`);
  return s;
};
