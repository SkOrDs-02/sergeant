import { test, expect, type Page } from "@playwright/test";

/**
 * Module smoke — ФІНІК.
 *
 * Audit `2026-05-13-testing-devx-roast.md` §P1-3 ("Web smoke E2E — лише
 * 4 спеки"): each top-level module needs a deterministic mount + key-element
 * assert so a "route /finyk crashes on cold load" regression trips a per-PR
 * `@critical` gate instead of leaking to Vercel.
 *
 * Kept minimal on purpose — direct-link to the canonical `/?module=finyk`
 * entry, assert the `ModuleHeader` title renders and the hub `<nav>` is gone
 * (module shell mounted). No deep interaction: that lives in the unit/RTL
 * suites under `apps/web/src/modules/finyk/__tests__/`.
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
  // Suppress per-module first-run banner so the shell mounts straight to its
  // surface (see `apps/web/src/core/onboarding/useModuleFirstRun.ts`).
  "sergeant.onboarding.module_first_seen.finyk.v1": "1",
  "sergeant.whatsNew.lastSeenId.v1": "2026-05-06-cold-start",
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

test("@critical finyk: cold-load mounts module shell", async ({ page }) => {
  await seedLocalStorage(page);

  const errors: string[] = [];
  page.on("pageerror", (err) => errors.push(err.message));

  await page.goto("/?module=finyk", { waitUntil: "domcontentloaded" });

  await expect(page.getByText("ФІНІК", { exact: true })).toBeVisible({
    timeout: 10_000,
  });
  await expect(
    page.getByRole("navigation", { name: "Розділи хабу" }),
  ).toHaveCount(0);

  expect(errors, "Uncaught page errors on finyk cold load").toEqual([]);
});
