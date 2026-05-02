import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

/**
 * Pre-seed localStorage so the SPA can land directly on targeted hub
 * surfaces. Welcome intentionally runs without this seed.
 */
const SEEDED_LS: Record<string, string> = {
  hub_onboarding_done_v1: "1",
  hub_first_action_done_v1: "1",
  hub_first_real_entry_done_v1: "1",
  hub_onboarding_vibes_v1: JSON.stringify([
    "finyk",
    "fizruk",
    "nutrition",
    "routine",
  ]),
  hub_vibe_picks_v1: JSON.stringify({
    picks: ["finyk", "fizruk", "nutrition", "routine"],
    firstActionPending: null,
    firstActionStartedAt: null,
    firstRealEntryAt: Date.now(),
    updatedAt: Date.now(),
  }),
};

const PRE_FTUX_LS: Record<string, string> = {
  hub_onboarding_done_v1: "1",
  hub_first_action_pending_v1: "1",
  hub_first_action_started_at_v1: String(Date.now()),
  hub_onboarding_vibes_v1: JSON.stringify([
    "finyk",
    "fizruk",
    "nutrition",
    "routine",
  ]),
  hub_vibe_picks_v1: JSON.stringify({
    picks: ["finyk", "fizruk", "nutrition", "routine"],
    firstActionPending: "finyk",
    firstActionStartedAt: Date.now(),
    firstRealEntryAt: null,
    updatedAt: Date.now(),
  }),
};

async function seedLocalStorage(
  page: Page,
  seed: Record<string, string> | null = SEEDED_LS,
) {
  if (!seed) return;

  await page.addInitScript((entries: Record<string, string>) => {
    try {
      for (const [k, v] of Object.entries(entries)) {
        window.localStorage.setItem(k, v);
      }
    } catch {
      /* ignore */
    }
  }, seed);
}

const SURFACES: Array<{
  name: string;
  path: string;
  seed?: Record<string, string> | null;
}> = [
  { name: "welcome", path: "/welcome", seed: null },
  { name: "hub-pre-ftux", path: "/", seed: PRE_FTUX_LS },
  { name: "hub-root", path: "/", seed: SEEDED_LS },
  { name: "finyk-overview", path: "/?module=finyk", seed: SEEDED_LS },
  { name: "fizruk-dashboard", path: "/?module=fizruk", seed: SEEDED_LS },
  { name: "nutrition-dashboard", path: "/?module=nutrition", seed: SEEDED_LS },
  { name: "routine-dashboard", path: "/?module=routine", seed: SEEDED_LS },
  { name: "auth-sign-in", path: "/sign-in", seed: SEEDED_LS },
  { name: "design-showcase", path: "/design", seed: SEEDED_LS },
];

for (const { name, path, seed } of SURFACES) {
  test(`a11y: ${name} has no serious/critical violations`, async ({ page }) => {
    await seedLocalStorage(page, seed);

    const consoleErrors: string[] = [];
    page.on("console", (msg) => {
      if (msg.type() === "error") {
        consoleErrors.push(msg.text());
      }
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

    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "best-practice"])
      .analyze();

    const blocking = results.violations.filter(
      (v) => v.impact === "serious" || v.impact === "critical",
    );

    if (blocking.length > 0) {
      const summary = blocking
        .map(
          (v) =>
            `- [${v.impact}] ${v.id}: ${v.help} (${v.nodes.length} node${
              v.nodes.length === 1 ? "" : "s"
            })\n    ${v.helpUrl}`,
        )
        .join("\n");
      throw new Error(
        `axe found ${blocking.length} serious/critical violation(s) on ${path}:\n${summary}`,
      );
    }

    const softCount = results.violations.length - blocking.length;
    if (softCount > 0) {
      test.info().annotations.push({
        type: "axe-soft",
        description: `${softCount} non-blocking violation(s) on ${path} (minor/moderate).`,
      });
    }

    expect(
      consoleErrors.filter(
        (e) =>
          !e.includes("workbox") &&
          !e.includes("Service worker") &&
          !e.includes("Failed to load resource"),
      ),
      `console errors on ${path}:\n${consoleErrors.join("\n")}`,
    ).toEqual([]);
  });
}
