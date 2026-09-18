import { test, type Page } from "@playwright/test";
import { argosScreenshot } from "@argos-ci/playwright";

import {
  ALL_FTUX_MODULES,
  type FtuxModuleId,
  type FtuxSeedMode,
  type FtuxTheme,
  seedFTUX,
} from "../utils/seedFTUX";

/**
 * Design-system visual regression — full viewport / theme / surface
 * matrix exercised by audit follow-up #7
 * (`docs/audits/2026-05-07-full-app-regression-ux-audit.md` §7).
 *
 * Coverage
 * --------
 * Viewports — 1440 / 768 / 390 / 320 (audit-required widths) plus
 * legacy 1280 mid-desktop kept for continuity with the previous
 * baseline. Themes — light + dark. Surfaces:
 *
 *   - welcome              → cold-start, `<WelcomeScreen />`
 *   - auth                 → `/sign-in`, `<AuthPage />`
 *   - hub-pre-ftux         → `/`, FTUX hero pending (one-tap card)
 *   - hub                  → `/`, post-FTUX dashboard
 *   - finyk / fizruk /
 *     routine / nutrition  → module shells, post-FTUX
 *   - finyk-first-run /    → per-module first-run banner +
 *     nutrition-first-run    auto-route surfaces (finyk Budgets +
 *                            nutrition Menu) seeded by audit #7 —
 *                            these replaced the retired
 *                            `<ModuleFirstRunGoalSheet />` after
 *                            PR-3 of the FTUX rework.
 *   - hub-chat             → `/chat`, `<HubChatPage />`
 *
 * All seeding goes through `tests/utils/seedFTUX.ts` so the welcome /
 * first-action / module-first-run / what's-new gates are dismissed
 * (or armed, in the targeted first-run case) deterministically before
 * navigation. Adding a new gate? Update `seedFTUX.ts` once and every
 * surface here picks the change up automatically.
 */

const VIEWPORTS = [
  { name: "mobile-320", width: 320, height: 568 },
  { name: "mobile-390", width: 390, height: 844 },
  { name: "tablet-768", width: 768, height: 1024 },
  { name: "desktop-1280", width: 1280, height: 800 },
  { name: "desktop-1440", width: 1440, height: 900 },
] as const;

const THEMES = ["light", "dark"] as const satisfies readonly FtuxTheme[];

interface SurfaceSpec {
  name: string;
  path: string;
  mode: FtuxSeedMode;
  /** Required when `mode === "module-first-run"`. */
  moduleId?: FtuxModuleId;
  /** Spec-specific localStorage entries layered on top of the base seed. */
  extra?: Record<string, string>;
}

const FINYK_MANUAL_ONLY: Record<string, string> = { finyk_manual_only_v1: "1" };

const SURFACES: readonly SurfaceSpec[] = [
  { name: "welcome", path: "/welcome", mode: "cold" },
  { name: "auth", path: "/sign-in", mode: "cold" },
  {
    name: "hub-pre-ftux",
    path: "/",
    mode: "pre-ftux",
    extra: FINYK_MANUAL_ONLY,
  },
  { name: "hub", path: "/", mode: "post-ftux", extra: FINYK_MANUAL_ONLY },
  ...ALL_FTUX_MODULES.map<SurfaceSpec>((id) => ({
    name: id,
    path: `/?module=${id}`,
    mode: "post-ftux",
    extra: id === "finyk" ? FINYK_MANUAL_ONLY : undefined,
  })),
  {
    name: "finyk-first-run",
    path: "/?module=finyk",
    mode: "module-first-run",
    moduleId: "finyk",
    extra: FINYK_MANUAL_ONLY,
  },
  {
    name: "nutrition-first-run",
    path: "/?module=nutrition",
    mode: "module-first-run",
    moduleId: "nutrition",
  },
  {
    name: "hub-chat",
    path: "/chat",
    mode: "post-ftux",
    extra: FINYK_MANUAL_ONLY,
  },
];

async function applySeed(
  page: Page,
  theme: FtuxTheme,
  surface: SurfaceSpec,
): Promise<void> {
  await seedFTUX(page, surface.mode, {
    theme,
    moduleId: surface.moduleId,
    extra: surface.extra,
  });
}

for (const theme of THEMES) {
  for (const viewport of VIEWPORTS) {
    for (const surface of SURFACES) {
      test(`visual: ${theme} ${viewport.name} ${surface.name}`, async ({
        page,
      }) => {
        await page.setViewportSize({
          width: viewport.width,
          height: viewport.height,
        });
        await applySeed(page, theme, surface);

        await page.goto(surface.path, { waitUntil: "domcontentloaded" });
        await page
          .waitForLoadState("networkidle", { timeout: 15_000 })
          .catch(() => {
            /* some surfaces keep long-polling */
          });
        await page
          .locator("main, #root > *")
          .first()
          .waitFor({ state: "visible", timeout: 10_000 });
        // Module-first-run banners + auto-routes can include a one-
        // frame `MonthlyPlanCard` editor expansion. 800 ms keeps
        // parity with the previous baseline timing — see
        // `core/onboarding/useModuleFirstRun.ts` for the contract.
        await page.waitForTimeout(800);

        await argosScreenshot(
          page,
          `${theme}/${viewport.name}/${surface.name}`,
          {
            fullPage: true,
            animations: "disabled",
          },
        );
      });
    }
  }
}
