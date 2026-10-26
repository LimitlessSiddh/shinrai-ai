import { expect, test } from '@playwright/test';
import { actionTab, apiGet, ensureSeeded, openOverview, toast } from './support';

test('fixture -> agent and human commands -> match -> settlement -> ledger, portfolio and trace', async ({
  page,
  request,
}) => {
  await ensureSeeded(request);
  await openOverview(page);

  // Agent research run through the gateway: approved and filled against scripted liquidity.
  await page.getByRole('radio', { name: /Research, cite evidence/ }).check();
  await page.getByRole('button', { name: 'Run agent' }).click();
  await expect(toast(page)).toContainText('Agent run completed');
  await expect(page.getByTestId('thesis-call')).toHaveText('BUY YES');
  await expect(page.getByTestId('thesis-order')).toHaveText('50 contracts at 58¢ · 29.00 credits');
  await expect(page.getByText('Policy approved').first()).toBeVisible();
  await expect(page.getByTestId('reserved-agent-research')).toHaveText('0.00');
  await expect(page.getByTestId('order-book')).toContainText(/42¢\s*10/); // maker NO @ 42: 60 placed, 50 taken by the agent

  // Human order crosses the remaining maker NO @ 42.
  await actionTab(page, 'Paper order');
  await page.getByLabel('Limit price (¢)').fill('60');
  await page.getByLabel('Contracts').fill('5');
  await page.getByRole('button', { name: 'Submit paper order' }).click();
  await expect(toast(page)).toContainText('Order filled');
  await expect(page.getByTestId('available-operator')).toHaveText('997.10'); // paid 5 x 58 (limit 60, 2 improvement refunded)

  // Resolve once, behind an explicit outcome choice, then verify settlement.
  await actionTab(page, 'Resolve');
  await page.getByRole('radio', { name: /YES — BOS wins/ }).check();
  await page.getByRole('button', { name: 'Confirm: resolve YES' }).click();
  await expect(toast(page)).toContainText('Market resolved YES');
  await expect(page.getByTestId('available-agent-research')).toHaveText('1,021.00'); // +50 x (100 - 58)
  await expect(page.getByTestId('available-operator')).toHaveText('1,002.10'); // + 5 x 100 settlement
  const pf = await apiGet<{ ledger: { reason: string }[] }>(request, '/portfolio/agent-research');
  expect(pf.ledger.map((l) => l.reason)).toContain('settle');

  // Run log -> dossier for the approved run.
  await page.getByRole('link', { name: 'Runs', exact: true }).click();
  await page.getByTestId('runs-table').getByRole('link', { name: 'research-happy' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'research-happy' })).toBeVisible();
  await expect(page.getByTestId('trace-table')).toContainText('PlaceOrder · approved');
  await expect(page.getByTestId('trace-table')).toContainText('order.placed');
  await expect(page.getByRole('heading', { name: 'Ledger impact' })).toBeVisible();

  // The ledger journal balances.
  await page.getByRole('link', { name: 'Ledger', exact: true }).click();
  await expect(page.getByText('Books balance · net 0.00')).toBeVisible();
});
