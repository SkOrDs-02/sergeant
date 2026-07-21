import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

import { seedFTUX } from "../utils/seedFTUX";

const AXE_TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "best-practice"];

const ROUTES: ReadonlyArray<{ name: string; path: string }> = [
  { name: "finyk-budgets", path: "/finyk/budgets" },
  { name: "finyk-assets", path: "/finyk/assets" },
  { name: "fizruk-workouts", path: "/fizruk/workouts" },
  { name: "routine-stats", path: "/routine/stats" },
];

async function waitForAppShell(page: import("@playwright/test").Page) {
  await page.waitForLoadState("networkidle", { timeout: 15_000 }).catch(() => {
    /* allow-through: some surfaces keep long-polling connections open */
  });
  await page
    .locator("main, [role='main'], [data-a11y-root], #root > *")
    .first()
    .waitFor({ state: "visible", timeout: 10_000 });
}

for (const { name, path } of ROUTES) {
  test(`a11y-expanded: ${name} has no serious/critical violations`, async ({
    page,
  }) => {
    await seedFTUX(page, "post-ftux", {
      extra: { finyk_manual_only_v1: "1" },
    });

    await page.goto(path, { waitUntil: "domcontentloaded" });
    await waitForAppShell(page);

    const results = await new AxeBuilder({ page }).withTags(AXE_TAGS).analyze();
    const blocking = results.violations.filter(
      (violation) =>
        violation.impact === "serious" || violation.impact === "critical",
    );

    expect(
      blocking.map((violation) => ({
        id: violation.id,
        impact: violation.impact,
        help: violation.help,
        targets: violation.nodes.slice(0, 3).map((node) => node.target),
      })),
      `axe serious/critical violations on ${path}`,
    ).toEqual([]);
  });
}
