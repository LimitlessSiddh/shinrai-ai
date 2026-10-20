import { expect, type APIRequestContext, type Page } from '@playwright/test';

export const API = 'http://localhost:4100';
export const FIXTURE = 'nba-2026-10-20.1';
const auth = { authorization: 'Bearer dev-operator-local-only' };

export async function apiPost<T>(
  request: APIRequestContext,
  path: string,
  data?: unknown,
): Promise<T> {
  const r = await request.post(`${API}${path}`, {
    headers: auth,
    ...(data === undefined ? {} : { data }),
  });
  expect(r.ok(), `${path} -> ${r.status()} ${await r.text()}`).toBe(true);
  return (await r.json()).data as T;
}

export async function apiGet<T>(request: APIRequestContext, path: string): Promise<T> {
  const r = await request.get(`${API}${path}`, { headers: auth });
  expect(r.ok(), `${path} -> ${r.status()}`).toBe(true);
  return (await r.json()).data as T;
}

/** Idempotent: seeds the fixture market if the e2e database does not have it yet. */
export async function ensureSeeded(request: APIRequestContext) {
  await apiPost(request, `/fixtures/${FIXTURE}/seed`);
}

export const MARKET_HEADING = 'Boston at New York';

export async function openOverview(page: Page) {
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1, name: MARKET_HEADING })).toBeVisible();
}

/** Selects an action-panel tab (Agent run / Paper order / Resolve). */
export async function actionTab(page: Page, name: 'Agent run' | 'Paper order' | 'Resolve') {
  await page.getByRole('tab', { name }).click();
}

export const toast = (page: Page) => page.getByTestId('toast').last();
