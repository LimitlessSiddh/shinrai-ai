import { expect, test } from '@playwright/test';
import { MARKET_HEADING } from './support';

const VIEWS = [
  { name: 'overview', path: '/', heading: MARKET_HEADING },
  { name: 'runs', path: '/runs/', heading: 'Agent runs' },
  { name: 'dossier', path: '/dossier/', heading: /.+/ },
  { name: 'ledger', path: '/ledger/', heading: 'Ledger' },
  { name: 'replay', path: '/replay/', heading: 'Replay proof' },
  { name: 'system', path: '/system/', heading: 'System' },
];
const SIZES = [
  { label: 'desktop-1440', width: 1440, height: 1000 },
  { label: 'mobile-390', width: 390, height: 844 },
];

for (const size of SIZES) {
  for (const v of VIEWS) {
    test(`screenshot ${v.name} @ ${size.label}`, async ({ page }) => {
      await page.setViewportSize({ width: size.width, height: size.height });
      await page.emulateMedia({ reducedMotion: 'reduce' }); // settled frames, no mid-animation captures
      await page.goto(v.path);
      await expect(page.getByRole('heading', { level: 1, name: v.heading })).toBeVisible();
      await page.waitForTimeout(600); // let the first polls settle
      const offenders = await page.evaluate(() =>
        [...document.querySelectorAll<HTMLElement>('body *')]
          .filter(
            (el) =>
              el.getBoundingClientRect().right > window.innerWidth + 1 &&
              !el.closest('.table-wrap'),
          )
          .slice(0, 5)
          .map(
            (el) =>
              `${el.tagName.toLowerCase()}.${el.className} (${Math.round(el.getBoundingClientRect().right)}px)`,
          ),
      );
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - window.innerWidth,
      );
      expect(
        overflow,
        `no horizontal page scroll; widest: ${offenders.join(', ')}`,
      ).toBeLessThanOrEqual(0);
      await page.screenshot({
        path: `docs/demo/screenshots/${v.name}-${size.label}.png`,
        fullPage: true,
      });
    });
  }
}
