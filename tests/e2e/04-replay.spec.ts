import { expect, test } from '@playwright/test';

test('replay grades the fixture deterministically and reproduces the same hash', async ({
  page,
}) => {
  await page.goto('/replay/');
  await expect(page.getByRole('heading', { name: 'No replay yet' })).toBeVisible();
  await page.getByRole('button', { name: 'Run the replay →' }).click();

  await expect(page.getByRole('heading', { name: 'The proof is in the replay.' })).toBeVisible();
  await expect(page.getByTestId('brier')).toHaveText('0.13');
  await expect(page.getByTestId('adherence')).toHaveText('100%');
  await expect(page.getByTestId('pnl')).toHaveText('+21.00');
  await expect(page.getByTestId('agents-table')).toContainText('agent-reckless');

  await page.getByRole('button', { name: 'Run it again →' }).click();
  await expect(page.getByText('2 replays, 1 distinct report hash')).toBeVisible();
  await expect(page.getByText('Reproduced')).toBeVisible();

  await page.getByText('Show data table').click();
  await expect(page.getByRole('table', { name: /Virtual credit curve/ })).toBeVisible();
});
