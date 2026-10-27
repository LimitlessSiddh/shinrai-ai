import { expect, test } from '@playwright/test';
import { actionTab, apiGet, openOverview } from './support';

test('empty state seeds the fixture, then an insufficient-credit order is rejected with zero mutation', async ({
  page,
  request,
}) => {
  await page.goto('/');
  await expect(
    page.getByRole('heading', { name: 'No research slate is available yet' }),
  ).toBeVisible();
  await page.getByRole('button', { name: /Prepare/ }).click();
  await openOverview(page);

  const operator = page.getByTestId('available-operator');
  await expect(operator).toHaveText('1,000.00');
  const before = await apiGet<{ ledger: unknown[] }>(request, '/portfolio/operator');

  await actionTab(page, 'Paper order');
  await page.getByLabel('Limit price (¢)').fill('99');
  await page.getByLabel('Contracts').fill('5000');
  await expect(page.getByText('Reserves up to 4,950.00 paper credits')).toBeVisible();
  await page.getByRole('button', { name: 'Submit paper order' }).click();

  const error = page.getByTestId('order-error');
  await expect(error).toContainText('INSUFFICIENT_CREDITS');
  await expect(error).toContainText('trace corr_');
  await expect(page.getByTestId('toast').last()).toContainText('Rejected');

  const after = await apiGet<{ ledger: unknown[] }>(request, '/portfolio/operator');
  expect(after.ledger).toEqual(before.ledger);
  await expect(page.getByTestId('reserved-operator')).toHaveText('0.00');
  await expect(operator).toHaveText('1,000.00');
});
