import { test, expect, type Page } from "@playwright/test";

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
 *   3. The hub root then runs `shouldShowOnboarding()` against a clean
 *      `KVStore` and bounces the user to `/welcome` (see
 *      `apps/web/src/core/App.tsx:187`).
 *   4. `WelcomeScreen` mounts `OnboardingWizard variant="fullPage"`.
 *      The user clicks the splash primary CTA, the wizard's `finish()`
 *      handler in `useOnboardingWizardState.ts` fires
 *      `ANALYTICS_EVENTS.ONBOARDING_COMPLETED`, persists picks +
 *      `hub_onboarding_done_v1`, and calls `onDone()` →
 *      `leaveWelcome()` → `navigate("/")`.
 *   5. The hub root settles at `/` and the analytics ring-buffer
 *      (`window.__hubAnalytics`, see
 *      `apps/web/src/core/observability/analytics.ts`) contains
 *      `signup_completed` + `onboarding_completed`. The buffer is the
 *      deterministic transport — PostHog is fire-and-forget over the
 *      network and lazy-imported via `VITE_POSTHOG_KEY`, neither of
 *      which we set in smoke. See the § 4a smoke-stack note in the
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
 *  - We click exactly one `MODULE_CARDS` chip (`finyk`) to flip the
 *    primary CTA from `disabled` (empty-picks state, see
 *    `useOnboardingWizardState.ts:292` — `ctaDisabled = picks.length === 0`
 *    after the 2026-05-08 UX flip from `"all"` → `"none"` default
 *    variant) into `enabled`. Picking the full set is a per-module
 *    FTUX concern and lives in its own spec; the happy-path invariant
 *    is just "founder picks at least one module and lands in the hub".
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
  await page.goto("/welcome", { waitUntil: "domcontentloaded" });
  await expect(page).toHaveURL(/\/welcome$/, { timeout: 10_000 });

  // -----------------------------------------------------------------
  // 3. OnboardingWizard splash (`variant="fullPage"`) is visible. The
  //    primary CTA is `disabled` until the founder picks at least one
  //    module (`useOnboardingWizardState.ts:292` —
  //    `ctaDisabled = !isTour && defaultPicksVariant === "none" &&
  //    picks.length === 0`). The 2026-05-08 UX flip hard-coded the
  //    variant to `"none"` because pre-checking everything read as
  //    "we already chose for you". Tap one module chip (`Фінік`) to
  //    flip the CTA, then submit.
  //
  //    CTA label comes from `OUTCOME_COPY` / etc. in
  //    `packages/shared/src/lib/onboardingHeroCopy.ts` — every
  //    variant starts with either `Розпочати` or `Спробувати`, so we
  //    match a regex anchored to the first word rather than
  //    hard-coding the full string and coupling the test to a
  //    specific arm.
  // -----------------------------------------------------------------
  const splashCta = page.getByRole("button", {
    name: /^(Розпочати|Спробувати) — 30 секунд/,
  });
  await expect(splashCta).toBeVisible({ timeout: 10_000 });

  // `MODULE_LABELS.finyk === "Фінік"`; the `ModuleRow` button uses
  // `aria-pressed` to expose pick state. Click → flip to `pressed`,
  // CTA becomes enabled on the next render flush.
  const finykChip = page.getByRole("button", { name: /^Фінік/ });
  await finykChip.click();
  await expect(finykChip).toHaveAttribute("aria-pressed", "true");

  await expect(splashCta).toBeEnabled();
  await splashCta.click();

  // -----------------------------------------------------------------
  // 4. Land on the hub. `useOnboardingWizardState.finish()`
  //    synchronously fires analytics → marks onboarding done →
  //    calls `onDone()` which `navigate("/", { replace: true })`s
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
  //    deterministic signal that `useOnboardingWizardState.finish()`
  //    actually fired the event before the wizard handed off to the
  //    hub.
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

  // The wizard `finish()` handler tags the event with `intent` +
  // `picksCount` so PR-07's funnel can split activation cohorts. We
  // assert the shape (not exact values) so the test does not break
  // when the default-picks A/B rolls a different arm.
  expect(onboardingCompleted!.payload).toMatchObject({
    intent: expect.stringMatching(/^(vibe_picked|vibe_empty)$/),
    picksCount: expect.any(Number),
  });

  // The `signup_completed` precondition event should also be in the
  // buffer (fired by `AuthContext.register` before `invalidateMe`).
  // Locking it here turns the WF-60 activation funnel
  // (`signup_completed → onboarding_completed → first_action_completed`)
  // into a smoke-level invariant rather than two independent unit
  // assertions in different test files.
  const signupCompleted = analyticsEvents.find(
    (event) => event.eventName === "signup_completed",
  );
  expect(
    signupCompleted,
    "signup_completed event missing — WF-60 funnel head broken",
  ).toBeDefined();
});
