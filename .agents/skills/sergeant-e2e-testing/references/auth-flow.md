---
title: Auth Flow Testing with seedFTUX
impact: HIGH
impactDescription: Driving the UI sign-up flow in every test creates slow, brittle tests. Sergeant provides seedFTUX for direct state seeding.
tags: [playwright, auth, better-auth, cookies, fixtures, ftux, seedFTUX]
---

# Auth Flow Testing in Sergeant

## Do not drive the UI login flow in beforeEach

The full sign-up + onboarding flow takes 5–10 seconds per test. Driving it in `beforeEach` makes the suite slow and brittle. Seed application state directly instead.

## seedFTUX helper

`apps/web/tests/utils/seedFTUX.ts` seeds `localStorage` state before navigation via `page.addInitScript()`.

```typescript
import { seedFTUX } from "../utils/seedFTUX";

test("hub dashboard shows modules", async ({ page }) => {
  await seedFTUX(page, "post-ftux");  // fully onboarded, steady-state hub
  await page.goto("/hub");
  await expect(page.getByRole("main")).toBeVisible();
});
```

### Available modes

| Mode | State |
|---|---|
| `"cold"` | Theme only; welcome splash active |
| `"pre-ftux"` | Onboarding done; FTUX hero banner pending |
| `"post-ftux"` | Fully onboarded; all overlays dismissed (steady-state hub) |
| `"module-first-run"` | post-ftux but a specific module first-run banner active |

## Better Auth session cookies

Better Auth uses HttpOnly cookies. Playwright cannot set HttpOnly cookies from test code — they must come from the server response.

If a test requires a real authenticated session (not just localStorage state), the correct approach is a server-side seed script that calls Better Auth's internal session creator and returns the cookie for Playwright to inject via `storageState`. Do not bypass auth by mocking the session validation endpoint — this hides auth regressions.

## Incorrect pattern

**Incorrect — drives UI in beforeEach:**
```typescript
test.beforeEach(async ({ page }) => {
  await page.goto("/auth/sign-in");
  await page.getByLabel("Email").fill("test@example.com");
  await page.getByLabel("Password").fill("password");
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL("/hub");
});
```

**Correct — seeds state via seedFTUX:**
```typescript
test.beforeEach(async ({ page }) => {
  await seedFTUX(page, "post-ftux");
});
```

## Sergeant-specific note

`apps/web/tests/smoke/auth.spec.ts` and `auth-webkit.spec.ts` are the canonical reference for testing the real sign-up/sign-in flow. These tests intentionally drive the UI because they are testing auth itself — not as a setup step for other tests.
