// Response shapes the dashboard reads. Business rules stay on the server; these are display types only.
import type { AgentPolicy, Evidence, Market, Order, Position } from '@shinrai/contracts';

export type MarketRow = {
  market_id: string;
  definition: { question: string; awayTeam: { code: string }; homeTeam: { code: string } };
  status: 'open' | 'resolved';
  winning_outcome: 'YES' | 'NO' | null;
};

export type MarketViewDto = {
  market: Market;
  bestAsk: { YES: number | null; NO: number | null };
  lastYesPrice: number | null;
  openingYesPrice: number | null;
  matchedContracts: number;
  openOrders: number;
};

export type OrderRequest = {
  marketId: string;
  outcome: 'YES' | 'NO';
  price: number;
  quantity: number;
  probabilityYes: number;
  rationale: string;
  evidenceIds: string[];
};

export type PolicyReason = { code: string; message: string };

export type RunSummary = {
  run_id: string;
  agent_id: string;
  scenario: string;
  model: string;
  status: 'running' | 'completed' | 'failed';
  correlation_id: string;
  started_at: string;
  conclusion: { probabilityYes: number; thesis: string; evidenceIds: string[] } | null;
  order_request: OrderRequest | Record<string, unknown> | null;
  order_result: {
    status?: string;
    filledQuantity?: number;
    code?: string;
    reasons?: unknown;
  } | null;
  policy_decision: 'approved' | 'blocked' | 'approval_required' | 'not_applicable' | null;
  reasons: PolicyReason[] | null;
  order_ok: boolean | null;
  tool_calls: number;
  blocked_calls: number;
  pending_approval: string | null;
  market_id: string;
};

export type BookLevel = { outcome: 'YES' | 'NO'; price: number; quantity: number; orders: number };
export type FillRow = {
  fill_id: string;
  yes_price: number;
  quantity: number;
  yes_owner_id: string;
  no_owner_id: string;
  sequence: number;
  created_at: string;
};

export type MarketDetail = {
  market: Market;
  book: BookLevel[];
  fills: FillRow[];
  projection: {
    view: MarketViewDto;
    appliedEvents: number;
    lastEventId: string;
    updatedAt: string;
  } | null;
  evidence: Evidence[];
  runs: RunSummary[];
};

export type PortfolioDto = {
  ownerId: string;
  projection: {
    view: { available: number; reserved: number; positions: Position[]; openOrders: Order[] };
    applied_events: number;
    updated_at: string;
  } | null;
  ledger: {
    tx_id: string;
    reason: string;
    correlation_id: string;
    created_at: string;
    direction: 'debit' | 'credit';
    amount: number;
    account_id: string;
  }[];
};

export type ActivityRow = {
  event_id: string;
  type: string;
  correlation_id: string;
  actor_id: string;
  status: 'accepted' | 'rejected' | 'blocked' | 'info';
  summary: string;
  occurred_at: string;
};

export type ToolCallRow = {
  tool_call_id: string;
  seq: number;
  tool: string;
  input: unknown;
  output: unknown;
  ok: boolean;
  policy_decision: RunSummary['policy_decision'];
  reasons: PolicyReason[];
  created_at: string;
};

export type Trace = {
  correlationId: string;
  runs: {
    run_id: string;
    agent_id: string;
    scenario: string;
    status: string;
    conclusion: RunSummary['conclusion'];
  }[];
  toolCalls: ToolCallRow[];
  audit: {
    id: number;
    command_type: string;
    outcome: string;
    policy: { decision: string; reasons: PolicyReason[] };
    rejection_code: string | null;
    event_id: string;
    created_at: string;
  }[];
  ledger: {
    tx_id: string;
    reason: string;
    event_id: string;
    created_at: string;
    entries: { entryNo: number; accountId: string; direction: string; amount: number }[];
  }[];
  events: {
    outbox_id: number;
    event_id: string;
    type: string;
    occurred_at: string;
    published_at: string | null;
    deliveries: string[];
  }[];
  activity: ActivityRow[];
  evaluations: { evaluation_id: string; report_hash: string }[];
};

export type RunDetail = {
  run: RunSummary & { policy: AgentPolicy; finished_at: string | null };
  approvals: {
    approval_id: string;
    status: string;
    request: OrderRequest;
    decided_by: string | null;
  }[];
  trace: Trace;
};

export type AgentReport = {
  forecasts: number;
  brierScore: number | null;
  logLoss: number | null;
  startingCredits: number;
  endingCredits: number;
  paperPnl: number;
  maxDrawdown: number;
  policyAdherence: number;
  policyViolations: number;
  toolCallSuccessRate: number;
  equityCurve: number[];
};

export type Evaluation = {
  evaluation_id: string;
  fixture_version: string;
  replay_tenant: string;
  report_hash: string;
  correlation_id: string;
  created_at: string;
  report: {
    fixtureVersion: string;
    question: string;
    resolution: { winningOutcome: string; finalScore: string };
    market: {
      matchedContracts: number;
      openingYesPrice: number | null;
      lastYesPrice: number | null;
    };
    runs: {
      scenarioId: string;
      agentId: string;
      status: string;
      probabilityYes: number | null;
      toolCalls: { tool: string; ok: boolean; policy: string; reasons: string[] }[];
    }[];
    agents: Record<string, AgentReport>;
    ledger: { transactions: number; fingerprint: string };
    approvalsPending: number;
  };
};

export type FixtureInfo = {
  fixtureVersion: string;
  fixtureKey: string;
  marketId: string;
  scenarios: { scenarioId: string; agentId: string; title: string; description: string }[];
};

export type JournalTx = {
  tx_id: string;
  reason: 'grant' | 'reserve' | 'fill' | 'release' | 'settle';
  order_id: string | null;
  correlation_id: string;
  created_at: string;
  seq: number;
  entries: { entryNo: number; accountId: string; direction: 'debit' | 'credit'; amount: number }[];
};

export type LedgerDto = {
  transactions: JournalTx[];
  accounts: {
    account_id: string;
    kind: 'available' | 'reserved' | 'escrow' | 'issuance';
    balance: number;
  }[];
};

export type SystemDto = {
  events: number;
  unpublished: number;
  unprojected: number;
  last_event_at: string | null;
  last_projected_at: string | null;
  commands: number;
  rejected: number;
  ledger_transactions: number;
  deadLetters: {
    consumer: string;
    event_id: string;
    attempts: number;
    error: string;
    created_at: string;
  }[];
  profile: string;
  model: string;
};
