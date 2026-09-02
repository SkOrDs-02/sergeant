import { expect, test } from "@playwright/test";

import { seedFTUX } from "../utils/seedFTUX";
import { auditPage, mockApi } from "./audit";

// Steady-state surfaces (post-FTUX). One entry per module plus the
// Hub/Settings/Reports/Insights shells.
//
// Why no demo-seeded block: the demo funnel activates via a `?demo=1` reload
// handshake that seeds the SQLite kvStore and then re-seeds on every cold
// navigation (reset → rewrite all four modules). In Playwright's cold, isolated
// contexts that reseed takes several seconds and is timing-fragile — it seeds
// reliably only for hub-rooted paths and even then flakes under load, so it is
// not shippable as a deterministic gate (the smoke-env SQLite caveat in
// apps/web/AGENTS.md § E2E smoke). Manual passes already confirmed the demo
// Reports/Finyk surfaces neither overflow nor truncate at mobile width;
// reliable demo-content mobile checks belong on a real device/emulator.
const ROUTES: ReadonlyArray<{ id: string; path: string }> = [
  { id: "ASSISTANT", path: "/assistant" },
  { id: "HUB", path: "/" },
  { id: "FINYK", path: "/finyk/budgets" },
  { id: "FINYK_OVERVIEW", path: "/finyk" },
  { id: "FIZRUK", path: "/fizruk" },
  { id: "ROUTINE", path: "/routine" },
  { id: "NUTRITION", path: "/nutrition/menu" },
  { id: "SETTINGS", path: "/settings" },
  { id: "REPORTS", path: "/?tab=reports" },
  { id: "INSIGHTS", path: "/insights" },
];

// Receipt-length names, the stress case the ROUTES sweep structurally cannot
// reach: a steady-state pantry is empty, so the row that actually sizes the
// grid track never renders. Seeded through the UI because `upsertItem` is a
// pure local mutation — no SQLite handshake, none of the timing fragility
// that keeps the demo funnel out of this lane (see the note above).
// No commas: `upsertItem` runs a loose parse that splits on them, so a decimal
// inside a name («2,6%») would silently land as two pantry rows and make the
// seeded count non-obvious. Length is what matters here, not punctuation.
const RECEIPT_PANTRY_ITEMS: readonly string[] = [
  "Паста арахісова Лавка традицій Aumi кранч",
  "Молоко Яготинське добірне пастеризоване 900 г",
  "Сир кисломолочний Президент розсипчастий 350 г",
  "Хліб Київхліб Український подовий 950 г",
  "Печиво Roshen Bonjour Souffle капучино 232 г",
  "Вода мінеральна Моршинська негазована",
  "Кава розчинна Jacobs Monarch Intense 200 г",
];

test.describe("mobile coarse-pointer UI audit", () => {
  for (const routeCase of ROUTES) {
    test(`${routeCase.id} ${routeCase.path}`, async ({ page }) => {
      await mockApi(page);
      await seedFTUX(page, "post-ftux");
      await page.goto(routeCase.path, { waitUntil: "domcontentloaded" });
      await auditPage(page, routeCase.id);
    });
  }

  test("PANTRY /nutrition/pantry with receipt-length names", async ({
    page,
  }) => {
    await mockApi(page);
    // Registered after `mockApi` so it wins: a connected Silpo account is what
    // puts the "З покупок Сільпо" entry on the same grid as the pantry rows.
    await page.route("**/silpo/sync-state", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          status: "connected",
          accessTokenExpiresAt: "2099-01-01T00:00:00.000Z",
          lastSyncAt: "2026-08-28T09:15:00.000Z",
          receiptsCount: 5,
        }),
      });
    });
    await seedFTUX(page, "post-ftux");
    await page.goto("/nutrition/pantry", { waitUntil: "domcontentloaded" });

    const nameInput = page.getByPlaceholder("напр. лосось 300г");
    await nameInput.waitFor({ state: "visible", timeout: 15_000 });
    for (const name of RECEIPT_PANTRY_ITEMS) {
      await nameInput.fill(name);
      await page.getByRole("button", { name: "Додати", exact: true }).click();
    }
    await expect(
      page.getByRole("button", { name: /^Редагувати / }),
    ).toHaveCount(RECEIPT_PANTRY_ITEMS.length);

    await auditPage(page, "PANTRY");
  });
});
