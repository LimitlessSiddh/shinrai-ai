# Release Readiness Polish Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make the current resume release reproducibly green in CI and keep routine E2E runs from modifying tracked demo evidence.

**Architecture:** Preserve the existing app and test coverage. Correct the warning-pill text contrast at the shared CSS primitive, send generated Playwright captures to ignored test output, and update the release proof document with the current verified state.

**Tech Stack:** Next.js, CSS custom properties, Playwright, Vitest, GitHub Actions.

---

### Task 1: Correct the shared warning-pill contrast

**Files:**
- Modify: `apps/web/src/styles/components.css:196-199`
- Test: `tests/e2e/05-accessibility.spec.ts`

1. Use the existing cross-platform Axe failure as the failing proof: warning text in the Dossier lacks sufficient contrast on Linux Chromium.
2. Make warning-pill label text use `--color-text-primary`, matching the success and danger label treatment.
3. Run `pnpm test:e2e`; expected: all accessibility checks pass.

### Task 2: Keep generated screenshots out of tracked documentation

**Files:**
- Modify: `tests/e2e/06-screenshots.spec.ts:45-48,64-67`
- Test: `pnpm test:e2e`

1. Redirect generated screenshots from `docs/demo/screenshots/` to ignored `test-results/generated-screenshots/`.
2. Run E2E and verify `git status --short` does not list documentation screenshots.

### Task 3: Synchronize release evidence

**Files:**
- Modify: `docs/implementation/progress.md`

1. Update stale release status, route/test counts, and merged-PR wording using the current audit results.
2. Run format, lint, typecheck, unit, evaluation, integration, E2E, build, CDK tests/synthesis, and `git diff --check`.
3. Commit the explicit files and push to `origin/main`; verify the corresponding GitHub Actions run is green.
