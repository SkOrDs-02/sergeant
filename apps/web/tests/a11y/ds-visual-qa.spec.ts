import { test, type Page } from "@playwright/test";
import { argosScreenshot } from "@argos-ci/playwright";

/**
 * Design-system visual regression.
 *
 * Baselines cover the activation-critical surfaces (welcome, pre-FTUX
 * hub, post-FTUX hub) plus the module shells across light/dark mode and
 * the requested mobile/desktop sizes.
 */

const VIEWPORTS = [
  { name: "mobile-375", width: 375, height: 812 },
  { name: "mobile-414", width: 414, height: 900 },
  { name: "tablet-768", width: 768, height: 900 },
  { name: "desktop-1280", width: 1280, height: 800 },
] as const;
const THEMES = ["light", "dark"] as const;

const POST_FTUX_SEED = "post-ftux" as const;
const PRE_FTUX_SEED = "pre-ftux" as const;

const SURFACES: Array<{
  name: string;
  path: string;
  seed: typeof POST_FTUX_SEED | typeof PRE_FTUX_SEED | null;
}> = [
  { name: "welcome", path: "/welcome", seed: null },
  { name: "hub-pre-ftux", path: "/", seed: PRE_FTUX_SEED },
  { name: "hub", path: "/", seed: POST_FTUX_SEED },
  { name: "finyk", path: "/?module=finyk", seed: POST_FTUX_SEED },
  { name: "fizruk", path: "/?module=fizruk", seed: POST_FTUX_SEED },
  { name: "routine", path: "/?module=routine", seed: POST_FTUX_SEED },
  { name: "nutrition", path: "/?module=nutrition", seed: POST_FTUX_SEED },
];

function buildSeed(
  theme: "light" | "dark",
  mode: typeof POST_FTUX_SEED | typeof PRE_FTUX_SEED,
): Record<string, string> {
  const now = Date.now();
  const seed: Record<string, string> = {
    hub_onboarding_done_v1: "1",
    finyk_manual_only_v1: "1",
    hub_dark_mode_v1: theme === "dark" ? "1" : "0",
    hub_onboarding_vibes_v1: JSON.stringify([
      "finyk",
      "fizruk",
      "nutrition",
      "routine",
    ]),
    hub_vibe_picks_v1: JSON.stringify({
      picks: ["finyk", "fizruk", "nutrition", "routine"],
      firstActionPending: mode === PRE_FTUX_SEED ? "finyk" : null,
      firstActionStartedAt: mode === PRE_FTUX_SEED ? now : null,
      firstRealEntryAt: mode === POST_FTUX_SEED ? now : null,
      updatedAt: now,
    }),
  };

  if (mode === POST_FTUX_SEED) {
    seed.hub_first_real_entry_done_v1 = "1";
  } else {
    seed.hub_first_action_pending_v1 = "1";
    seed.hub_first_action_started_at_v1 = String(now);
  }

  return seed;
}

async function seedLocalStorage(
  page: Page,
  theme: "light" | "dark",
  mode: typeof POST_FTUX_SEED | typeof PRE_FTUX_SEED | null,
) {
  if (!mode) {
    await page.addInitScript((dark: boolean) => {
      try {
        window.localStorage.setItem("hub_dark_mode_v1", dark ? "1" : "0");
      } catch {
        /* ignore */
      }
    }, theme === "dark");
    return;
  }

  await page.addInitScript(
    (entries: Record<string, string>) => {
      try {
        for (const [k, v] of Object.entries(entries)) {
          window.localStorage.setItem(k, v);
        }
      } catch {
        /* ignore */
      }
    },
    buildSeed(theme, mode),
  );
}

for (const theme of THEMES) {
  for (const viewport of VIEWPORTS) {
    for (const { name, path: routePath, seed } of SURFACES) {
      test(`visual: ${theme} ${viewport.name} ${name}`, async ({ page }) => {
        await page.setViewportSize({
          width: viewport.width,
          height: viewport.height,
        });
        await seedLocalStorage(page, theme, seed);

        await page.goto(routePath, { waitUntil: "domcontentloaded" });
        await page
          .waitForLoadState("networkidle", { timeout: 15_000 })
          .catch(() => {
            /* some surfaces keep long-polling */
          });
        await page
          .locator("main, #root > *")
          .first()
          .waitFor({ state: "visible", timeout: 10_000 });
        await page.waitForTimeout(800);

        await argosScreenshot(page, `${theme}/${viewport.name}/${name}`, {
          fullPage: true,
          animations: "disabled",
        });
      });
    }
  }
}
