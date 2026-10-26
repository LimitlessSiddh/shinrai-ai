import { expect, test } from '@playwright/test';

test('replay grades the fixture deterministically and reproduces the same hash', async ({
  page,
}) => {
  await page.goto('/replay/');
  await expect(page.getByRole('heading', { name: 'No replay yet' })).toBeVisible();
  await page.getByRole('button', { name: 'Run the replay' }).click();

  await expect(page.getByTestId('brier')).toHaveText('0.1296');
  await expect(page.getByTestId('adherence')).toHaveText('100%');
  await expect(page.getByTestId('pnl')).toHaveText('+21.00');
  await expect(page.getByTestId('agents-table')).toContainText('agent-reckless');

  await page.getByRole('button', { name: 'Run it again' }).click();
  await expect(page.getByTestId('reproduced')).toHaveText('2 replays, 1 distinct report hash');
  await expect(page.getByText('Reproduced', { exact: true })).toBeVisible();

  await page.getByRole('button', { name: 'agent-reckless' }).click();
  await expect(page.getByTestId('pnl')).toHaveText('+0.00');

  await page.getByText('Show data table').click();
  await expect(page.getByRole('table', { name: /Virtual credit curve/ })).toBeVisible();
});
