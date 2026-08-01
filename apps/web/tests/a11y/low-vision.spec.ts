import { expect, test, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

import { seedFTUX } from "../utils/seedFTUX";

/**
 * Closes the three "не перевірено" rows of
 * `docs/90-work/planning/specs/accessibility-low-vision-beta.md`:
 *
 *   1. the HC theme had never been run through axe — only the default
 *      theme was covered, so its AAA token set was verified by hand at
 *      authoring time and never since;
 *   2. text scaling (iOS "Larger Text" / Android "Text scaling") was
 *      unverified — approximated here by scaling the root font size,
 *      which is what rem-based `.text-style-*` utilities respond to;
 *   3. reflow was only ever checked on the initial page render, never
 *      with an overlay open.
 *
 * The root-font-size trick is an APPROXIMATION, not a replacement for a
 * real device: it moves rem-based type only, so the ~800 raw px
 * utilities stay put. It still surfaces the failure mode the spec cares
 * about — text growing inside a container that cannot grow with it.
 */
const AXE_TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "best-practice"];

const ROUTES: ReadonlyArray<{ name: string; path: string }> = [
  { name: "hub-root", path: "/" },
  { name: "finyk", path: "/finyk" },
  { name: "nutrition-menu", path: "/nutrition/menu" },
  { name: "routine-stats", path: "/routine/stats" },
  { name: "settings", path: "/settings" },
];

async function bootstrap(page: Page, path: string) {
  await seedFTUX(page, "post-ftux", { extra: { finyk_manual_only_v1: "1" } });
  await page.goto(path, { waitUntil: "domcontentloaded" });
  await page.waitForLoadState("networkidle", { timeout: 15_000 }).catch(() => {
    /* allow-through: some surfaces keep long-polling connections open */
  });
  await page
    .locator("main, [role='main'], [data-a11y-root], #root > *")
    .first()
    .waitFor({ state: "visible", timeout: 10_000 });
}

/** Elements whose text is clipped by a container that cannot grow. */
async function clippedText(page: Page) {
  return page.evaluate(() => {
    const clipped: string[] = [];
    for (const el of Array.from(
      document.body.querySelectorAll<HTMLElement>("*"),
    )) {
      if (!el.textContent?.trim()) continue;
      if (el.children.length > 0) continue; // leaf text nodes only
      const style = getComputedStyle(el);
      if (style.overflowY !== "hidden" && style.overflow !== "hidden") continue;
      // Skip screen-reader-only text: `sr-only` collapses the box to 1px
      // and clips deliberately, so "text taller than the box" is the
      // intended state, not a defect.
      if (el.clientHeight <= 1 || el.clientWidth <= 1) continue;
      if (style.clipPath.startsWith("inset(50%")) continue;
      // A font's em box (full ascent + descent) is taller than anything
      // its real glyphs draw, so a few percent of "overflow" is normal
      // metrics, not clipped text. 10% is comfortably below a `leading-none`
      // failure (line-height 1 overflows ~17%) and above that noise.
      if (el.scrollHeight > el.clientHeight * 1.1) {
        clipped.push(
          `<${el.tagName.toLowerCase()}> "${el.textContent.trim().slice(0, 40)}" ` +
            `(${el.scrollHeight}px of text in ${el.clientHeight}px)`,
        );
      }
      if (clipped.length >= 5) break;
    }
    return clipped;
  });
}

async function horizontalOverflow(page: Page) {
  return page.evaluate(() => {
    const doc = document.documentElement;
    return { scrollWidth: doc.scrollWidth, clientWidth: doc.clientWidth };
  });
}

// ── 1. The HC theme through axe ─────────────────────────────────────────
for (const { name, path } of ROUTES) {
  test(`a11y-hc: ${name} has no serious/critical violations in the high-contrast theme`, async ({
    page,
  }) => {
    // `hub_theme_v2` is the app's own persistence key — seeding it is the
    // same path a user takes through the switcher, so no test-only hook.
    await page.addInitScript(() => {
      window.localStorage.setItem("hub_theme_v2", "hc");
    });
    await bootstrap(page, path);

    await expect
      .poll(() =>
        page.evaluate(() => document.documentElement.classList.contains("hc")),
      )
      .toBe(true);

    const results = await new AxeBuilder({ page }).withTags(AXE_TAGS).analyze();
    const blocking = results.violations.filter(
      (v) => v.impact === "serious" || v.impact === "critical",
    );

    expect(
      blocking.map((v) => ({
        id: v.id,
        impact: v.impact,
        help: v.help,
        targets: v.nodes.slice(0, 3).map((n) => n.target),
      })),
      `axe serious/critical violations on ${path} under html.hc`,
    ).toEqual([]);
  });
}

// ── 2. Scaled text at the narrowest supported width ─────────────────────
for (const { name, path } of ROUTES) {
  test(`text-scale: ${name} survives 200% root text at 320px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width: 320, height: 640 });
    // 200% of the 16px default — the top of the iOS "Larger Text" range
    // and roughly Android's largest text-scaling step.
    await page.addInitScript(() => {
      document.addEventListener("DOMContentLoaded", () => {
        document.documentElement.style.fontSize = "200%";
      });
    });
    await bootstrap(page, path);
    await page.evaluate(() => {
      document.documentElement.style.fontSize = "200%";
    });
    await page.waitForTimeout(300); // let the reflow settle

    const { scrollWidth, clientWidth } = await horizontalOverflow(page);
    const clipped = await clippedText(page);

    expect(
      { scrollWidth, clientWidth, clipped },
      `layout broke under 200% text on ${path}`,
    ).toMatchObject({ scrollWidth: clientWidth, clipped: [] });
  });
}

// ── 3. Reflow with an overlay open ──────────────────────────────────────
test("overlay-reflow: the command palette does not overflow at 320px", async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 640 });
  await bootstrap(page, "/");

  await page.keyboard.press("Control+k");
  const dialog = page.locator('[role="dialog"]').first();
  await dialog.waitFor({ state: "visible", timeout: 5_000 });

  const { scrollWidth, clientWidth } = await horizontalOverflow(page);
  expect(
    { scrollWidth, clientWidth },
    "command palette overflows the viewport at 320px",
  ).toMatchObject({ scrollWidth: clientWidth });
});
