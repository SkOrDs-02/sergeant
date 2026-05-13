import { test, expect, type Page } from "@playwright/test";

const SEEDED_LS: Record<string, string> = {
  hub_onboarding_done_v1: "1",
  hub_first_action_done_v1: "1",
  hub_vibe_picks_v1: JSON.stringify({
    picks: ["finyk", "fizruk", "nutrition", "routine"],
    firstActionPending: null,
    firstActionStartedAt: null,
    firstRealEntryAt: Date.now(),
    updatedAt: Date.now(),
  }),
};

async function seedLocalStorage(page: Page) {
  await page.addInitScript((entries: Record<string, string>) => {
    try {
      for (const [k, v] of Object.entries(entries)) {
        window.localStorage.setItem(k, v);
      }
    } catch {
      /* ignore */
    }
  }, SEEDED_LS);
}

test("@extended nav: module routes render (best-effort)", async ({ page }) => {
  await seedLocalStorage(page);

  for (const mod of ["finyk", "fizruk", "nutrition", "routine"] as const) {
    await page.goto(`/?module=${mod}`, { waitUntil: "domcontentloaded" });
    await expect(page.locator("#root")).toBeVisible();
  }
});

test("@extended offline: shows OfflineBanner status", async ({
  page,
  context,
}) => {
  await seedLocalStorage(page);
  // `domcontentloaded` fires before lazily-loaded vendor chunks
  // (web-vitals, fonts, Sentry) finish, so flipping `setOffline(true)`
  // immediately after can leave an in-flight chunk in
  // `net::ERR_INTERNET_DISCONNECTED`, stalling React before it ever
  // mounts the OfflineBanner — see chromium trace in the nightly
  // extended-e2e run #25821506416. Wait for the `load` event AND for
  // React's first commit (root has at least one child) before dropping
  // the network so the banner is guaranteed to be mounted and the only
  // thing left to test is its reaction to the `offline` event.
  await page.goto("/", { waitUntil: "load" });
  await expect(page.locator("#root > *").first()).toBeAttached();

  await context.setOffline(true);

  await expect(
    page.locator('[data-testid="offline-banner"][data-state="offline"]'),
  ).toBeVisible({ timeout: 10_000 });

  await context.setOffline(false);
});

test("@extended sw: debug roundtrip works (best-effort)", async ({ page }) => {
  await seedLocalStorage(page);
  await page.goto("/?sw=debug", { waitUntil: "domcontentloaded" });

  const res = await page.evaluate(async () => {
    if (!("serviceWorker" in navigator)) {
      return { ok: false, reason: "no_service_worker" as const };
    }
    const reg = await navigator.serviceWorker.ready;
    const ctl: ServiceWorker | null =
      navigator.serviceWorker.controller || reg.active;
    if (!ctl) return { ok: false, reason: "no_controller" as const };

    const requestId = `pw_${Date.now()}_${Math.random().toString(16).slice(2)}`;
    const snapshot = await new Promise<unknown>((resolve, reject) => {
      const timer = setTimeout(() => {
        navigator.serviceWorker.removeEventListener("message", onMessage);
        reject(new Error("timeout"));
      }, 4000);
      const onMessage = (event: MessageEvent) => {
        const data = event.data as
          | { type?: string; requestId?: string | null; snapshot?: unknown }
          | undefined;
        if (!data || data.type !== "SW_DEBUG_RESULT") return;
        if ((data.requestId || null) !== requestId) return;
        clearTimeout(timer);
        navigator.serviceWorker.removeEventListener("message", onMessage);
        resolve(data.snapshot);
      };
      navigator.serviceWorker.addEventListener("message", onMessage);
      ctl.postMessage({ type: "SW_DEBUG", data: { requestId } });
    });

    return { ok: true, snapshot };
  });

  if (!res.ok) {
    test.info().annotations.push({
      type: "sw-skip",
      description: `SW smoke skipped: ${res.reason}`,
    });
    test.skip(true, `SW smoke skipped: ${res.reason}`);
  }

  expect(res.ok).toBe(true);
});
