/**
 * Спільний харнес коарс-поінтер аудиту: мок API, селектор 44px-флору і
 * `auditPage`. Живе окремим модулем, бо тим самим міряють два спеки
 * (`mobile-ui-audit`, `pantry-storage-places`), а дубльований інваріант
 * розходиться на першій же правці.
 */
import { expect, type Page } from "@playwright/test";

// Minimal API mock — the app renders fully client-side once `/me` returns a
// user, so no backend is required. Mirrors playwright.ledger.config.ts.
export async function mockApi(page: Page) {
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
export const FLOOR_SELECTOR = [
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
export async function auditPage(page: Page, id: string) {
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
