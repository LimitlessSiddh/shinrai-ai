import {
  EVENT_SCHEMA_VERSION,
  type Command,
  type CommandResult,
  type DomainEvent,
  type Market,
  type Order,
  type Position,
  type Rejection,
} from '@shinrai/contracts';
import {
  decideCancel,
  decideGrant,
  decideOpenMarket,
  decidePlaceOrder,
  decideResolve,
  type Decision,
  type EventDraft,
} from './decide';
import { availableAccount, escrowAccount } from './ledger';
import type { Clock, IdSource } from './ports';

/** Idempotency scope: one key per tenant, actor and command type. */
export const idempotencyScope = (c: Command) =>
  [c.meta.actor.tenantId, c.meta.actor.actorId, c.payload.type, c.meta.idempotencyKey].join('|');

/** Stable JSON with sorted keys, so equal payloads compare equal regardless of key order. */
export function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonicalJson(v)}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

export type CommitInput = {
  command: Command;
  scope: string;
  requestFingerprint: string;
  decision: Decision | null;
  event: DomainEvent | null;
  result: CommandResult;
  rejection: Rejection | null;
  policy: PolicyRecord;
};

/** The policy result recorded with every command in the audit log. */
export type PolicyRecord = {
  decision: 'approved' | 'blocked' | 'approval_required';
  reasons: { code: string; message: string }[];
};

export const SYSTEM_POLICY: PolicyRecord = {
  decision: 'approved',
  reasons: [{ code: 'SYSTEM', message: 'system, seed or test command' }],
};

/** The persistence a command needs. Implementations must make `commit` atomic with every read. */
export interface CommandStore {
  /** Acquire locks for the command before any read (no-op in memory). */
  prepare(command: Command): Promise<void>;
  findIdempotent(
    scope: string,
  ): Promise<{ requestFingerprint: string; result: CommandResult } | null>;
  market(tenantId: string, marketId: string): Promise<Market | null>;
  balance(tenantId: string, accountId: string): Promise<number>;
  openOrders(tenantId: string, marketId: string): Promise<Order[]>;
  order(tenantId: string, orderId: string): Promise<Order | null>;
  positions(tenantId: string, marketId: string): Promise<Position[]>;
  resolutionEvent(tenantId: string, marketId: string): Promise<DomainEvent | null>;
  commit(input: CommitInput): Promise<void>;
}

export type ExecutorDeps = {
  store: CommandStore;
  ids: IdSource;
  clock: Clock;
  policy?: PolicyRecord;
};

/**
 * The single command path for humans, agents and replays:
 * idempotency check -> decide (pure) -> one immutable event -> atomic commit.
 * A rejection records only an audit/outbox fact; it never touches orders, reservations or the ledger.
 */
export async function executeCommand(command: Command, deps: ExecutorDeps): Promise<CommandResult> {
  const { store, ids, clock } = deps;
  const policy = deps.policy ?? SYSTEM_POLICY;
  const { meta, payload } = command;
  const scope = idempotencyScope(command);
  const requestFingerprint = canonicalJson(payload);
  await store.prepare(command);

  const prior = await store.findIdempotent(scope);
  if (prior) {
    if (prior.requestFingerprint !== requestFingerprint) {
      return rejected(
        command,
        {
          code: 'IDEMPOTENCY_CONFLICT',
          message: 'idempotency key reused with a different request',
        },
        null,
      );
    }
    return { ...prior.result, replayed: true };
  }

  const tenantId = meta.actor.tenantId;
  const now = clock.now();
  let decided;
  switch (payload.type) {
    case 'OpenMarket':
      decided = decideOpenMarket(
        payload,
        meta.actor,
        await store.market(tenantId, payload.market.marketId),
        now,
      );
      break;
    case 'GrantCredits':
      decided = decideGrant(payload, meta.actor, ids);
      break;
    case 'PlaceOrder': {
      const market = await store.market(tenantId, payload.marketId);
      decided = decidePlaceOrder(
        payload,
        meta.actor,
        {
          market,
          available: await store.balance(tenantId, availableAccount(meta.actor.actorId)),
          book: market ? await store.openOrders(tenantId, payload.marketId) : [],
        },
        ids,
        now,
      );
      break;
    }
    case 'CancelOrder':
      decided = decideCancel(
        payload,
        meta.actor,
        await store.order(tenantId, payload.orderId),
        ids,
      );
      break;
    case 'ResolveMarket': {
      const market = await store.market(tenantId, payload.marketId);
      const r = decideResolve(
        payload,
        meta.actor,
        {
          market,
          openOrders: market ? await store.openOrders(tenantId, payload.marketId) : [],
          positions: market ? await store.positions(tenantId, payload.marketId) : [],
          escrowBalance: market
            ? await store.balance(tenantId, escrowAccount(payload.marketId))
            : 0,
        },
        ids,
      );
      if (r.ok === 'already') {
        // Exactly-once settlement: report the original resolution; write nothing new.
        const original = await store.resolutionEvent(tenantId, payload.marketId);
        if (!original)
          throw new Error(`resolved market ${payload.marketId} has no resolution event`);
        return {
          status: 'accepted',
          commandType: payload.type,
          correlationId: meta.correlationId,
          event: original,
          replayed: true,
        };
      }
      decided = r;
      break;
    }
  }

  if (!decided.ok) {
    const event = envelope(command, ids.next('evt'), now, {
      type: 'command.rejected',
      aggregateId: aggregateOf(command),
      payload: { commandType: payload.type, ...decided.rejection },
    });
    const result = rejected(command, decided.rejection, event.eventId);
    await store.commit({
      command,
      scope,
      requestFingerprint,
      decision: null,
      event,
      result,
      rejection: decided.rejection,
      policy,
    });
    return result;
  }

  const event = envelope(command, ids.next('evt'), now, decided.decision.event);
  const result: CommandResult = {
    status: 'accepted',
    commandType: payload.type,
    correlationId: meta.correlationId,
    event,
    replayed: false,
  };
  await store.commit({
    command,
    scope,
    requestFingerprint,
    decision: decided.decision,
    event,
    result,
    rejection: null,
    policy,
  });
  return result;
}

function rejected(command: Command, r: Rejection, eventId: string | null): CommandResult {
  return {
    status: 'rejected',
    commandType: command.payload.type,
    correlationId: command.meta.correlationId,
    code: r.code,
    message: r.message,
    eventId,
    replayed: false,
  };
}

function aggregateOf(c: Command): string {
  switch (c.payload.type) {
    case 'OpenMarket':
      return c.payload.market.marketId;
    case 'GrantCredits':
      return c.payload.ownerId;
    case 'CancelOrder':
      return c.payload.orderId;
    default:
      return c.payload.marketId;
  }
}

export function envelope(
  command: Command,
  eventId: string,
  occurredAt: string,
  draft: EventDraft,
): DomainEvent {
  return {
    eventId,
    schemaVersion: EVENT_SCHEMA_VERSION,
    occurredAt,
    tenantId: command.meta.actor.tenantId,
    correlationId: command.meta.correlationId,
    causationId: command.meta.causationId,
    actor: command.meta.actor,
    ...draft,
  } as DomainEvent;
}
