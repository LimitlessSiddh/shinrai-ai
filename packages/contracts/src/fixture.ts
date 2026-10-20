import { z } from 'zod';
import { AgentPolicy, Evidence, ModelAction } from './agent';
import { MarketDefinition } from './commands';
import { CreditCents, Id, IsoTime, Outcome, PriceCents, Quantity } from './primitives';

/** A versioned, checked-in NBA fixture: the only market data source V1 needs. */
export const FixtureManifest = z.strictObject({
  fixtureVersion: Id,
  fixtureKey: z.string().max(32),
  description: z.string().max(400),
  /** Replay clock starts here; every replay of this fixture uses the same timestamps. */
  replayStartsAt: IsoTime,
  market: MarketDefinition,
  grants: z.array(z.strictObject({ ownerId: Id, amount: CreditCents.positive() })),
  liquidity: z.array(
    z.strictObject({ ownerId: Id, outcome: Outcome, price: PriceCents, quantity: Quantity }),
  ),
  policies: z.array(AgentPolicy),
  evidence: z.array(Evidence),
  resolution: z.strictObject({
    winningOutcome: Outcome,
    source: z.string().max(200),
    finalScore: z.string().max(40),
  }),
});
export type FixtureManifest = z.infer<typeof FixtureManifest>;

/** A scripted agent run for the deterministic fake model. */
export const Scenario = z.strictObject({
  scenarioId: Id,
  agentId: Id,
  title: z.string().max(120),
  description: z.string().max(400),
  /** Seconds the run clock advances per tool call (used by the deadline scenario). */
  clockStepSeconds: z.number().int().positive().max(600).default(1),
  steps: z.array(ModelAction).min(1).max(20),
});
export type Scenario = z.infer<typeof Scenario>;

export const Fixture = z.strictObject({ manifest: FixtureManifest, scenarios: z.array(Scenario) });
export type Fixture = z.infer<typeof Fixture>;
