import { test, expect, type Route } from "@playwright/test";

// Block the service worker for this spec. The web app registers a SW
// (`src/sw.ts`) that owns the fetch handler; requests it initiates
// bypass `page.route` interception entirely, so without this the
// checkout mock below is never consulted and the CTA hits the real
// (Stripe-less → 503) server. `serviceWorkers: "block"` forces every
// request through the page context where `page.route` can intercept.
test.use({ serviceWorkers: "block" });

/**
 * Billing checkout E2E — /pricing CTA up to the Stripe redirect:
 *
 *   /pricing → «Спробувати Premium» → POST /api/billing/checkout →
 *   `window.location.assign(checkout.url)` → checkout.stripe.com.
 *
 * What this proves (`PricingPage.handlePremiumCta`):
 *
 *   1. The Premium CTA fires a checkout-session request with the
 *      server-contract plan id (`plan: "pro"` — the D3 "Premium" label
 *      is UI-only, the server enum is still `"plus" | "pro"`).
 *   2. The returned `checkout.url` passes the open-redirect allow-list
 *      guard (`assertAllowedCheckoutUrl`, audit F4) and the browser is
 *      handed off to `checkout.stripe.com`.
 *
 * Why the API call is mocked: the smoke stack boots the real server
 * WITHOUT Stripe env vars, so `POST /api/billing/checkout` would 503
 * («billing disabled») — the real Stripe session cannot be exercised
 * in CI. The UI leg (CTA → request body → allow-list guard → redirect)
 * is the critical flow this lane owns; the server leg is covered by
 * server-side contract tests. `checkout.stripe.com` is likewise
 * stubbed so the test never leaves the runner's network.
 *
 * Uses the pre-baked logged-in `storageState` from
 * `playwright.smoke.config.ts` (checkout is an authenticated action;
 * `usePlan` resolves the fresh smoke user to the free plan, so the CTA
 * renders «Спробувати Premium», not the Stripe-portal variant).
 *
 * Tagged `@critical` so it joins the per-PR smoke lane
 * (`playwright.smoke.config.ts --grep @critical`, ci.yml job
 * `critical-flow`).
 */

const CHECKOUT_STUB_URL = "https://checkout.stripe.com/c/pay/cs_test_smoke";

// The web app calls the API cross-origin (VITE_API_BASE_URL →
// http://127.0.0.1:3000), so fulfilled responses must carry CORS
// headers — and the browser preflights the JSON POST with an OPTIONS
// request the route handler has to answer too.
function corsHeaders(origin: string): Record<string, string> {
  return {
    "access-control-allow-origin": origin,
    "access-control-allow-credentials": "true",
    "access-control-allow-methods": "POST, OPTIONS",
    "access-control-allow-headers": "content-type",
  };
}

test("@critical billing: pricing Premium CTA creates a checkout session and redirects to Stripe", async ({
  page,
  baseURL,
}) => {
  const origin = new URL(baseURL ?? "http://127.0.0.1:4173").origin;

  const checkoutRequests: Array<Record<string, unknown>> = [];

  // Match the checkout endpoint by path suffix so the `/api/v1` version
  // prefix the HttpClient injects (real URL: `/api/v1/billing/checkout`)
  // does not have to be hard-coded here.
  await page.route(
    (url) => url.pathname.endsWith("/billing/checkout"),
    async (route: Route) => {
      const request = route.request();
      if (request.method() === "OPTIONS") {
        await route.fulfill({ status: 204, headers: corsHeaders(origin) });
        return;
      }
      checkoutRequests.push(
        (request.postDataJSON() ?? {}) as Record<string, unknown>,
      );
      // Shape mirrors `BillingCheckoutResponseSchema`
      // (packages/shared/src/schemas/api.ts) — the api-client zod-parses
      // the payload, so a drifted mock fails loudly here, not silently.
      await route.fulfill({
        status: 200,
        headers: corsHeaders(origin),
        contentType: "application/json",
        body: JSON.stringify({
          ok: true,
          mode: "test",
          sessionId: "cs_test_smoke",
          url: CHECKOUT_STUB_URL,
        }),
      });
    },
  );

  // Stub the Stripe-hosted checkout page so the redirect leg resolves
  // without external network access on the CI runner.
  await page.route(
    (url) => url.host === "checkout.stripe.com",
    async (route: Route) => {
      await route.fulfill({
        status: 200,
        contentType: "text/html",
        body: "<!doctype html><html><body><h1>Stripe Checkout (smoke stub)</h1></body></html>",
      });
    },
  );

  await page.goto("/pricing", { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("heading", { name: "Тарифи" })).toBeVisible({
    timeout: 10_000,
  });

  const premiumCta = page.getByRole("button", { name: "Спробувати Premium" });
  await expect(premiumCta).toBeVisible({ timeout: 10_000 });
  await expect(premiumCta).toBeEnabled();
  await premiumCta.click();

  // ------------------------------------------------------------------
  // Redirect landed on the (stubbed) Stripe-hosted checkout page. This
  // implicitly proves `assertAllowedCheckoutUrl` accepted the host —
  // a non-allow-listed URL would throw before `location.assign` and
  // surface the checkout-error state instead of navigating.
  // ------------------------------------------------------------------
  await page.waitForURL((url) => url.host === "checkout.stripe.com", {
    timeout: 15_000,
  });
  await expect(
    page.getByRole("heading", { name: "Stripe Checkout (smoke stub)" }),
  ).toBeVisible();

  // The checkout-session request carried the server-contract plan id.
  expect(checkoutRequests).toHaveLength(1);
  expect(checkoutRequests[0]).toMatchObject({ plan: "pro" });
});
