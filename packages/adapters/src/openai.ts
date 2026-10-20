import { AgentConclusion, ToolName, ToolSchemas } from '@shinrai/contracts';
import {
  MAX_TOOL_CALLS,
  type AgentRun,
  type ModelRunner,
  type RunOutcome,
} from '@shinrai/agent-tools';

const INSTRUCTIONS = `You are a research agent in a PAPER-ONLY NBA prediction-market sandbox. Credits have no cash value.
Use only the provided tools. Read the market and rules, check your portfolio, search evidence and cite evidence ids you retrieved.
You may request at most one limit order within your policy. Finish with your probability that YES resolves, a one-sentence thesis
and the evidence ids you relied on. Never ask for, or claim to have, any other capability.`;

const DESCRIPTIONS: Record<ToolName, string> = {
  getMarket: 'Read the market question, teams, status and best paper prices.',
  getRules: 'Read the resolution rules for a market.',
  getPortfolio: "Read this agent's own paper balance and positions.",
  searchEvidence: 'Search the fixture evidence for a market.',
  requestOrder:
    'Request a paper limit order. Deterministic policy may block it or hold it for approval.',
};

/**
 * Opt-in real model through the OpenAI Agents SDK. Only constructed when SHINRAI_MODEL=openai and a key is set.
 * Every SDK tool call is routed through `run.invoke`, so policy, schemas and recording are identical to the fake.
 * Capped by `maxTurns`; the caller enforces the per-day run cap before constructing it.
 */
export class OpenAIAgentsRunner implements ModelRunner {
  readonly name: string;
  constructor(private readonly opts: { model: string; maxTurns: number }) {
    this.name = `openai:${opts.model}`;
  }

  async drive(run: AgentRun, task: string): Promise<RunOutcome> {
    // Lazily imported: the SDK is an optional dependency and never loads in tests or CI.
    const sdk = await import('@openai/agents');
    let toolCalls = 0;
    const tools = ToolName.options.map((name) =>
      sdk.tool({
        name,
        description: DESCRIPTIONS[name],
        parameters: ToolSchemas[name].input,
        execute: async (args: unknown) => {
          if (++toolCalls > Math.min(this.opts.maxTurns, MAX_TOOL_CALLS))
            return JSON.stringify({ ok: false, error: 'tool budget exhausted' });
          return JSON.stringify(await run.invoke(name, args));
        },
      }),
    );
    const agent = new sdk.Agent({
      name: 'shinrai-research',
      instructions: INSTRUCTIONS,
      model: this.opts.model,
      tools,
      outputType: AgentConclusion,
    });
    try {
      const result = await sdk.run(agent, task, { maxTurns: this.opts.maxTurns });
      const conclusion = AgentConclusion.safeParse(result.finalOutput);
      return {
        status: conclusion.success ? 'completed' : 'failed',
        conclusion: conclusion.success ? conclusion.data : null,
        toolCalls,
      };
    } catch {
      return { status: 'failed', conclusion: null, toolCalls };
    }
  }
}
