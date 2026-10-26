# Demo walkthrough (about 3 minutes)

Setup: `pnpm stack:up && pnpm db:migrate && pnpm dev`, then open http://localhost:3000. Press **⌘K / Ctrl+K** at any point to jump between views.

1. **Empty state → fixture.** Click **Seed fixture nba-2026-10-20.1** on Overview. Boston at New York opens with five rules and four funded paper accounts. The scripted maker rests NO 60 @ 42, NO 80 @ 40 and YES 40 @ 52; you can see them as depth in the **Order book**.
2. **Happy agent run.** In **Operator actions → Agent run**, keep *Research, cite evidence, request a bounded order* and click **Run agent**.
   - A toast links to the dossier.
   - **Active thesis** shows **BUY YES · 50 contracts at 58¢ · 29.00 credits · Policy approved**, plus the two cited evidence items.
   - The **edge meter** places the agent's 64% belief against the market's 58%.
3. **Dossier.** Open the dossier and walk the five stages: evidence → proposal → policy gate → ledger → events.
   - The policy panel shows budget and size meters (29.00 / 100.00, 50 / 100).
   - The ledger panel shows the balanced `reserve` and `fill` postings.
   - The trace table expands every tool call's input and output.
4. **Unsafe action.** Back on Overview, choose the scenario flagged **Unsafe** *oversized order beyond budget* and run it.
   - Its dossier stops at **Policy gate · Policy blocked** with `ORDER_SIZE_EXCEEDED` and `BUDGET_EXCEEDED`.
   - The ledger panel says *Zero orders, reservations or ledger entries were written.*
5. **Human approval.** Run *Large order held for human approval*. An amber queue appears at the top of Overview, and the sidebar badge counts it. **Approve** re-checks policy and places the order through the same command path, and the audit records `HUMAN_APPROVED`.
6. **Human order and rejection.** Under **Paper order**:
   - BUY YES 5 @ 60 is **accepted**: it fills at 58 and the improvement is refunded.
   - 5,000 @ 99 is **rejected** with `INSUFFICIENT_CREDITS`, shown inline with its trace id. No balance moves.
7. **Resolve once.** Go to **Resolve**, choose *YES — BOS wins*, and click **Confirm: resolve YES**.
   - `agent-research` ends at 1,021.00 (+21.00).
   - The order book empties, because resolution cancels every resting order.
8. **Ledger.** Show **Books balance · net 0.00** and the journal's debit and credit columns.
9. **Replay proof.** Click **Run the replay**, then **Run it again**.
   - Brier 0.1296, adherence 100%, +21.00 credits.
   - Switch to `agent-reckless` to see 12 violations.
   - **Reproduced:** 2 replays, 1 distinct report hash.
10. **System.** Show outbox backlog and projection lag at 0, an empty dead-letter queue, and the guarantees list. Close with `pnpm drill` (six PASS rows) and `pnpm cdk:test`, and note that nothing is deployed.
