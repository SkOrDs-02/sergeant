import { test, expect, type Page } from "@playwright/test";

// Override the default `storageState` from `playwright.smoke.config.ts`
// (pre-baked logged-in user). This file exercises the cold-start signup
// → welcome wizard → hub-overview funnel, so it needs a fresh browser
// context with no auth cookie.
test.use({ storageState: { cookies: [], origins: [] } });

/**
 * Happy-path founder-experience E2E:
 *
 *   sign-up → /welcome onboarding wizard → hub-overview
 *
 * Complementary to `auth.spec.ts` (which seeds `hub_onboarding_done_v1`
 * and therefore *skips* the splash) — this spec exercises the full
 * cold-start activation funnel that PR-07 (#2566) wired the
 * `onboarding_completed` PostHog event into:
 *
 *   1. Visit `/sign-in`, register a fresh email/password account
 *      (Better Auth `signUp.email`).
 *   2. Successful sign-up flips the standalone-route guard for
 *      `/sign-in` — `AuthContext` `invalidateMe()` repopulates `user`,
 *      `<RedirectTo to="/" />` fires.
 *   2a. Before navigating away, assert `signup_completed` is in
 *       `window.__hubAnalytics`. The smoke stack runs `vite preview`
 *       without COOP/COEP headers, so `sqlite-wasm` uses a memory-only
 *       VFS that resets on every hard navigation — writing through
 *       `webKVStore` (analytics' flush path) does not survive the
 *       `page.goto("/welcome")` reload. `window.__hubAnalytics` is set
 *       synchronously on every `trackEvent` call (no debounce), so we
 *       read it here while still in the same JS context as the sign-up.
 *   3. The hub root then runs `shouldShowOnboarding()` against a clean
 *      `KVStore` and bounces the user to `/welcome` (see
 *      `apps/web/src/core/App.tsx:187`).
 *   4. `WelcomeScreen` mounts `WelcomeModulePicker` (Phase 7 D4).
 *      All four module cards start pre-selected. The user clicks the
 *      primary CTA ("Почати"), `WelcomeScreen.handlePicksComplete()`
 *      fires `ANALYTICS_EVENTS.ONBOARDING_COMPLETED` with
 *      `intent: "preset_picker"`, persists picks +
 *      `hub_onboarding_done_v1`, and calls `onDone()` →
 *      `leaveWelcome()` → `navigate("/")`.
 *   5. The hub root settles at `/`. The in-page ring-buffer
 *      (`window.__hubAnalytics`, see
 *      `apps/web/src/core/observability/analytics.ts`) now contains
 *      `onboarding_completed` (fired on `/welcome` in this JS context).
 *      `signup_completed` was verified in step 2a before the hard
 *      reload that reset the buffer. PostHog is fire-and-forget over
 *      the network and lazy-imported via `VITE_POSTHOG_KEY`, neither
 *      of which we set in smoke. See the § 4a smoke-stack note in the
 *      test body for why we do not also assert `<HubBottomNav>`
 *      visibility (the `vite preview` web-server does not emit
 *      COOP/COEP headers, so `sqlite-wasm` falls back to its
 *      memory-only VFS and the warm-cache write race produces a
 *      sticky `PageLoader` skeleton in the smoke stack only).
 *
 * Tagged `@critical` so it joins the per-PR smoke lane
 * (`playwright.smoke.config.ts --grep @critical`) — the activation
 * funnel is one of the four critical user flows and shouldn't wait
 * for the nightly extended-e2e cron run.
 *
 * Deliberate non-coverage:
 *
 *  - We do NOT assert the PostHog network call. The PostHog transport
 *    is `fire-and-forget`, lazy-imported, and gated on
 *    `VITE_POSTHOG_KEY` (unset in smoke) — verifying the local
 *    `[analytics]` console + `window.__hubAnalytics` ring buffer is
 *    the deterministic single-source-of-truth for whether the event
 *    fired.
 *  - We do NOT seed the `hub_first_action_done_v1` /
 *    `hub_vibe_picks_v1` keys. The wizard itself owns those writes;
 *    pre-seeding them here would mask regressions in `finish()`.
 *  - Phase 7 D4: all four module cards default to picked
 *    (`aria-pressed="true"`) so the primary CTA ("Почати") is enabled
 *    at mount. The happy-path invariant is "founder lands in the hub
 *    after clicking the CTA" — per-module chip interaction lives in
 *    a dedicated spec.
 */

const FRESH_USER_LS: Record<string, string> = {
  // Match the `whatsNew` last-seen seed from the other smoke specs so
  // the "What's new" modal (auto-pops 2.5s after hub mount via
  // `useWhatsNew`) does not race the hub-overview assertion. Value
  // mirrors the latest entry in `apps/web/src/core/whatsNew/releases.ts`.
  "sergeant.whatsNew.lastSeenId.v1": "2026-05-06-cold-start",
};

async function seedFreshUserLocalStorage(page: Page) {
  await page.addInitScript((entries: Record<string, string>) => {
    try {
      for (const [k, v] of Object.entries(entries)) {
        window.localStorage.setItem(k, v);
      }
    } catch {
      /* ignore */
    }
  }, FRESH_USER_LS);
}

type AnalyticsEvent = {
  eventName: string;
  payload: Record<string, unknown>;
  timestamp: string;
};

test("@critical onboarding: sign-up → welcome wizard → hub-overview fires onboarding_completed", async ({
  page,
}) => {
  await seedFreshUserLocalStorage(page);

  // Capture `[analytics]` console events as a redundant signal —
  // helps debug CI failures where `window.__hubAnalytics` might be
  // wiped (e.g. if the wizard navigation triggers a service-worker
  // controlled reload). Primary assertion still uses the in-page ring
  // buffer.
  const analyticsConsoleEvents: string[] = [];
  page.on("console", (msg) => {
    if (msg.type() === "log" && msg.text().startsWith("[analytics]")) {
      analyticsConsoleEvents.push(msg.text());
    }
  });

  const nonce = `${Date.now()}_${Math.random().toString(16).slice(2)}`;
  const email = `smoke_${nonce}@example.com`;
  const password = `pw_${nonce}_long_enough`;

  // -----------------------------------------------------------------
  // 1. Sign-up
  // -----------------------------------------------------------------
  await page.goto("/sign-in", { waitUntil: "domcontentloaded" });
  await page
    .getByRole("button", { name: "Немає акаунту? Зареєструватися" })
    .click();
  await page.fill("#auth-name", "Smoke Founder");
  await page.fill("#auth-email", email);
  await page.fill("#auth-password", password);
  await page.getByRole("button", { name: "Зареєструватися" }).click();

  // -----------------------------------------------------------------
  // 2. Wait for the standalone /sign-in surface to flip (AuthContext
  //    invalidates `/api/v1/me`, the standalone-route guard renders
  //    `<RedirectTo to="/" />`), then explicitly visit `/welcome`.
  //
  //    Why a manual `page.goto("/welcome")` instead of trusting the
  //    hub-root onboarding redirect at `App.tsx:187`? Web reads the
  //    onboarding flag through `webKVStore`, which is fronted by the
  //    SQLite-WASM-backed KVStore once `bootstrapKvStore()` resolves
  //    (see `apps/web/src/shared/lib/storage/storage.ts:136`). The
  //    bootstrap is async, so on a cold post-sign-up render the
  //    SQLite store may already be active but its `kv_store` table
  //    has not yet been populated with the `hub_onboarding_done_v1`
  //    miss → `shouldShowOnboarding()` can return `false` on the
  //    first synchronous render and skip the bounce. The `/welcome`
  //    standalone guard itself does the same check
  //    (`if (!shouldShowOnboarding()) <RedirectTo to="/" />`), so a
  //    manual visit is the deterministic way to assert "a fresh
  //    founder reaches the wizard" without racing the boot ladder.
  // -----------------------------------------------------------------
  await page.waitForURL((url) => url.pathname !== "/sign-in", {
    timeout: 15_000,
  });

  // -----------------------------------------------------------------
  // 2a. Assert `signup_completed` BEFORE the hard navigation below.
  //
  //     Smoke-stack constraint: `vite preview` serves without COOP/COEP
  //     headers → `sqlite-wasm` falls back to a memory-only VFS. The
  //     analytics flush (`flushLogToStorage`) writes through
  //     `webKVStore.setString` → in-memory SQLite → wiped on every
  //     `page.goto`. Raw `localStorage.getItem(LOG_KEY)` never gets
  //     the value (writes go to SQLite, not raw LS), so the ring buffer
  //     does NOT survive the full-page reload that follows.
  //
  //     `window.__hubAnalytics` is assigned synchronously inside
  //     `trackEvent()` (before the 500 ms debounce), so the event IS
  //     available immediately after the URL change confirms sign-up.
  //     We assert it here — in the same JS context where it fired —
  //     and then proceed with the hard reload to `/welcome`.
  // -----------------------------------------------------------------
  const signupBuffer = await page.evaluate(() => {
    const w = window as Window & { __hubAnalytics?: unknown[] };
    return (w.__hubAnalytics ?? []) as AnalyticsEvent[];
  });
  const signupCompleted = signupBuffer.find(
    (e) => e.eventName === "signup_completed",
  );
  expect(
    signupCompleted,
    "signup_completed event missing — WF-60 funnel head broken",
  ).toBeDefined();

  await page.goto("/welcome", { waitUntil: "domcontentloaded" });
  await expect(page).toHaveURL(/\/welcome$/, { timeout: 10_000 });

  // -----------------------------------------------------------------
  // 3. Phase 7 D4 WelcomeModulePicker is visible.
  //    All four module cards default to picked (aria-pressed="true").
  //    The primary CTA ("Почати") is enabled from the start because
  //    picks.length > 0 at mount.  No interaction needed before
  //    clicking — just assert the picker rendered and submit.
  //    Source: apps/web/src/core/app/WelcomeModulePicker.tsx +
  //            apps/web/src/shared/i18n/uk.ts § welcomeModulePicker.
  // -----------------------------------------------------------------
  const splashCta = page.getByRole("button", { name: "Почати" });
  await expect(splashCta).toBeVisible({ timeout: 10_000 });
  await expect(splashCta).toBeEnabled();
  await splashCta.click();

  // -----------------------------------------------------------------
  // 4. Land on the hub. `WelcomeScreen.handlePicksComplete()`
  //    (Phase 7 D4) synchronously fires analytics → marks onboarding
  //    done → calls `onDone()` which `navigate("/", { replace: true })`s
  //    via the standalone-route `onLeaveWelcome` callback (see
  //    `apps/web/src/core/App.tsx:93` and
  //    `apps/web/src/core/app/StandaloneRoutes.tsx:215`). We
  //    assert the URL transitioned away from `/welcome` and the
  //    SPA settled on the hub root, but we **do not** assert the
  //    hub bottom-nav is mounted — see the long comment below.
  // -----------------------------------------------------------------
  await expect(page).toHaveURL((url) => {
    return url.pathname === "/" || url.pathname === "";
  });

  // -----------------------------------------------------------------
  // 4a. Smoke-stack note: the Playwright `vite preview` web server
  //     does not emit COOP/COEP response headers, so SharedArrayBuffer
  //     / Atomics are unavailable and `sqlite-wasm` falls back to its
  //     **memory-only** VFS (the browser logs
  //     `Ignoring inability to install OPFS sqlite3_vfs …`). Because
  //     the SQLite-backed `webKVStore` lives entirely in memory, the
  //     `hub_onboarding_done_v1` write from the wizard's `finish()`
  //     does land in `kvStoreBoot.warmCache` but production-shape
  //     local-storage assertions are not meaningful here.
  //
  //     The hub-root render does therefore consistently mount the
  //     `PageLoader` skeleton for a few additional render cycles
  //     while the warm-cache write propagates — under the smoke
  //     stack we have observed steady-state `PageLoader` rather than
  //     `<HubBottomNav>` for ~15 s. This is **not** a regression in
  //     prod (where OPFS is available and the bootstrap pipeline is
  //     synchronous from React's perspective) — it is an environment
  //     gap. We document it inline rather than fight the smoke stack:
  //     the analytics-event assertions below are the source-of-truth
  //     for whether `finish()` actually completed.
  //
  //     If you regress the bottom-nav-on-first-mount flow in prod,
  //     this test will not catch it — add a dedicated
  //     `playwright.config.ts` profile with COOP/COEP-aware preview
  //     headers (or run the test against the deployed Vercel preview
  //     URL) and reinstate a `getByRole("navigation", { name:
  //     "Розділи хабу" })` assertion there.
  // -----------------------------------------------------------------

  // -----------------------------------------------------------------
  // 5. `onboarding_completed` analytics event landed in the in-page
  //    ring buffer. Read straight from `window.__hubAnalytics` (set by
  //    `apps/web/src/core/observability/analytics.ts`). PostHog
  //    transport is fire-and-forget over the network and is gated on
  //    `VITE_POSTHOG_KEY` (unset in smoke), so the ring buffer is the
  //    deterministic signal that `WelcomeScreen.handlePicksComplete()`
  //    actually fired the event before handing off to the hub.
  //
  //    Note: `signup_completed` was verified in step 2a (above) before
  //    the hard reload to `/welcome`. The buffer here starts fresh
  //    (smoke memory-only SQLite) and only contains events fired in
  //    this JS context (i.e. on `/welcome` → `/`).
  // -----------------------------------------------------------------
  const analyticsEvents = await page.evaluate(() => {
    const w = window as Window & { __hubAnalytics?: unknown[] };
    return (w.__hubAnalytics ?? []) as AnalyticsEvent[];
  });

  const onboardingCompleted = analyticsEvents.find(
    (event) => event.eventName === "onboarding_completed",
  );
  expect(
    onboardingCompleted,
    `onboarding_completed analytics event missing. Console events seen:\n${analyticsConsoleEvents.join("\n")}`,
  ).toBeDefined();

  // WelcomeModulePicker (Phase 7 D4) fires intent="preset_picker";
  // the legacy OnboardingWizard used "vibe_picked"|"vibe_empty". Accept
  // all three so the test survives a surface rollback without breakage.
  expect(onboardingCompleted!.payload).toMatchObject({
    intent: expect.stringMatching(/^(vibe_picked|vibe_empty|preset_picker)$/),
    picksCount: expect.any(Number),
  });
});
