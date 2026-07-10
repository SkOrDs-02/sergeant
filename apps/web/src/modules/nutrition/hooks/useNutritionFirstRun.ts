/**
 * Last validated: 2026-06-15
 * Status: Active
 */
import { useEffect, useRef, useState } from "react";
import { useModuleFirstRun } from "../../../core/onboarding/useModuleFirstRun";
import type { NutritionPage, MenuSubTab } from "../lib/nutritionRouter";

interface UseNutritionFirstRunParams {
  activePage: NutritionPage;
  menuSubTab: MenuSubTab;
  pwaAction: string | null | undefined;
  setActivePageAndHash: (page: NutritionPage, subTab?: string) => void;
  setMenuSubTab: (sub: MenuSubTab) => void;
}

interface UseNutritionFirstRunResult {
  /**
   * True when the user is on the Menu→Plan tab for the very first
   * Nutrition session. Drive the `firstRunHint` banner on DailyPlanCard.
   */
  firstRunNutritionActive: boolean;
  /** Persist the seen flag and collapse the first-run surface. */
  markNutritionSeen: () => void;
  /**
   * Collapse the latched first-run surface in the current tab without
   * writing the seen flag. Used by the dismiss callback in NutritionApp
   * alongside `markNutritionSeen()`.
   */
  setFirstRunNutritionSurface: (value: boolean) => void;
}

/**
 * Encapsulates the per-session first-run routing and banner-latch
 * behaviour for NutritionApp.
 *
 * On the user's very first Nutrition entry it routes them to
 * «Меню → План на день» so the canonical macro editor (DailyPlanCard)
 * is what they see. The routing is one-shot (ref guard) and is skipped
 * when a `pwaAction` is already controlling navigation (e.g. `add_meal`,
 * `add_meal_photo`) so the shortcut target always wins (audit F19).
 *
 * AI-CONTEXT: extracted from NutritionApp.tsx (card A4, PR-plan-web-2026-05)
 * to satisfy Hard Rule #18 max-lines: 600. All behaviour is preserved
 * verbatim — do not alter semantics without updating NutritionApp.tsx tests.
 */
export function useNutritionFirstRun({
  activePage,
  menuSubTab,
  pwaAction,
  setActivePageAndHash,
  setMenuSubTab,
}: UseNutritionFirstRunParams): UseNutritionFirstRunResult {
  const { firstRun: firstRunNutrition, markSeen: markNutritionSeen } =
    useModuleFirstRun("nutrition");

  // Per-module first-run handoff. On the user's very first Nutrition
  // entry route them to «Меню → План на день» so the canonical macro
  // editor (`DailyPlanCard`) is what they see — see
  // `core/onboarding/useModuleFirstRun.ts` for the rationale and
  // legacy storage-key contract.
  //
  // Latch the initial `firstRun` so `markSeen()` (or any cross-tab
  // edit to the seen flag) doesn't yank the banner away mid-session.
  // The banner itself dismounts on dismiss via `onDismiss`.
  const [firstRunNutritionSurface, setFirstRunNutritionSurface] =
    useState(firstRunNutrition);
  if (firstRunNutrition && !firstRunNutritionSurface) {
    setFirstRunNutritionSurface(true);
  }

  const firstRunNutritionActive =
    firstRunNutritionSurface && activePage === "menu" && menuSubTab === "plan";

  // First-run jump to the canonical goal surface. Fires the first
  // time `firstRunNutrition` resolves truthy after mount — depending
  // on the flag (rather than `[]`) avoids a stale-closure race when
  // `useModuleFirstRun` flips asynchronously after the SQLite read.
  // A ref guard keeps the routing one-shot so a user mid-session who
  // clears the seen flag does not get re-routed away from whatever
  // page they were on. Skipped when a `pwaAction` is already routing
  // the user (e.g. `add_meal`, `add_meal_photo`) so the action target
  // wins (audit F19).
  // AI-CONTEXT: one-shot first-run gate — routes new users to DailyPlanCard; ref prevents re-routing mid-session if pwaAction already controls navigation
  const firstRunJumpDoneRef = useRef(false);
  useEffect(() => {
    if (firstRunJumpDoneRef.current) return;
    if (!firstRunNutrition) return;
    if (pwaAction === "add_meal" || pwaAction === "add_meal_photo") return;
    firstRunJumpDoneRef.current = true;
    if (activePage !== "menu") setActivePageAndHash("menu");
    if (menuSubTab !== "plan") setMenuSubTab("plan");
  }, [
    firstRunNutrition,
    pwaAction,
    activePage,
    menuSubTab,
    setActivePageAndHash,
    setMenuSubTab,
  ]);

  return {
    firstRunNutritionActive,
    markNutritionSeen,
    setFirstRunNutritionSurface,
  };
}
