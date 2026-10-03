import { expect, test, type Page } from "@playwright/test";

import { seedFTUX } from "../utils/seedFTUX";

/**
 * WCAG 1.4.10 (Reflow) — at 320 CSS px of width (equivalent to 400% zoom
 * on a 1280px desktop) content must reflow into a single column with no
 * horizontal scrolling. axe cannot detect this; only a real viewport can.
 *
 * WCAG 1.4.4 (Resize text) is approximated by the 640px pass — the same
 * layout at 200% zoom on a 1280px desktop.
 */
const ROUTES: ReadonlyArray<{ name: string; path: string }> = [
  { name: "hub-root", path: "/" },
  { name: "finyk", path: "/finyk" },
  { name: "fizruk-workouts", path: "/fizruk/workouts" },
  { name: "nutrition-menu", path: "/nutrition/menu" },
  { name: "routine-stats", path: "/routine/stats" },
  { name: "settings", path: "/settings" },
  { name: "pricing", path: "/pricing" },
];

const WIDTHS = [
  { label: "320px (400% zoom)", width: 320, height: 640 },
  { label: "640px (200% zoom)", width: 640, height: 800 },
];

async function horizontalOverflow(page: Page) {
  return page.evaluate(() => {
    const doc = document.documentElement;
    const overflowing: string[] = [];
    for (const el of Array.from(
      document.body.querySelectorAll<HTMLElement>("*"),
    )) {
      const rect = el.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) continue;
      if (rect.right > doc.clientWidth + 1) {
        const cls =
          typeof el.className === "string" ? el.className.slice(0, 80) : "";
        overflowing.push(
          `${el.tagName.toLowerCase()}${cls ? "." + cls.trim().split(/\s+/).join(".") : ""} → right=${Math.round(rect.right)}`,
        );
      }
      if (overflowing.length >= 5) break;
    }
    return {
      scrollWidth: doc.scrollWidth,
      clientWidth: doc.clientWidth,
      offenders: overflowing,
    };
  });
}

for (const { label, width, height } of WIDTHS) {
  for (const { name, path } of ROUTES) {
    test(`reflow ${label}: ${name} has no horizontal scroll`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height });
      await seedFTUX(page, "post-ftux", {
        extra: { finyk_manual_only_v1: "1" },
      });

      await page.goto(path, { waitUntil: "domcontentloaded" });
      await page
        .waitForLoadState("networkidle", { timeout: 15_000 })
        .catch(() => {
          /* allow-through: some surfaces keep long-polling connections open */
        });
      await page
        .locator("main, [role='main'], [data-a11y-root], #root > *")
        .first()
        .waitFor({ state: "visible", timeout: 10_000 });

      const { scrollWidth, clientWidth, offenders } =
        await horizontalOverflow(page);

      expect(
        { scrollWidth, clientWidth, offenders },
        `horizontal overflow on ${path} at ${label}`,
      ).toMatchObject({ scrollWidth: clientWidth });
    });
  }
}
