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

// Run the three viewport-dependent checks that only mean something on a real
// coarse-pointer mobile viewport: no sideways scroll, the touch-target floor,
// and no truncated structural label. Structural labels are detected via
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

    return {
      overflowPx: document.documentElement.scrollWidth - window.innerWidth,
      undersized,
      clippedLabels,
    };
  }, FLOOR_SELECTOR);

  expect(
    report.overflowPx,
    `horizontal overflow (px) — ${id}`,
  ).toBeLessThanOrEqual(1);
  expect(report.undersized, `sub-44px touch targets — ${id}`).toEqual([]);
  expect(report.clippedLabels, `truncated uppercase labels — ${id}`).toEqual(
    [],
  );
}

test.describe("mobile coarse-pointer UI audit", () => {
  for (const routeCase of ROUTES) {
    test(`${routeCase.id} ${routeCase.path}`, async ({ page }) => {
      await mockApi(page);
      await seedFTUX(page, "post-ftux");
      await page.goto(routeCase.path, { waitUntil: "domcontentloaded" });
      await auditPage(page, routeCase.id);
    });
  }
});
