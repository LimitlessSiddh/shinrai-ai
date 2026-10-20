import { expect, test } from '@playwright/test';

const VIEWS = [
  { name: 'market', path: '/', heading: 'The market is a conversation.' },
  { name: 'dossier', path: '/dossier/', heading: 'Before the market accepts an order,' },
  { name: 'replay', path: '/replay/', heading: 'The proof is in the replay.' },
];
const SIZES = [
  { label: 'desktop-1440', width: 1440, height: 1000 },
  { label: 'mobile-375', width: 375, height: 812 },
];

for (const size of SIZES) {
  for (const v of VIEWS) {
    test(`screenshot ${v.name} @ ${size.label}`, async ({ page }) => {
      await page.setViewportSize({ width: size.width, height: size.height });
      await page.goto(v.path);
      await expect(page.getByRole('heading', { name: v.heading })).toBeVisible();
      await page.waitForTimeout(500); // let the first poll settle
      const offenders = await page.evaluate(() =>
        [...document.querySelectorAll<HTMLElement>('body *')]
          .filter((el) => el.getBoundingClientRect().right > window.innerWidth + 1)
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
