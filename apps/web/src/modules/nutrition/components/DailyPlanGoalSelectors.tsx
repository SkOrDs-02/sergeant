/**
 * Last validated: 2026-05-14
 * Status: Active
 */
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { Dispatch, RefObject, SetStateAction } from "react";
import { Link } from "react-router-dom";
import { cn } from "@shared/lib/ui/cn";
import { messages } from "@shared/i18n/uk";
import { PROFILE_PATH } from "../../../core/app/appPaths";
import { useBiometrics } from "../../../core/profile/useBiometrics";
import {
  NUTRITION_GOALS,
  computeNutritionTargetsFromBiometrics,
  type NutritionGoalId,
  type NutritionTargets,
} from "../lib/tdee";
import type { NutritionPrefs } from "@sergeant/nutrition-domain";

const TDEE_COPY = messages.nutritionTdee;

const TDEE_GOAL_LABELS: Record<NutritionGoalId, string> = {
  cutting: TDEE_COPY.goalCutting,
  maintenance: TDEE_COPY.goalMaintenance,
  bulking: TDEE_COPY.goalBulking,
};

export interface Preset {
  id: string;
  label: string;
  kcal: number;
  protein_g: number;
  fat_g: number;
  carbs_g: number;
}

export const PRESETS: readonly Preset[] = [
  {
    id: "cutting",
    label: "Схуднення",
    kcal: 1500,
    protein_g: 130,
    fat_g: 55,
    carbs_g: 130,
  },
  {
    id: "maintenance",
    label: "Підтримка",
    kcal: 2000,
    protein_g: 150,
    fat_g: 70,
    carbs_g: 200,
  },
  {
    id: "bulking",
    label: "Набір маси",
    kcal: 2700,
    protein_g: 200,
    fat_g: 90,
    carbs_g: 290,
  },
];

// Popup menu width + the gap kept from either screen edge (round-2 UI
// audit M6).
const MENU_WIDTH_PX = 240;
const MENU_EDGE_GAP_PX = 8;

/**
 * `left` offset (in px, relative to `trigger`'s own positioned ancestor —
 * both triggers below are wrapped in `position: relative`) that keeps a
 * `MENU_WIDTH_PX`-wide popup fully on-screen. Centers under the trigger by
 * default, then slides just enough to clear whichever screen edge the
 * trigger is closest to.
 *
 * `position: fixed` was tried first and rejected: this page renders inside
 * a route wrapper with its own `transform` (the `.page-enter` entry
 * animation — see `Sheet.tsx`'s identical note), which makes `fixed`
 * resolve against that ancestor's box instead of the real viewport. Live
 * 375px verification showed the menu landing off-screen either way until
 * this JS-computed `absolute` offset replaced both attempts.
 */
function clampedMenuLeftPx(trigger: HTMLElement): number {
  const rect = trigger.getBoundingClientRect();
  const centered = rect.width / 2 - MENU_WIDTH_PX / 2;
  const min = MENU_EDGE_GAP_PX - rect.left;
  const max = window.innerWidth - MENU_EDGE_GAP_PX - MENU_WIDTH_PX - rect.left;
  return Math.min(Math.max(centered, min), max);
}

/**
 * Reads `triggerRef.current` in a `useLayoutEffect`, not during render —
 * refs are an escape hatch for effects/handlers, and the project's
 * `react-hooks/refs` lint rule (React Compiler) correctly flags a direct
 * `ref.current` read in JSX as unsafe to rely on for the next render.
 */
function useClampedMenuLeft(
  open: boolean,
  triggerRef: RefObject<HTMLElement | null>,
): number {
  const [left, setLeft] = useState(0);
  useLayoutEffect(() => {
    if (!open || !triggerRef.current) return;
    setLeft(clampedMenuLeftPx(triggerRef.current));
  }, [open, triggerRef]);
  return left;
}

interface DailyPlanGoalSelectorsProps {
  prefs: NutritionPrefs;
  setPrefs: Dispatch<SetStateAction<NutritionPrefs>>;
  busy?: boolean | undefined;
  dayPlanBusy?: boolean | undefined;
}

/**
 * Header pair of dropdowns above the goal inputs row:
 * - «Розрахувати з профілю» — Mifflin-St Jeor TDEE з біометрії хаба.
 * - «Підказати з пресету» — три ручні пресети cutting/maintenance/bulking.
 *
 * Обидві випадайки закриваються по pointer-down поза собою (mousedown +
 * touchstart), щоб тап на інпут одразу віддавав фокус полю без блимання.
 */
export function DailyPlanGoalSelectors({
  prefs,
  setPrefs,
  busy,
  dayPlanBusy,
}: DailyPlanGoalSelectorsProps) {
  const [presetMenuOpen, setPresetMenuOpen] = useState(false);
  const presetMenuRef = useRef<HTMLDivElement | null>(null);
  const presetMenuLeft = useClampedMenuLeft(presetMenuOpen, presetMenuRef);

  const [tdeeMenuOpen, setTdeeMenuOpen] = useState(false);
  const tdeeMenuRef = useRef<HTMLDivElement | null>(null);
  const tdeeMenuLeft = useClampedMenuLeft(tdeeMenuOpen, tdeeMenuRef);
  const { biometrics } = useBiometrics();

  const tdeeTargets = useMemo<Record<
    NutritionGoalId,
    NutritionTargets
  > | null>(() => {
    const result: Partial<Record<NutritionGoalId, NutritionTargets>> = {};
    for (const goal of NUTRITION_GOALS) {
      const t = computeNutritionTargetsFromBiometrics(biometrics, goal);
      if (!t) return null;
      result[goal] = t;
    }
    return result as Record<NutritionGoalId, NutritionTargets>;
  }, [biometrics]);

  const activePreset = PRESETS.find(
    (p) =>
      p.kcal === prefs.dailyTargetKcal &&
      p.protein_g === prefs.dailyTargetProtein_g &&
      p.fat_g === prefs.dailyTargetFat_g &&
      p.carbs_g === prefs.dailyTargetCarbs_g,
  );

  const applyPreset = (preset: Preset) => {
    setPrefs((p) => ({
      ...p,
      dailyTargetKcal: preset.kcal,
      dailyTargetProtein_g: preset.protein_g,
      dailyTargetFat_g: preset.fat_g,
      dailyTargetCarbs_g: preset.carbs_g,
    }));
    setPresetMenuOpen(false);
  };

  const applyTdeeTargets = (targets: NutritionTargets) => {
    setPrefs((p) => ({
      ...p,
      dailyTargetKcal: targets.kcal,
      dailyTargetProtein_g: targets.protein_g,
      dailyTargetFat_g: targets.fat_g,
      dailyTargetCarbs_g: targets.carbs_g,
    }));
    setTdeeMenuOpen(false);
  };

  useEffect(() => {
    if (!presetMenuOpen) return;
    const onPointer = (e: MouseEvent | TouchEvent) => {
      const root = presetMenuRef.current;
      if (!root) return;
      const target = e.target as Node | null;
      if (target && root.contains(target)) return;
      setPresetMenuOpen(false);
    };
    document.addEventListener("mousedown", onPointer);
    document.addEventListener("touchstart", onPointer);
    return () => {
      document.removeEventListener("mousedown", onPointer);
      document.removeEventListener("touchstart", onPointer);
    };
  }, [presetMenuOpen]);

  useEffect(() => {
    if (!tdeeMenuOpen) return;
    const onPointer = (e: MouseEvent | TouchEvent) => {
      const root = tdeeMenuRef.current;
      if (!root) return;
      const target = e.target as Node | null;
      if (target && root.contains(target)) return;
      setTdeeMenuOpen(false);
    };
    document.addEventListener("mousedown", onPointer);
    document.addEventListener("touchstart", onPointer);
    return () => {
      document.removeEventListener("mousedown", onPointer);
      document.removeEventListener("touchstart", onPointer);
    };
  }, [tdeeMenuOpen]);

  return (
    <div className="flex items-center gap-1.5 flex-wrap justify-end">
      <div ref={tdeeMenuRef} className="relative">
        <button
          type="button"
          onClick={() => setTdeeMenuOpen((v) => !v)}
          disabled={busy || dayPlanBusy}
          aria-haspopup="menu"
          aria-expanded={tdeeMenuOpen}
          title={tdeeTargets ? undefined : TDEE_COPY.triggerHint}
          className={cn(
            "inline-flex items-center gap-1 rounded-xl border px-2.5 py-1 text-style-caption",
            "border-nutrition/50 text-nutrition-strong dark:text-nutrition",
            "hover:border-nutrition hover:bg-nutrition/10",
            "disabled:opacity-50 transition-colors",
            "focus:outline-none focus-visible:ring-2 focus-visible:ring-nutrition/60 focus-visible:ring-offset-2 focus-visible:ring-offset-panel",
          )}
        >
          {TDEE_COPY.triggerLabel}
          <span aria-hidden className="text-style-caption">
            ▾
          </span>
        </button>
        {tdeeMenuOpen && (
          <div
            role="menu"
            className="absolute top-full mt-1 z-10 rounded-xl border border-line bg-bg shadow-lg overflow-hidden"
            style={{ width: MENU_WIDTH_PX, left: tdeeMenuLeft }}
          >
            {tdeeTargets ? (
              NUTRITION_GOALS.map((goal) => {
                const targets = tdeeTargets[goal];
                return (
                  <button
                    key={goal}
                    type="button"
                    role="menuitem"
                    onClick={() => applyTdeeTargets(targets)}
                    disabled={busy || dayPlanBusy}
                    className={cn(
                      "w-full text-left px-3 py-2 border-b border-line last:border-0",
                      "hover:bg-panelHi disabled:opacity-50 transition-colors",
                      "focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-nutrition/60",
                    )}
                  >
                    <div className="text-style-label">
                      {TDEE_GOAL_LABELS[goal]}
                    </div>
                    <div className="text-style-caption text-subtle mt-0.5">
                      {targets.kcal} ккал · Б{targets.protein_g} · Ж
                      {targets.fat_g} · В{targets.carbs_g}
                    </div>
                  </button>
                );
              })
            ) : (
              <div className="px-3 py-2 text-xs text-subtle">
                <div className="text-text">{TDEE_COPY.triggerHint}</div>
                <Link
                  to={PROFILE_PATH}
                  className="mt-1 inline-block text-nutrition-strong dark:text-nutrition underline"
                  onClick={() => setTdeeMenuOpen(false)}
                >
                  {TDEE_COPY.profileLink}
                </Link>
              </div>
            )}
          </div>
        )}
      </div>
      <div ref={presetMenuRef} className="relative">
        <button
          type="button"
          onClick={() => setPresetMenuOpen((v) => !v)}
          disabled={busy || dayPlanBusy}
          aria-haspopup="menu"
          aria-expanded={presetMenuOpen}
          className={cn(
            "inline-flex items-center gap-1 rounded-xl border px-2.5 py-1 text-style-caption",
            "border-line/70 text-subtle hover:text-text hover:border-nutrition/50",
            "disabled:opacity-50 transition-colors",
            "focus:outline-none focus-visible:ring-2 focus-visible:ring-nutrition/60 focus-visible:ring-offset-2 focus-visible:ring-offset-panel",
          )}
        >
          {activePreset
            ? `Пресет: ${activePreset.label}`
            : "Підказати з пресету"}
          <span aria-hidden className="text-style-caption">
            ▾
          </span>
        </button>
        {presetMenuOpen && (
          <div
            role="menu"
            // Same fix as the TDEE menu above (round-2 UI audit M6) — this
            // menu previously had no width cap at all.
            className="absolute top-full mt-1 z-10 rounded-xl border border-line bg-bg shadow-lg overflow-hidden"
            style={{ width: MENU_WIDTH_PX, left: presetMenuLeft }}
          >
            {PRESETS.map((preset) => (
              <button
                key={preset.id}
                type="button"
                role="menuitem"
                onClick={() => applyPreset(preset)}
                disabled={busy || dayPlanBusy}
                className={cn(
                  "w-full text-left px-3 py-2 border-b border-line",
                  "hover:bg-panelHi disabled:opacity-50 transition-colors",
                  "focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-nutrition/60",
                  activePreset?.id === preset.id &&
                    "bg-nutrition/10 text-nutrition-strong dark:text-nutrition",
                )}
              >
                <div className="text-style-label">{preset.label}</div>
                <div className="text-style-caption text-subtle mt-0.5">
                  {preset.kcal} ккал · Б{preset.protein_g} · Ж{preset.fat_g} · В
                  {preset.carbs_g}
                </div>
              </button>
            ))}
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                setPrefs((p) => ({
                  ...p,
                  dailyTargetKcal: null,
                  dailyTargetProtein_g: null,
                  dailyTargetFat_g: null,
                  dailyTargetCarbs_g: null,
                }));
                setPresetMenuOpen(false);
              }}
              disabled={busy || dayPlanBusy}
              className={cn(
                "w-full text-left px-3 py-2",
                "hover:bg-panelHi disabled:opacity-50 transition-colors",
                "text-muted hover:text-danger",
                "focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-nutrition/60",
              )}
            >
              <div className="text-style-label">Скинути вибір</div>
              <div className="text-style-caption text-subtle mt-0.5">
                Очистити всі цілі
              </div>
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
