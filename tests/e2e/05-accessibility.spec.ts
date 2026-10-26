import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { ensureSeeded, MARKET_HEADING } from './support';

const VIEWS = [
  { path: '/', heading: MARKET_HEADING },
  { path: '/runs/', heading: 'Agent runs' },
  { path: '/dossier/', heading: /.+/ },
  { path: '/ledger/', heading: 'Ledger' },
  { path: '/replay/', heading: 'Replay proof' },
  { path: '/system/', heading: 'System' },
];

for (const v of VIEWS) {
  test(`${v.path} has no WCAG 2.1 A/AA violations`, async ({ page, request }) => {
    await ensureSeeded(request);
    await page.goto(v.path);
    await expect(page.getByRole('heading', { level: 1, name: v.heading })).toBeVisible();
    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .analyze();
    expect(
      results.violations.map(
        (x) => `${x.id}: ${x.nodes.map((n) => n.target.join(' ')).join(', ')}`,
      ),
    ).toEqual([]);
  });
}

test('keyboard: skip link first, visible signal focus ring, nav reachable', async ({ page }) => {
  await page.goto('/');
  await page.keyboard.press('Tab');
  await expect(page.getByRole('link', { name: 'Skip to content' })).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.locator('#main')).toBeFocused();

  await page.goto('/');
  for (let i = 0; i < 3; i++) await page.keyboard.press('Tab'); // skip link, brand, first nav item
  await expect(page.getByRole('link', { name: /^Overview/ })).toBeFocused();
  const outline = await page.evaluate(() => {
    const s = getComputedStyle(document.activeElement as HTMLElement);
    return { outline: s.outlineStyle, color: s.outlineColor };
  });
  expect(outline.outline).toBe('solid');
  expect(outline.color).toBe('rgb(199, 255, 61)'); // --color-signal
});

test('action tabs follow the ARIA tabs pattern with arrow keys', async ({ page }) => {
  await page.goto('/');
  const first = page.getByRole('tab', { name: 'Agent run' });
  await first.focus();
  await page.keyboard.press('ArrowRight');
  await expect(page.getByRole('tab', { name: 'Paper order' })).toBeFocused();
  await expect(page.getByRole('tab', { name: 'Paper order' })).toHaveAttribute(
    'aria-selected',
    'true',
  );
  await expect(page.getByRole('tabpanel')).toContainText('Limit price');
});

test('command palette opens with Ctrl+K and navigates by keyboard', async ({ page }) => {
  await page.goto('/');
  // Wait for the hydrated shell before sending a document-level shortcut. The button exercises
  // the same state transition and makes this keyboard test deterministic on a cold load.
  await page.getByRole('button', { name: 'Open command menu (Command K)' }).click();
  const input = page.getByRole('combobox', { name: 'Search commands' });
  await expect(input).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(input).not.toBeVisible();
  // Native dialog closing is immediate; let React commit its matching `open: false` state before
  // exercising the shortcut that transitions it back to `true`.
  await page.waitForTimeout(50);
  await page.keyboard.press('Control+k');
  await expect(input).toBeFocused();
  await input.fill('ledger');
  await page.keyboard.press('Enter');
  await expect(page.getByRole('heading', { level: 1, name: 'Ledger' })).toBeVisible();
});

test('status is never color-only: every pill has an icon and text', async ({ page }) => {
  for (const path of ['/', '/runs/', '/dossier/', '/replay/', '/system/']) {
    await page.goto(path);
    await page.waitForSelector('.pill');
    const pills = await page.$$eval('.pill', (els) =>
      els.map((e) => ({
        icon: !!e.querySelector('svg'),
        text: (e.textContent ?? '').trim().length > 0,
        badge: e.classList.contains('badge'),
      })),
    );
    expect(pills.length).toBeGreaterThan(0);
    // Count badges carry an aria-label instead of an icon.
    expect(pills.every((p) => (p.icon || p.badge) && p.text)).toBe(true);
  }
});

test('reduced motion disables transitions and animations', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  const duration = await page.$eval('.nav-link', (el) => getComputedStyle(el).transitionDuration);
  expect(duration).toBe('0s');
});
