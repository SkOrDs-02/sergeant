/**
 * Stable seed/dismiss helpers for the FTUX surfaces (PR-7 of audit
 * `2026-05-07-full-app-regression-ux-audit.md`).
 *
 * Why this module exists
 * ----------------------
 * The web app has three independent FTUX overlays that all auto-open
 * on cold start and that all must be dismissed before any meaningful
 * Hub / module surface is visible:
 *
 *   1. `/welcome` cold-start splash (`<WelcomeScreen />`, gated by
 *      `shouldShowOnboarding()` → `hub_onboarding_done_v1`).
 *   2. `<FirstActionHeroCard />` — the "one tap to your first real
 *      entry" card on the Hub dashboard. Gated by
 *      `hub_first_action_pending_v1` (set by the wizard, cleared by
 *      `dismissFirstAction` / `markFirstRealEntryDone`).
 *   3. Per-module first-run hint banner / auto-route — when a module
 *      is entered for the first time, its app shell calls
 *      `useModuleFirstRun(moduleId)` and routes the user to the
 *      canonical goal-setting surface (nutrition Menu / finyk
 *      Budgets / routine HabitQuickCreate) with a one-time
 *      `<FirstRunHintBanner />`. Gated by
 *      `sergeant.onboarding.module_first_seen.<moduleId>.v1`. The
 *      legacy `<ModuleFirstRunGoalSheet />` was retired in PR-3 of
 *      the FTUX rework — the storage key is preserved verbatim so
 *      sessions that already saw the sheet do not get a fresh
 *      banner.
 *
 * Plus `<WhatsNewModal />` which auto-shows ~2.5 s after dashboard mount
 * unless `sergeant.whatsNew.lastSeenId.v1` already matches `RELEASES[0]`.
 *
 * Before this helper, every smoke / visual spec inlined a slightly
 * different copy of the seed map: `bottom-nav.spec.ts` covered the
 * module-first-run + whats-new keys, `dashboard-health.spec.ts` only
 * covered the wizard + vibe-picks, and `ds-visual-qa.spec.ts` covered
 * the FTUX hero but not the module sheets — meaning the visual matrix
 * had a non-deterministic «Налаштуй …» overlay over the module
 * baselines. The audit (#7) called this out as a manual UX-pass
 * stability issue; centralising the seed contract here is the fix.
 *
 * Single source of truth
 * ----------------------
 * Storage keys are imported from the canonical packages where they
 * live (`@sergeant/shared`, `apps/web/src/core/onboarding/...`,
 * `apps/web/src/core/whatsNew/...`) so that a key rename in source
 * cannot silently break the seed contract.
 *
 * Usage
 * -----
 *   await seedFTUX(page, "post-ftux", { theme: "dark" });
 *   await page.goto("/?module=finyk");
 *
 * Modes:
 *   - "cold"             — only theme set, nothing dismissed. Welcome
 *                          splash takes over `/`. Use this for `/welcome`
 *                          screenshots.
 *   - "pre-ftux"         — onboarding done, FTUX hero pending,
 *                          module-first-seen flags marked, what's-new
 *                          dismissed. Use for the pre-FTUX dashboard
 *                          baseline.
 *   - "post-ftux"        — onboarding done, FTUX hero dismissed, real
 *                          entry recorded, all module-first-seen flags
 *                          marked, what's-new dismissed. Use for the
 *                          steady-state Hub + module shells.
 *   - "module-first-run" — like `post-ftux` but the named module's
 *                          first-seen flag is left absent so the
 *                          per-module first-run banner + auto-route
 *                          fires (nutrition → Menu / finyk →
 *                          Budgets / routine → HabitQuickCreate).
 *                          Used by visual baselines that specifically
 *                          want the first-run hint surface on screen.
 */

import type { Page } from "@playwright/test";

import {
  FIRST_ACTION_PENDING_KEY,
  FIRST_ACTION_STARTED_AT_KEY,
  FIRST_REAL_ENTRY_KEY,
  ONBOARDING_DONE_KEY,
  SOFT_AUTH_DISMISSED_KEY,
  VIBE_PICKS_KEY,
  type DashboardModuleId,
} from "@sergeant/shared";

import { RELEASES } from "../../src/core/whatsNew/releases";
import { WHATS_NEW_LAST_SEEN_KEY } from "../../src/core/whatsNew/storage";

/** Mirrors the constant in `useDarkMode.ts` (private inside the hook). */
const DARK_MODE_KEY = "hub_dark_mode_v1";

/** Legacy «first action done» flag still read by some surfaces. */
const FIRST_ACTION_DONE_LEGACY_KEY = "hub_first_action_done_v1";

/**
 * Mirrors `FIRST_SEEN_KEY_PREFIX/SUFFIX` in
 * `apps/web/src/core/onboarding/useModuleFirstRun.ts`. Marking this
 * flag suppresses the per-module first-run banner + auto-route that
 * fires on first module mount.
 */
const MODULE_FIRST_SEEN_KEY_PREFIX = "sergeant.onboarding.module_first_seen.";
const MODULE_FIRST_SEEN_KEY_SUFFIX = ".v1";

export const ALL_FTUX_MODULES = [
  "finyk",
  "fizruk",
  "routine",
  "nutrition",
] as const satisfies readonly DashboardModuleId[];

export type FtuxModuleId = (typeof ALL_FTUX_MODULES)[number];

export function moduleFirstSeenKey(moduleId: FtuxModuleId): string {
  return `${MODULE_FIRST_SEEN_KEY_PREFIX}${moduleId}${MODULE_FIRST_SEEN_KEY_SUFFIX}`;
}

export type FtuxTheme = "light" | "dark";

export type FtuxSeedMode =
  | "cold"
  | "pre-ftux"
  | "post-ftux"
  | "module-first-run";

export interface SeedFTUXOptions {
  /** Theme to apply via `hub_dark_mode_v1`. Defaults to `"light"`. */
  theme?: FtuxTheme;
  /**
   * Module whose first-run sheet should be left armed. Required for
   * `mode === "module-first-run"`, ignored otherwise.
   */
  moduleId?: FtuxModuleId;
  /**
   * Extra localStorage entries to merge after the canonical FTUX seed.
   * Use this for spec-specific keys (e.g. `finyk_manual_only_v1`)
   * without forking the helper.
   */
  extra?: Record<string, string>;
}

/** All keys this helper writes — exported so cleanup specs can wipe
 *  the world if they need to (e.g. a returning-user spec that wants
 *  to start from a truly empty `localStorage`). */
export const FTUX_SEED_KEYS: readonly string[] = [
  DARK_MODE_KEY,
  ONBOARDING_DONE_KEY,
  FIRST_ACTION_DONE_LEGACY_KEY,
  FIRST_ACTION_PENDING_KEY,
  FIRST_ACTION_STARTED_AT_KEY,
  FIRST_REAL_ENTRY_KEY,
  SOFT_AUTH_DISMISSED_KEY,
  VIBE_PICKS_KEY,
  "hub_vibe_picks_v1",
  WHATS_NEW_LAST_SEEN_KEY,
  ...ALL_FTUX_MODULES.map(moduleFirstSeenKey),
];

interface InitScriptPayload {
  toSet: Record<string, string>;
  toRemove: readonly string[];
}

function buildPayload(
  mode: FtuxSeedMode,
  options: SeedFTUXOptions,
): InitScriptPayload {
  const theme = options.theme ?? "light";
  const now = Date.now();
  const set: Record<string, string> = {
    [DARK_MODE_KEY]: theme === "dark" ? "1" : "0",
  };
  const remove: string[] = [];

  if (mode === "cold") {
    // Welcome splash should take over `/`. Strip every other gate so
    // the spec can verify the cold-start surface deterministically.
    remove.push(
      ONBOARDING_DONE_KEY,
      FIRST_ACTION_DONE_LEGACY_KEY,
      FIRST_ACTION_PENDING_KEY,
      FIRST_ACTION_STARTED_AT_KEY,
      FIRST_REAL_ENTRY_KEY,
      SOFT_AUTH_DISMISSED_KEY,
      VIBE_PICKS_KEY,
      "hub_vibe_picks_v1",
      WHATS_NEW_LAST_SEEN_KEY,
      ...ALL_FTUX_MODULES.map(moduleFirstSeenKey),
    );
    return { toSet: { ...set, ...(options.extra ?? {}) }, toRemove: remove };
  }

  // Onboarding wizard finished — `<WelcomeScreen />` redirects away
  // from `/welcome` once this flag is "1".
  set[ONBOARDING_DONE_KEY] = "1";

  // Vibe picks — pin all four modules so the dashboard renders the
  // full bento grid rather than the empty-state. The shared key
  // (`VIBE_PICKS_KEY = "hub_onboarding_vibes_v1"`) is the canonical
  // one; the legacy `hub_vibe_picks_v1` blob is also written so any
  // surface still reading the older shape (FirstActionHeroCard,
  // analytics) sees consistent state.
  const allModules: readonly FtuxModuleId[] = ALL_FTUX_MODULES;
  set[VIBE_PICKS_KEY] = JSON.stringify(allModules);
  set["hub_vibe_picks_v1"] = JSON.stringify({
    picks: allModules,
    firstActionPending: mode === "pre-ftux" ? "finyk" : null,
    firstActionStartedAt: mode === "pre-ftux" ? now : null,
    firstRealEntryAt: mode === "pre-ftux" ? null : now,
    updatedAt: now,
  });

  if (mode === "pre-ftux") {
    set[FIRST_ACTION_PENDING_KEY] = "1";
    set[FIRST_ACTION_STARTED_AT_KEY] = String(now);
    remove.push(FIRST_REAL_ENTRY_KEY, FIRST_ACTION_DONE_LEGACY_KEY);
  } else {
    // post-ftux + module-first-run — first-action hero is dismissed,
    // first-real-entry recorded so the soft-auth nag does not fire.
    set[FIRST_REAL_ENTRY_KEY] = "1";
    set[FIRST_ACTION_DONE_LEGACY_KEY] = "1";
    remove.push(FIRST_ACTION_PENDING_KEY, FIRST_ACTION_STARTED_AT_KEY);
  }

  // Suppress the soft-auth nag — the visual matrix is anonymous and
  // the nag would fire ~2 session-days in. Idempotent: writing "1" is
  // safe even when the key is absent.
  set[SOFT_AUTH_DISMISSED_KEY] = "1";

  // Suppress the «What's new» modal. `<useWhatsNew />` calls
  // `pickRelease(lastSeenId)` which returns `null` when `lastSeenId
  // === RELEASES[0].id`, so the modal never auto-opens.
  const latestRelease = RELEASES[0];
  if (latestRelease) {
    set[WHATS_NEW_LAST_SEEN_KEY] = latestRelease.id;
  }

  // Mark every module's first-run flag as already seen — except the
  // single module the caller wants to capture. `module-first-run`
  // therefore gives a deterministic single-banner screenshot.
  const skip = mode === "module-first-run" ? options.moduleId : null;
  for (const id of ALL_FTUX_MODULES) {
    if (id === skip) {
      remove.push(moduleFirstSeenKey(id));
    } else {
      set[moduleFirstSeenKey(id)] = "1";
    }
  }

  return { toSet: { ...set, ...(options.extra ?? {}) }, toRemove: remove };
}

/**
 * Seed `localStorage` so the FTUX surfaces match `mode` *before* the
 * page navigates. Must be called before `page.goto(...)` — uses
 * `addInitScript` so the seed is in place before any app code runs.
 *
 * Idempotent: calling twice does not double-write keys, and unknown
 * mode/module combinations throw at boot rather than at assertion
 * time.
 */
export async function seedFTUX(
  page: Page,
  mode: FtuxSeedMode,
  options: SeedFTUXOptions = {},
): Promise<void> {
  if (mode === "module-first-run" && !options.moduleId) {
    throw new Error(
      'seedFTUX("module-first-run") requires options.moduleId — pick the module whose first-run sheet should auto-open.',
    );
  }
  const payload = buildPayload(mode, options);
  await page.addInitScript((p: InitScriptPayload) => {
    try {
      for (const k of p.toRemove) {
        window.localStorage.removeItem(k);
      }
      for (const [k, v] of Object.entries(p.toSet)) {
        window.localStorage.setItem(k, v);
      }
    } catch {
      /* ignore — incognito storage quotas, etc. */
    }
  }, payload);
}

/**
 * Convenience wrapper for the most common case: post-FTUX dashboard
 * with a known theme. Equivalent to
 * `seedFTUX(page, "post-ftux", { theme })`.
 */
export async function seedHub(
  page: Page,
  theme: FtuxTheme = "light",
): Promise<void> {
  await seedFTUX(page, "post-ftux", { theme });
}
