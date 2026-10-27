import { expect, test } from '@playwright/test';
import { apiPost, ensureSeeded, WORKSPACE_HEADING } from './support';

const VIEWS = [
  { name: 'workspace', path: '/', heading: WORKSPACE_HEADING },
  { name: 'agents', path: '/agents/', heading: 'Agent setup' },
  { name: 'experiments', path: '/experiments/', heading: 'Compare versions carefully' },
  { name: 'arena', path: '/arena/', heading: 'Arena' },
  { name: 'audit-records', path: '/runs/', heading: 'Agent runs' },
];
const SIZES = [
  { label: 'desktop-1440', width: 1440, height: 1000 },
  { label: 'laptop-1280', width: 1280, height: 1000 },
  { label: 'tablet-768', width: 768, height: 1000 },
  { label: 'mobile-390', width: 390, height: 844 },
];

for (const size of SIZES) {
  for (const v of VIEWS) {
    test(`screenshot ${v.name} @ ${size.label}`, async ({ page, request }) => {
      await ensureSeeded(request);
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

  test(`screenshot prediction detail @ ${size.label}`, async ({ page, request }) => {
    await ensureSeeded(request);
    const run = await apiPost<{ runId: string }>(request, '/agent-runs', {
      fixtureVersion: 'nba-2026-10-20.1',
      scenarioId: 'research-happy',
    });
    await page.setViewportSize({ width: size.width, height: size.height });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto(`/dossier/?run=${encodeURIComponent(run.runId)}`);
    await expect(page.getByRole('heading', { level: 1, name: 'research-happy' })).toBeVisible();
    await page.screenshot({
      path: `docs/demo/screenshots/prediction-detail-${size.label}.png`,
      fullPage: true,
    });
  });
}
