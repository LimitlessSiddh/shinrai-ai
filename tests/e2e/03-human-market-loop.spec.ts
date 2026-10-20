import { expect, test } from '@playwright/test';
import { apiGet, ensureSeeded, openMarket } from './support';

test('fixture -> agent and human commands -> match -> settlement -> ledger, portfolio and trace', async ({
  page,
  request,
}) => {
  await ensureSeeded(request);
  await openMarket(page);

  // Agent research run through the gateway: approved and filled against scripted liquidity.
  await page.getByLabel('Scenario').selectOption('research-happy');
  await page.getByRole('button', { name: 'Run agent' }).click();
  await expect(page.getByTestId('command-result')).toContainText('Agent run completed');
  await expect(page.locator('.thesis')).toHaveText('BUY YES');
  await expect(page.getByText('50 contracts at 58¢ · 29.00 credits')).toBeVisible();
  await expect(page.getByText('Policy approved').first()).toBeVisible();
  await expect(page.getByTestId('reserved-agent-research')).toHaveText('0.00');

  // Human order crosses the remaining maker NO @ 42.
  await page.getByLabel('Limit price (¢)').fill('60');
  await page.getByLabel('Contracts').fill('5');
  await page.getByRole('button', { name: 'Submit paper order' }).click();
  await expect(page.getByTestId('command-result').last()).toContainText('Order filled, filled 5');
  await expect(page.getByTestId('available-operator')).toHaveText('997.10'); // paid 5 x 58 (limit 60, 2 improvement refunded)

  // Resolve once (confirmation step), settle, then verify balances and the dossier trace.
  await page.getByRole('button', { name: 'Resolve market…' }).click();
  await page.getByRole('button', { name: 'Confirm: BOS wins' }).click();
  await expect(page.getByText(/Resolved YES/).first()).toBeVisible();
  await expect(page.getByTestId('available-agent-research')).toHaveText('1,021.00'); // +50 x (100 - 58)
  await expect(page.getByTestId('available-operator')).toHaveText('1,002.10'); // + 5 x 100 settlement
  const pf = await apiGet<{ ledger: { reason: string }[] }>(request, '/portfolio/agent-research');
  expect(pf.ledger.map((l) => l.reason)).toContain('settle');

  await page.getByRole('link', { name: 'Dossier', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Committed' })).toBeVisible();
  await expect(page.getByTestId('trace-table')).toContainText('PlaceOrder · approved');
  await expect(page.getByTestId('trace-table')).toContainText('order.placed');
});
