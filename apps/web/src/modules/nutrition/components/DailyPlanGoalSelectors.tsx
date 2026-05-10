import { useEffect, useMemo, useRef, useState } from "react";
import type { Dispatch, SetStateAction } from "react";
import { cn } from "@shared/lib/ui/cn";
import { messages } from "@shared/i18n/uk";
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

interface DailyPlanGoalSelectorsProps {
  prefs: NutritionPrefs;
  setPrefs: Dispatch<SetStateAction<NutritionPrefs>>;
  busy?: boolean;
  dayPlanBusy?: boolean;
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

  const [tdeeMenuOpen, setTdeeMenuOpen] = useState(false);
  const tdeeMenuRef = useRef<HTMLDivElement | null>(null);
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
            "inline-flex items-center gap-1 rounded-xl border px-2.5 py-1 text-xs font-semibold",
            "border-nutrition/50 text-nutrition-strong dark:text-nutrition",
            "hover:border-nutrition hover:bg-nutrition/10",
            "disabled:opacity-50 transition-colors",
          )}
        >
          {TDEE_COPY.triggerLabel}
          <span aria-hidden className="text-2xs">
            ▾
          </span>
        </button>
        {tdeeMenuOpen && (
          <div
            role="menu"
            className={cn(
              "absolute right-0 top-full mt-1 z-10 min-w-[240px]",
              "rounded-xl border border-line bg-bg shadow-lg overflow-hidden",
            )}
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
                    )}
                  >
                    <div className="text-style-label">
                      {TDEE_GOAL_LABELS[goal]}
                    </div>
                    <div className="text-2xs text-subtle mt-0.5">
                      {targets.kcal} ккал · Б{targets.protein_g} · Ж
                      {targets.fat_g} · В{targets.carbs_g}
                    </div>
                  </button>
                );
              })
            ) : (
              <div className="px-3 py-2 text-xs text-subtle">
                <div className="text-text">{TDEE_COPY.triggerHint}</div>
                <a
                  href="#/profile"
                  className="mt-1 inline-block text-nutrition-strong dark:text-nutrition underline"
                  onClick={() => setTdeeMenuOpen(false)}
                >
                  {TDEE_COPY.profileLink}
                </a>
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
            "inline-flex items-center gap-1 rounded-xl border px-2.5 py-1 text-xs font-semibold",
            "border-line/70 text-subtle hover:text-text hover:border-nutrition/50",
            "disabled:opacity-50 transition-colors",
          )}
        >
          {activePreset
            ? `Пресет: ${activePreset.label}`
            : "Підказати з пресету"}
          <span aria-hidden className="text-2xs">
            ▾
          </span>
        </button>
        {presetMenuOpen && (
          <div
            role="menu"
            className={cn(
              "absolute right-0 top-full mt-1 z-10 min-w-[200px]",
              "rounded-xl border border-line bg-bg shadow-lg overflow-hidden",
            )}
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
                  activePreset?.id === preset.id &&
                    "bg-nutrition/10 text-nutrition-strong dark:text-nutrition",
                )}
              >
                <div className="text-style-label">{preset.label}</div>
                <div className="text-2xs text-subtle mt-0.5">
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
              )}
            >
              <div className="text-style-label">Скинути вибір</div>
              <div className="text-2xs text-subtle mt-0.5">
                Очистити всі цілі
              </div>
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
