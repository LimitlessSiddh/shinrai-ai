import { call } from './client';

const FIXTURE = process.argv[2] ?? 'nba-2026-10-20.1';
const WEB = process.env.WEB_ORIGIN ?? 'http://localhost:3000';

await call('POST', `/fixtures/${FIXTURE}/seed`);
console.log(`seeded ${FIXTURE}`);

for (const scenarioId of ['research-happy', 'reckless-oversize', 'research-needs-approval']) {
  const r = await call<{ runId: string; status: string; correlationId: string }>(
    'POST',
    '/agent-runs',
    { fixtureVersion: FIXTURE, scenarioId },
  );
  console.log(
    `${scenarioId.padEnd(26)} ${r.data.status.padEnd(10)} ${WEB}/dossier/?run=${r.data.runId}`,
  );
}
console.log(
  `\nMarket command center: ${WEB}/\nReplay proof:          ${WEB}/replay/  (run \`pnpm demo:replay\`)`,
);
