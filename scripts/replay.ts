import { mkdir, writeFile } from 'node:fs/promises';
import { call } from './client';

const FIXTURE = process.argv[2] ?? 'nba-2026-10-20.1';
const r = await call<{
  evaluationId: string;
  hash: string;
  report: { agents: Record<string, Record<string, unknown>> };
}>('POST', '/replays', {
  fixtureVersion: FIXTURE,
});
await mkdir('var/reports', { recursive: true });
const file = `var/reports/${r.data.evaluationId}.json`;
await writeFile(file, JSON.stringify(r.data, null, 2));
console.log(`evaluation ${r.data.evaluationId}\nreport hash ${r.data.hash}\nsaved ${file}`);
for (const [agent, m] of Object.entries(r.data.report.agents)) {
  console.log(
    `${agent.padEnd(16)} brier=${m.brierScore} pnl=${m.paperPnl} adherence=${m.policyAdherence} violations=${m.policyViolations}`,
  );
}
