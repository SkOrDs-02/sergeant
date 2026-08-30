import { expect, test, type Page } from "@playwright/test";

import { seedFTUX } from "../utils/seedFTUX";

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
  { id: "FIZRUK", path: "/fizruk" },
  { id: "ROUTINE", path: "/routine" },
  { id: "NUTRITION", path: "/nutrition/menu" },
  { id: "SETTINGS", path: "/settings" },
  { id: "REPORTS", path: "/?tab=reports" },
  { id: "INSIGHTS", path: "/insights" },
];

// Minimal API mock — the app renders fully client-side once `/me` returns a
// user, so no backend is required. Mirrors playwright.ledger.config.ts.
async function mockApi(page: Page) {
  await page.route("**/api/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    const method = route.request().method();
    if (path.includes("/me")) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          ok: true,
          user: {
            id: "qa-user",
            name: "QA User",
            email: "qa@example.com",
            emailVerified: true,
          },
        }),
      });
      return;
    }
    await route.fulfill({
      status: method === "POST" ? 204 : 200,
      contentType: "application/json",
      body: method === "POST" ? "" : JSON.stringify({ ok: true }),
    });
  });
}

// Controls that mobile.css raises to a 44×44 floor under `pointer: coarse`.
// Byte-for-byte aligned with apps/web/src/styles/mobile.css.
const FLOOR_SELECTOR = [
  "button:not([data-compact]):not(:disabled)",
  '[role="button"]:not([data-compact]):not(:disabled)',
  '[role="tab"]:not([data-compact])',
  '[role="menuitem"]:not([data-compact])',
  '[role="menuitemradio"]:not([data-compact])',
  '[role="option"]:not([data-compact])',
  "[data-touch-target]",
].join(",");

// Run the four viewport-dependent checks that only mean something on a real
// coarse-pointer mobile viewport: no sideways scroll, no content buried inside
// an `overflow-x: hidden` box, the touch-target floor, and no truncated
// structural label. The first two are separate on purpose — a clipping box
// turns the first one green while the layout is still broken.
// Structural labels are detected via
// `text-transform: uppercase` — the design system uppercases section/legend
// captions but never user content, so clipping there is a real layout bug
// while an ellipsis on a user-typed note is expected.
async function auditPage(page: Page, id: string) {
  await page
    .locator("main, [role='main'], [data-a11y-root], #root > *")
    .first()
    .waitFor({ state: "visible", timeout: 15_000 });

  const coarse = await page.evaluate(
    () => window.matchMedia("(pointer: coarse)").matches,
  );
  expect(coarse, `pointer:coarse must be active — ${id}`).toBe(true);

  // Settle before measuring. Loading skeletons swap for real content, and
  // `module-slide-in` / `skeleton-stagger` translate that content sideways for
  // a few hundred ms — a rect read mid-flight reports an escape that does not
  // exist once the frame lands. Looped ambience (shimmer, pulse) never
  // finishes, so only finite animations are awaited.
  await page
    .locator('[aria-busy="true"]')
    .first()
    .waitFor({ state: "hidden", timeout: 15_000 })
    .catch(() => undefined);
  await page.evaluate(async () => {
    const finite = document
      .getAnimations()
      .filter((a) => a.effect?.getComputedTiming().iterations !== Infinity);
    await Promise.all(finite.map((a) => a.finished.catch(() => undefined)));
  });

  const report = await page.evaluate((selector) => {
    const FLOOR = 44;
    const EXCLUDED_ROLES = new Set(["switch", "checkbox", "radio"]);
    const undersized: Array<{ label: string; w: number; h: number }> = [];
    for (const el of Array.from(document.querySelectorAll(selector))) {
      if (el.getAttribute("aria-hidden") === "true") continue;
      const role = el.getAttribute("role");
      if (role && EXCLUDED_ROLES.has(role)) continue;
      const maybe = el as HTMLElement & {
        checkVisibility?: (opts?: {
          checkOpacity?: boolean;
          checkVisibilityCSS?: boolean;
        }) => boolean;
      };
      if (
        typeof maybe.checkVisibility === "function" &&
        !maybe.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true })
      ) {
        continue;
      }
      const rect = el.getBoundingClientRect();
      if (rect.width <= 1 || rect.height <= 1) continue;
      if (
        rect.bottom <= 0 ||
        rect.right <= 0 ||
        rect.top >= window.innerHeight ||
        rect.left >= window.innerWidth
      ) {
        continue;
      }
      if (rect.height < FLOOR - 0.5 || rect.width < FLOOR - 0.5) {
        undersized.push({
          label: (el.textContent || el.getAttribute("aria-label") || el.tagName)
            .trim()
            .slice(0, 40),
          w: Math.round(rect.width),
          h: Math.round(rect.height),
        });
      }
    }

    const clippedLabels: Array<{ label: string; lostPx: number }> = [];
    for (const el of Array.from(document.querySelectorAll("*"))) {
      const cs = getComputedStyle(el);
      if (cs.textOverflow !== "ellipsis" || cs.textTransform !== "uppercase") {
        continue;
      }
      if (el.scrollWidth <= el.clientWidth + 2 || el.clientWidth <= 12)
        continue;
      const txt = (el.textContent || "").trim();
      if (!txt) continue;
      clippedLabels.push({
        label: txt.slice(0, 40),
        lostPx: el.scrollWidth - el.clientWidth,
      });
    }

    // Content wider than an `overflow-x: hidden` box: off-screen AND
    // unreachable, because that box swallows the scroll `overflowPx` below
    // would otherwise report. So `overflowPx` reads a clean zero while the
    // layout is broken — exactly how the pantry grid blew 155px past a 393px
    // viewport unnoticed (PR #925).
    //
    // Measured on the clipping box rather than on child rects: a hidden
    // overflow box is still programmatically scrollable, and the browser does
    // scroll it (focusing an input is enough), which slides every child rect
    // back inside the viewport and hides the defect from a rect sweep.
    //
    // `text-overflow: ellipsis` is excluded — a truncated label is meant to
    // overflow its box, and `clippedLabels` above already judges those.
    const clippedContent: Array<{ cls: string; lostPx: number }> = [];
    for (const el of Array.from(document.querySelectorAll("*"))) {
      const cs = getComputedStyle(el);
      if (cs.overflowX !== "hidden" || cs.textOverflow === "ellipsis") continue;
      const lostPx = el.scrollWidth - el.clientWidth;
      if (lostPx <= 1 || el.clientWidth <= 12) continue;
      clippedContent.push({
        cls: (el.getAttribute("class") || "").slice(0, 80),
        lostPx,
      });
    }

    return {
      overflowPx: document.documentElement.scrollWidth - window.innerWidth,
      undersized,
      clippedLabels,
      clippedContent,
    };
  }, FLOOR_SELECTOR);

  expect(
    report.overflowPx,
    `horizontal overflow (px) — ${id}`,
  ).toBeLessThanOrEqual(1);
  expect(
    report.clippedContent,
    `content clipped by an overflow-x:hidden box — ${id}`,
  ).toEqual([]);
  expect(report.undersized, `sub-44px touch targets — ${id}`).toEqual([]);
  expect(report.clippedLabels, `truncated uppercase labels — ${id}`).toEqual(
    [],
  );
}

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
