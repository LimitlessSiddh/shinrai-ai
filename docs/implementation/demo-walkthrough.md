# Demo walkthrough (about 3 minutes)

Setup: `pnpm stack:up && pnpm db:migrate && pnpm dev`, then open http://localhost:3000.

1. **Empty state → fixture.** Click **Seed fixture nba-2026-10-20.1**. This sets up BOS @ NYK with the five rules, and funds four paper accounts. The scripted maker rests NO 60 @ 42, NO 80 @ 40 and YES 40 @ 52.
2. **Happy agent run.** Choose *Research, cite evidence, request a bounded order* and click **Run agent**.
   - The thesis card shows **BUY YES · 50 contracts at 58¢ · 29.00 credits · Policy approved**.
   - Balances show `agent-research` with 50 YES and 0 reserved: the order fully filled against the maker's NO @ 42.
3. **Dossier.** Click **Open the decision dossier →**. Walk through:
   - the evidence it retrieved
   - the order
   - the policy gate (budget 29.00 / 100.00, size 50 / 100, scope, deadline)
   - **Committed**
   - then the trace table: six tool calls → `PlaceOrder · approved` → `reserve` and `fill` ledger postings → events published and projected once
4. **Unsafe action.** Back on Market, run *Unsafe: oversized order beyond budget*.
   - The activity feed shows **Policy blocked** with `ORDER_SIZE_EXCEEDED` and `BUDGET_EXCEEDED`.
   - Its dossier says *Zero orders, reservations or ledger entries were written.*
5. **Human approval.** Run *Large order held for human approval*. An **Awaiting approval** banner appears with Approve / Reject. Approving re-checks policy and places the order through the same command path, and the audit row records `HUMAN_APPROVED`.
6. **Human order and rejection.**
   - Submit BUY YES 5 @ 60 and see it **accepted**, filled at 58 with the improvement refunded.
   - Then submit 5,000 @ 99 and see it **rejected** with `INSUFFICIENT_CREDITS` and a trace id. No balance moves.
7. **Resolve once.** Click **Resolve market… → Confirm: BOS wins**.
   - `agent-research` ends at 1,021.00 (+21.00).
   - A retry with a new key returns the original resolution.
8. **Replay proof.** Open Replay and click **Run the replay →**, then **Run it again →**.
   - Brier 0.13, adherence 100%, +21.00 credits.
   - The reckless agent shows 12 violations.
   - **Reproduced:** 2 replays, 1 distinct report hash.
9. **Systems story.** Show `pnpm drill` (six PASS rows) and `pnpm cdk:test` (no NAT, EKS, MSK or ElastiCache; $30 budget). Close on the line that nothing is deployed.
