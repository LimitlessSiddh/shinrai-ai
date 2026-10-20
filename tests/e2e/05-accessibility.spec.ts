import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { ensureSeeded } from './support';

const VIEWS = [
  { path: '/', heading: 'The market is a conversation.' },
  { path: '/dossier/', heading: 'Before the market accepts an order,' },
  { path: '/replay/', heading: 'The proof is in the replay.' },
];

for (const v of VIEWS) {
  test(`${v.path} has no WCAG 2 A/AA violations`, async ({ page, request }) => {
    await ensureSeeded(request);
    await page.goto(v.path);
    await expect(page.getByRole('heading', { name: v.heading })).toBeVisible();
    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .analyze();
    expect(results.violations.map((x) => `${x.id}: ${x.nodes.length}`)).toEqual([]);
  });
}

test('keyboard: skip link first, visible signal focus ring, nav reachable', async ({ page }) => {
  await page.goto('/');
  await page.keyboard.press('Tab');
  const skip = page.getByRole('link', { name: 'Skip to content' });
  await expect(skip).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.locator('#main')).toBeFocused();

  await page.goto('/');
  for (let i = 0; i < 3; i++) await page.keyboard.press('Tab'); // skip link, brand, first nav item
  await expect(page.getByRole('link', { name: 'Market', exact: true })).toBeFocused();
  const outline = await page.evaluate(() => {
    const s = getComputedStyle(document.activeElement as HTMLElement);
    return { outline: s.outlineStyle, color: s.outlineColor };
  });
  expect(outline.outline).toBe('solid');
  expect(outline.color).toBe('rgb(199, 255, 61)'); // --color-signal
});

test('status is never color-only: every pill has an icon and text', async ({ page }) => {
  for (const path of ['/', '/dossier/', '/replay/']) {
    await page.goto(path);
    await page.waitForSelector('.pill');
    const pills = await page.$$eval('.pill', (els) =>
      els.map((e) => ({
        icon: !!e.querySelector('svg'),
        text: (e.textContent ?? '').trim().length > 0,
      })),
    );
    expect(pills.length).toBeGreaterThan(0);
    expect(pills.every((p) => p.icon && p.text)).toBe(true);
  }
});

test('reduced motion disables transitions', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  const duration = await page.$eval('.nav a', (el) => getComputedStyle(el).transitionDuration);
  expect(duration).toBe('0s');
});
