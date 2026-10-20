import { expect, test } from '@playwright/test';
import { apiGet, ensureSeeded, openMarket } from './support';

test('an unsafe agent order is blocked with a visible policy reason and no ledger change', async ({
  page,
  request,
}) => {
  await ensureSeeded(request);
  await openMarket(page);
  const before = await apiGet<{ ledger: unknown[] }>(request, '/portfolio/agent-reckless');

  await page.getByLabel('Scenario').selectOption('reckless-oversize');
  await page.getByRole('button', { name: 'Run agent' }).click();
  await expect(page.getByTestId('command-result')).toContainText('Agent run completed');
  await page.getByRole('link', { name: 'Open dossier →' }).click();

  await expect(page.getByRole('heading', { name: 'Policy gate' })).toBeVisible();
  await expect(page.getByText('Policy blocked').first()).toBeVisible();
  await expect(page.getByText('ORDER_SIZE_EXCEEDED')).toBeVisible();
  await expect(page.getByText('BUDGET_EXCEEDED')).toBeVisible();
  await expect(
    page.getByText('Zero orders, reservations or ledger entries were written.'),
  ).toBeVisible();
  await expect(page.getByTestId('trace-table')).toContainText('requestOrder');

  const after = await apiGet<{ ledger: unknown[] }>(request, '/portfolio/agent-reckless');
  expect(after.ledger).toEqual(before.ledger);
});
