import { expect, test } from '@playwright/test';
import { apiGet, credits, openMarket } from './support';

test('empty state seeds the fixture, then an insufficient-credit order is rejected with zero mutation', async ({
  page,
  request,
}) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'No paper market yet' })).toBeVisible();
  await page.getByRole('button', { name: /Seed fixture/ }).click();
  await openMarket(page);

  const operator = page.getByTestId('available-operator');
  await expect(operator).toHaveText('1,000.00');
  const before = await apiGet<{ ledger: unknown[] }>(request, '/portfolio/operator');

  await page.getByLabel('Limit price (¢)').fill('99');
  await page.getByLabel('Contracts').fill('5000');
  await page.getByRole('button', { name: 'Submit paper order' }).click();

  const result = page.getByTestId('command-result');
  await expect(result).toContainText('Rejected');
  await expect(result).toContainText('INSUFFICIENT_CREDITS');
  await expect(result).toContainText('trace corr_');

  const after = await apiGet<{ ledger: unknown[] }>(request, '/portfolio/operator');
  expect(after.ledger).toEqual(before.ledger);
  await expect(page.getByTestId('reserved-operator')).toHaveText('0.00');
  expect(credits(await operator.textContent())).toBe(1000);
});
