import { readdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { Fixture } from '@shinrai/contracts';

export const FIXTURES_DIR = fileURLToPath(new URL('../../../fixtures/nba/', import.meta.url));
export const DEFAULT_FIXTURE = 'nba-2026-10-20.1';

/** Loads and strictly validates a versioned fixture: manifest.json plus scenarios/*.json in name order. */
export async function loadFixture(version = DEFAULT_FIXTURE): Promise<Fixture> {
  if (!/^[a-z0-9.-]+$/.test(version)) throw new Error(`invalid fixture version: ${version}`);
  const dir = `${FIXTURES_DIR}${version}/`;
  const manifest = JSON.parse(await readFile(`${dir}manifest.json`, 'utf8'));
  const files = (await readdir(`${dir}scenarios`)).filter((f) => f.endsWith('.json')).sort();
  const scenarios = await Promise.all(
    files.map(async (f) => JSON.parse(await readFile(`${dir}scenarios/${f}`, 'utf8'))),
  );
  const fixture = Fixture.parse({ manifest, scenarios });
  if (fixture.manifest.market.fixtureVersion !== fixture.manifest.fixtureVersion) {
    throw new Error('fixture market version does not match manifest version');
  }
  return fixture;
}

export async function listFixtures(): Promise<string[]> {
  return (await readdir(FIXTURES_DIR, { withFileTypes: true }))
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
    .sort();
}
