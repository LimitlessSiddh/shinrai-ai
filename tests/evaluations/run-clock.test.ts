import { describe, expect, it } from 'vitest';
import { runScenario, seedFixture } from '@shinrai/agent-tools';
import type { Clock } from '@shinrai/domain';
import { memoryContext, scenario } from '../support/agent';

describe('agent run clock', () => {
  it('uses the injected live clock instead of the replay stepping clock', async () => {
    const { ctx, recorder, fixture } = await memoryContext();
    await seedFixture(ctx);
    const fixed: Clock = { now: () => '2026-10-20T22:00:00.000Z' };
    await runScenario({ ...ctx, runClock: () => fixed }, scenario(fixture, 'research-happy'));
    expect(new Set(recorder.calls.map((c) => c.createdAt))).toEqual(
      new Set(['2026-10-20T22:00:00.000Z']),
    );
  });

  it('steps one simulated second per call by default (deterministic replay)', async () => {
    const { ctx, recorder, fixture } = await memoryContext();
    await seedFixture(ctx);
    await runScenario(ctx, scenario(fixture, 'research-happy'));
    const times = recorder.calls.map((c) => Date.parse(c.createdAt));
    expect(times.slice(1).map((t, i) => t - (times[i] ?? 0))).toEqual(
      Array(times.length - 1).fill(1000),
    );
  });
});
