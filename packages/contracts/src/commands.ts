import { z } from 'zod';
import { CommandMeta, CreditCents, Id, IsoTime, Outcome, PriceCents, Quantity } from './primitives';

export const Team = z.strictObject({
  code: z.string().regex(/^[A-Z]{2,4}$/),
  name: z.string().min(1).max(64),
});

export const MarketDefinition = z.strictObject({
  marketId: Id,
  fixtureVersion: Id,
  league: z.literal('NBA'),
  season: z.string().regex(/^\d{4}-\d{2}$/),
  homeTeam: Team,
  awayTeam: Team,
  question: z.string().min(1).max(200),
  /** What a YES contract pays on, e.g. "BOS wins". */
  yesMeans: z.string().min(1).max(80),
  tipoffAt: IsoTime,
  rules: z.array(z.string().min(1).max(400)).min(1).max(20),
});
export type MarketDefinition = z.infer<typeof MarketDefinition>;

export const OpenMarket = z.strictObject({
  type: z.literal('OpenMarket'),
  market: MarketDefinition,
});
export const GrantCredits = z.strictObject({
  type: z.literal('GrantCredits'),
  ownerId: Id,
  amount: CreditCents.positive(),
});
export const PlaceOrder = z.strictObject({
  type: z.literal('PlaceOrder'),
  marketId: Id,
  outcome: Outcome,
  price: PriceCents,
  quantity: Quantity,
});
export const CancelOrder = z.strictObject({ type: z.literal('CancelOrder'), orderId: Id });
export const ResolveMarket = z.strictObject({
  type: z.literal('ResolveMarket'),
  marketId: Id,
  winningOutcome: Outcome,
  source: z.string().min(1).max(200),
});

export const CommandPayload = z.discriminatedUnion('type', [
  OpenMarket,
  GrantCredits,
  PlaceOrder,
  CancelOrder,
  ResolveMarket,
]);
export type CommandPayload = z.infer<typeof CommandPayload>;
export type CommandType = CommandPayload['type'];
export type PlaceOrder = z.infer<typeof PlaceOrder>;
export type CancelOrder = z.infer<typeof CancelOrder>;
export type ResolveMarket = z.infer<typeof ResolveMarket>;
export type GrantCredits = z.infer<typeof GrantCredits>;
export type OpenMarket = z.infer<typeof OpenMarket>;

export const Command = z.strictObject({ meta: CommandMeta, payload: CommandPayload });
export type Command = z.infer<typeof Command>;

/** Body a client sends; the API fills actor and timestamps from the authenticated principal. */
export const PlaceOrderRequest = PlaceOrder.omit({ type: true }).extend({
  idempotencyKey: CommandMeta.shape.idempotencyKey,
});
export const ResolveMarketRequest = ResolveMarket.omit({ type: true, marketId: true }).extend({
  idempotencyKey: CommandMeta.shape.idempotencyKey,
});
export const CancelOrderRequest = z.strictObject({
  idempotencyKey: CommandMeta.shape.idempotencyKey,
});
