import { test, expect, type Page } from "@playwright/test";

// Override the default `storageState` from `playwright.smoke.config.ts`
// (pre-baked logged-in user). This file exercises the cold-start signup
// → welcome wizard → hub-overview funnel, so it needs a fresh browser
// context with no auth cookie.
test.use({ storageState: { cookies: [], origins: [] } });

/**
 * Happy-path founder-experience E2E:
 *
 *   /welcome onboarding wizard → hub-overview → sign-up
 *
 * Complementary to `auth.spec.ts` (which seeds `hub_onboarding_done_v1`
 * and therefore *skips* the splash) — this spec exercises the full
 * cold-start activation funnel that PR-07 (#2566) wired the
 * `onboarding_completed` PostHog event into:
 *
 *   1. A cold anonymous visitor opens `/welcome`. `WelcomeScreen`
 *      mounts `WelcomeModulePicker` (Phase 7 D4); all four module cards
 *      start pre-selected.
 *   2. The visitor clicks the primary CTA ("Почати").
 *      `WelcomeScreen.handlePicksComplete()` fires
 *      `ANALYTICS_EVENTS.ONBOARDING_COMPLETED` with
 *      `intent: "preset_picker"`, persists picks +
 *      `hub_onboarding_done_v1`, and calls `onDone()` →
 *      `leaveWelcome()` → `navigate("/")`.
 *   3. The hub root settles at `/`. `onboarding_completed` is asserted
 *      from the in-page ring buffer (`window.__hubAnalytics`, see
 *      `apps/web/src/core/observability/analytics.ts`) in the same JS
 *      context that fired it.
 *   4. Only then does the visitor register a fresh email/password
 *      account (Better Auth `signUp.email`) from `/sign-in`. Successful
 *      sign-up flips the standalone-route guard — `AuthContext`
 *      `invalidateMe()` repopulates `user`, `<RedirectTo to="/" />`
 *      fires — and `signup_completed` is asserted from the ring buffer
 *      of *that* JS context.
 *   5. Regression guard for the 2026-08-04 audit (знахідка 5, commit
 *      `88dbb3a`): a signed-in user must never be shown the splash
 *      again. `/welcome` is the ANONYMOUS surface — both the
 *      standalone-route guard (`StandaloneRoutes.tsx`) and the hub-root
 *      gate (`HubPage.tsx`) bounce an authenticated user back to `/`.
 *      The test navigates to `/welcome` post-sign-up and asserts the
 *      bounce.
 *
 * **Why welcome-then-sign-up and not the reverse.** Until 2026-08-04
 * this spec signed up first and then visited `/welcome`. That funnel no
 * longer exists: `shouldShowOnboarding()` is a purely local heuristic
 * that knows nothing about auth, so a user who had just signed in on a
 * clean device was bounced into the splash and offered to log into the
 * account they were already using. The fix made `/welcome`
 * anonymous-only, which means the old ordering can only ever land on
 * the hub — the splash CTA is unreachable once a session exists. The
 * order here matches how a real founder moves through the product: try
 * it anonymously, then create an account.
 *
 * Each analytics assertion reads `window.__hubAnalytics` in the JS
 * context where the event fired, before any hard navigation. That is
 * deliberate: the ring buffer's flush path (`flushLogToStorage` →
 * `webKVStore`) is SQLite-backed, so a `page.goto` starts a fresh
 * buffer. `window.__hubAnalytics` itself is assigned synchronously
 * inside `trackEvent()` (before the 500 ms debounce), so it is readable
 * the moment the event fires.
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

test("@critical onboarding: welcome wizard → hub-overview → sign-up fires onboarding_completed", async ({
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

  const nonce = crypto.randomUUID();
  const email = `smoke_${nonce}@example.com`;
  const password = `pw_${nonce}_long_enough`;

  // -----------------------------------------------------------------
  // 1. Cold anonymous visit to `/welcome`.
  //
  //    Why a manual `page.goto("/welcome")` instead of trusting the
  //    hub-root onboarding redirect in `HubPage.tsx`? Web reads the
  //    onboarding flag through `webKVStore`, which is fronted by the
  //    SQLite-WASM-backed KVStore once `bootstrapKvStore()` resolves
  //    (see `apps/web/src/shared/lib/storage/storage.ts:136`). The
  //    bootstrap is async, so `shouldShowOnboarding()` can return
  //    `false` on the first synchronous render and skip the bounce.
  //    The `/welcome` standalone guard itself does the same check
  //    (`if (!shouldShowOnboarding()) <RedirectTo to="/" />`), so a
  //    manual visit is the deterministic way to assert "a fresh
  //    founder reaches the wizard" without racing the boot ladder.
  // -----------------------------------------------------------------
  await page.goto("/welcome", { waitUntil: "domcontentloaded" });
  await expect(page).toHaveURL(/\/welcome$/, { timeout: 10_000 });

  // -----------------------------------------------------------------
  // 2. Phase 7 D4 WelcomeModulePicker is visible.
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
  // 3. Land on the hub. `WelcomeScreen.handlePicksComplete()`
  //    (Phase 7 D4) synchronously fires analytics → marks onboarding
  //    done → calls `onDone()` which `navigate("/", { replace: true })`s
  //    via the standalone-route `onLeaveWelcome` callback (see
  //    `apps/web/src/core/app/StandaloneRoutes.tsx`). We assert the URL
  //    transitioned away from `/welcome` and the SPA settled on the hub
  //    root, but we **do not** assert the hub bottom-nav is mounted —
  //    see the smoke-stack note below.
  // -----------------------------------------------------------------
  await expect(page).toHaveURL((url) => {
    return url.pathname === "/" || url.pathname === "";
  });

  // -----------------------------------------------------------------
  // 3a. Smoke-stack note: `vite preview` now mirrors production's
  //     COOP/COEP headers (`vite.config.js` → `preview.headers`, added
  //     2026-08-04 after the CI critical-lane audit), so `sqlite-wasm`
  //     runs on the OPFS VFS here just like in prod. We still stop
  //     short of asserting `<HubBottomNav>` on this first hub render:
  //     the boot ladder (lazy storage chunk → SQLite init → warm-cache
  //     read) legitimately mounts `PageLoader` for a few cycles, and
  //     the analytics-event assertions below are the source-of-truth
  //     for whether `finish()` actually completed. `auth.spec.ts`
  //     covers the steady-state hub shell against a seeded user.
  // -----------------------------------------------------------------

  // -----------------------------------------------------------------
  // 4. `onboarding_completed` analytics event landed in the in-page
  //    ring buffer. Read straight from `window.__hubAnalytics` (set by
  //    `apps/web/src/core/observability/analytics.ts`). PostHog
  //    transport is fire-and-forget over the network and is gated on
  //    `VITE_POSTHOG_KEY` (unset in smoke), so the ring buffer is the
  //    deterministic signal that `WelcomeScreen.handlePicksComplete()`
  //    actually fired the event before handing off to the hub.
  //
  //    Read it here, before the hard navigation to `/sign-in` below:
  //    the buffer is per-JS-context and does not survive `page.goto`.
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

  // -----------------------------------------------------------------
  // 5. Sign-up. The founder has seen the product; now they create an
  //    account. Successful sign-up flips the standalone-route guard for
  //    `/sign-in` — `AuthContext` `invalidateMe()` repopulates `user`,
  //    `<RedirectTo to="/" />` fires.
  // -----------------------------------------------------------------
  await page.goto("/sign-in", { waitUntil: "domcontentloaded" });
  await page
    .getByRole("button", { name: "Немає акаунту? Зареєструватися" })
    .click();
  await page.fill("#auth-name", "Smoke Founder");
  await page.fill("#auth-email", email);
  await page.fill("#auth-password", password);
  await page.getByRole("button", { name: "Зареєструватися" }).click();

  await page.waitForURL((url) => url.pathname !== "/sign-in", {
    timeout: 15_000,
  });

  // -----------------------------------------------------------------
  // 5a. Assert `signup_completed` in the JS context that fired it.
  //     `window.__hubAnalytics` is assigned synchronously inside
  //     `trackEvent()` (before the 500 ms debounce), so the event is
  //     available as soon as the URL change confirms sign-up.
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
    `signup_completed event missing — WF-60 funnel head broken. Console events seen:\n${analyticsConsoleEvents.join("\n")}`,
  ).toBeDefined();
  // Regression guard for the WF-60 head-of-funnel bug: `AuthContext` must
  // pass the real signup method, not a hardcoded/omitted value — the OAuth
  // paths (`loginWithGoogle`/`loginWithApple`) fire the same event with
  // `method: "google" | "apple"` via `consumePendingOAuthSignup()`, but a
  // full OAuth redirect round-trip isn't exercisable in this smoke stack
  // (no live Google/Apple provider) — covered by unit tests on
  // `AuthContext` instead.
  expect(signupCompleted!.payload).toMatchObject({ method: "email" });

  // -----------------------------------------------------------------
  // 6. Regression guard (аудит 2026-08-04, знахідка 5 / `88dbb3a`):
  //    `/welcome` is the ANONYMOUS surface. A signed-in user who lands
  //    there — stale link, autocomplete, shared URL — must bounce back
  //    to the hub instead of being asked to re-onboard and offered a
  //    log-in to the account they are already using. Before the fix
  //    this navigation showed the splash CTA.
  // -----------------------------------------------------------------
  await page.goto("/welcome", { waitUntil: "domcontentloaded" });
  await expect(page).toHaveURL((url) => {
    return url.pathname === "/" || url.pathname === "";
  });
  await expect(page.getByRole("button", { name: "Почати" })).toHaveCount(0);
});
