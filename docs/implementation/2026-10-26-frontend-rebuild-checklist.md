# Light research workspace implementation checklist

| Approved experience | Route                                    | Existing contract / boundary                                                        | Implementation state                                                                                                       |
| ------------------- | ---------------------------------------- | ----------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| Workspace           | `/`                                      | `GET /markets`, `GET /markets/:id`, `GET /fixtures`, `POST /fixtures/:version/seed` | Rebuild around live market, run, policy, evidence, and no-market states.                                                   |
| Prediction detail   | `/dossier?run=:id`                       | `GET /runs/:id`, `GET /trace/:correlationId`                                        | Preserve trace, evidence, policy, audit, ledger, and event records; redesign presentation only.                            |
| Agent setup         | `/agents`                                | No version/policy configuration endpoint exists.                                    | Local, typed draft only; Save/Test visibly records no API change and documents the missing contract.                       |
| Experiments         | `/experiments`                           | `GET /evaluations`, `POST /replays`                                                 | Compare reports only within the same fixture version; surface Brier, accuracy proxy/coverage, sample and baseline context. |
| Arena               | `/arena`                                 | No public-record API exists.                                                        | Read-only illustrative adapter with an explicit local-data label; no public or private backend data is inferred.           |
| Audit surfaces      | `/runs`, `/ledger`, `/system`, `/replay` | Existing query/command routes                                                       | Keep accessible as secondary research/audit routes without modifying their server behavior.                                |

## Preserved behavior

- All paper market mutations remain on the existing server-owned command path.
- The browser never receives provider credentials, ledger write access, or a policy bypass.
- Dossier continues to show concise records and evidence, never private reasoning traces.
- Replay comparisons retain the API's versioned fixture and report-hash boundaries.

## Deliberate contract gaps

Agent configuration/version persistence and opt-in public Arena records need server contracts before they can be connected. The current `RunDetail` contract also has no dedicated structured uncertainty field, and the evaluation report does not provide accuracy; the Dossier and Experiments views label those absences instead of fabricating data. The frontend does not simulate persistence or claim that its local display represents production data.

## Verification evidence

- Production build, lint, root type-check, unit tests (32), evaluation tests (27), integration tests (35), and end-to-end tests (42) pass.
- `pnpm audit --prod --audit-level=high` reported no known production vulnerabilities.
- Browser accessibility checks pass for the Workspace, Agents, Experiments, Arena, audit, and seeded Prediction Detail routes.
- Screenshot E2E coverage is stored under `docs/demo/screenshots/` for 1440px desktop, 1280px laptop, 768px tablet, and 390px mobile viewports.
