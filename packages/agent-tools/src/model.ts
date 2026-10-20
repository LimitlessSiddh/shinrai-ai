import { ModelAction, type AgentConclusion } from '@shinrai/contracts';
import type { AgentRun } from './gateway';

/** Hard ceiling on tool calls per run, independent of any model's own limits. */
export const MAX_TOOL_CALLS = 12;

export type RunOutcome = {
  status: 'completed' | 'failed';
  conclusion: AgentConclusion | null;
  toolCalls: number;
};

/** A model that drives an AgentRun. Implementations only ever call `run.invoke` and conclude. */
export interface ModelRunner {
  readonly name: string;
  drive(run: AgentRun, task: string): Promise<RunOutcome>;
}

/** Deterministic scripted model for tests, CI, demos and replay. No network, no randomness. */
export class FakeModelRunner implements ModelRunner {
  readonly name = 'fake-deterministic';
  constructor(private readonly steps: readonly ModelAction[]) {}

  async drive(run: AgentRun): Promise<RunOutcome> {
    let toolCalls = 0;
    for (const raw of this.steps) {
      const step = ModelAction.parse(raw);
      if (step.kind === 'conclude')
        return { status: 'completed', conclusion: step.conclusion, toolCalls };
      if (++toolCalls > MAX_TOOL_CALLS) return { status: 'failed', conclusion: null, toolCalls };
      await run.invoke(step.tool, step.args);
    }
    return { status: 'failed', conclusion: null, toolCalls };
  }
}
