import { test, expect, type Page } from "@playwright/test";

/**
 * BottomNav coverage — smoke E2E for the six top-level entry points the
 * user can land on:
 *
 *   1. Hub  · Головна  (default `/`)
 *   2. Hub  · Налаштування (clicked tab inside the hub `<nav>`)
 *   3. Module · ФІНІК      (`/?module=finyk`)
 *   4. Module · ФІЗРУК     (`/?module=fizruk`)
 *   5. Module · РУТИНА     (`/?module=routine`)
 *   6. Module · ХАРЧУВАННЯ (`/?module=nutrition`)
 *
 * Each module is tested via the canonical URL (the only entry the app
 * supports for direct linking) AND via the `ModuleHeaderBackButton`
 * (aria-label: "До хабу") which returns to the hub. Combined, that
 * exercises both the forward (route → mount module shell) and the
 * reverse (click → unmount module, remount HubBottomNav) navigation
 * legs without touching dashboard tile internals (which depend on
 * vibe-pick state and are out of scope for this lane).
 *
 * Tagged `@critical` so it lives on the per-PR smoke lane —
 * `playwright.smoke.config.ts` (`--grep @critical`) — and not the
 * nightly extended one. Module entry-points are core regressions that
 * shouldn't wait for a 02:00 cron run.
 */

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

const MODULES = [
  { id: "finyk", title: "ФІНІК" },
  { id: "fizruk", title: "ФІЗРУК" },
  { id: "routine", title: "РУТИНА" },
  { id: "nutrition", title: "ХАРЧУВАННЯ" },
] as const;

test("@critical bottom-nav: hub root mounts HubBottomNav and tab switching works", async ({
  page,
}) => {
  await seedLocalStorage(page);
  await page.goto("/", { waitUntil: "domcontentloaded" });

  const hubNav = page.getByRole("navigation", { name: "Розділи хабу" });
  await expect(hubNav).toBeVisible({ timeout: 10_000 });

  const dashboardTab = hubNav.getByRole("tab", { name: "Головна" });
  const settingsTab = hubNav.getByRole("tab", { name: "Налаштування" });

  // Precondition: dashboard is the default selected tab.
  await expect(dashboardTab).toHaveAttribute("aria-selected", "true");
  await expect(settingsTab).toHaveAttribute("aria-selected", "false");

  await settingsTab.click();
  await expect(settingsTab).toHaveAttribute("aria-selected", "true");
  await expect(dashboardTab).toHaveAttribute("aria-selected", "false");

  // Round-trip back to dashboard so the regression covers both
  // directions of the toggle, not just forward.
  await dashboardTab.click();
  await expect(dashboardTab).toHaveAttribute("aria-selected", "true");
  await expect(settingsTab).toHaveAttribute("aria-selected", "false");
});

for (const mod of MODULES) {
  test(`@critical bottom-nav: ${mod.id} module mounts shell and back-to-hub returns to dashboard`, async ({
    page,
  }) => {
    await seedLocalStorage(page);
    await page.goto(`/?module=${mod.id}`, { waitUntil: "domcontentloaded" });

    // Module shell mounted: header title visible AND hub `<nav>` is gone.
    await expect(page.getByText(mod.title, { exact: true })).toBeVisible({
      timeout: 10_000,
    });
    await expect(
      page.getByRole("navigation", { name: "Розділи хабу" }),
    ).toHaveCount(0);

    // Click the canonical "До хабу" back button. All four modules use
    // `ModuleHeaderBackButton` from `@shared/components/layout/ModuleHeader`,
    // so this aria-label is the single contract under test.
    const backButton = page.getByRole("button", { name: "До хабу" }).first();
    await expect(backButton).toBeVisible();
    await backButton.click();

    // Returned to hub: BottomNav is back, dashboard tab is selected,
    // and the URL no longer carries a `module=` param.
    const hubNav = page.getByRole("navigation", { name: "Розділи хабу" });
    await expect(hubNav).toBeVisible({ timeout: 10_000 });
    await expect(hubNav.getByRole("tab", { name: "Головна" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    await expect(page).toHaveURL(/^[^?]*\/?(?:#.*)?$/);
  });
}
