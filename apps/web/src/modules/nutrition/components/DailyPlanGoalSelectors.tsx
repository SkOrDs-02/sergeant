/**
 * Last validated: 2026-08-03
 * Status: Active
 */
import { useLayoutEffect, useMemo, useRef, useState } from "react";
import { Measure } from "@shared/components/ui/Measure";
import { Icon } from "@shared/components/ui/Icon";
import type { Dispatch, RefObject, SetStateAction } from "react";
import { Link } from "react-router-dom";
import { cn } from "@shared/lib/ui/cn";
import { useToast } from "@shared/hooks/useToast";
import { useOutsideClick } from "@shared/hooks/useOutsideClick";
import { messages } from "@shared/i18n/uk";
import { PROFILE_PATH } from "../../../core/app/appPaths";
import { useBiometrics } from "../../../core/profile/useBiometrics";
import { useLatestBodyWeightKg } from "../../../core/profile/useLatestBodyWeight";
import { useTodayWorkoutKcal } from "../../../core/profile/useTodayWorkoutKcal";
import {
  NUTRITION_GOALS,
  computeNutritionTargetsFromBiometrics,
  resolveEffectiveWeightKg,
  type NutritionGoalId,
  type NutritionTargets,
} from "../lib/tdee";
import {
  missingBiometricsFieldsForTdee,
  type MissingBiometricsField,
} from "../../../core/profile/biometrics";
import type { NutritionPrefs } from "@sergeant/nutrition-domain";

const TDEE_COPY = messages.nutritionTdee;

const TDEE_GOAL_LABELS: Record<NutritionGoalId, string> = {
  cutting: TDEE_COPY.goalCutting,
  maintenance: TDEE_COPY.goalMaintenance,
  bulking: TDEE_COPY.goalBulking,
};

const MISSING_FIELD_LABEL: Record<MissingBiometricsField, string> = {
  heightCm: TDEE_COPY.missingHeight,
  birthDate: TDEE_COPY.missingBirthDate,
  sex: TDEE_COPY.missingSex,
  activityLevel: TDEE_COPY.missingActivity,
  weightKg: TDEE_COPY.missingWeight,
};

// Popup menu width + the gap kept from either screen edge (round-2 UI
// audit M6).
const MENU_WIDTH_PX = 240;
const MENU_EDGE_GAP_PX = 8;

/**
 * `left` offset (in px, relative to `trigger`'s own positioned ancestor —
 * the trigger below is wrapped in `position: relative`) that keeps a
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
 * Single "Підказати з пресету" dropdown above the goal inputs row.
 *
 * Presets are personalized whenever biometrics (weight/height/age/sex/
 * activity — hub profile + fizruk weight-of-record) are complete: each of
 * the three goals (схуднення/підтримка/набір) shows a Mifflin-St Jeor TDEE
 * target computed from those numbers, annotated as "розраховано з
 * профілю". When biometrics are incomplete, the menu instead prompts the
 * user to fill in their profile — there is no separate hardcoded fallback
 * preset shown, since a fixed 1500/2000/2700 kcal ladder can't be honest
 * about whether it fits this particular person.
 *
 * Previously this rendered two separate dropdowns — a "Розрахувати з
 * профілю" TDEE calculator and a "Підказати з пресету" static ladder — and
 * users could easily miss the personalized one because both were tucked
 * behind similarly-worded triggers. Merging them into one control removes
 * that ambiguity.
 */
export function DailyPlanGoalSelectors({
  prefs,
  setPrefs,
  busy,
  dayPlanBusy,
}: DailyPlanGoalSelectorsProps) {
  const toast = useToast();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const menuLeft = useClampedMenuLeft(menuOpen, menuRef);

  const { biometrics } = useBiometrics();
  // W1-WEIGHT-SOT стадія 1: вага для TDEE приходить із fizruk-SoT
  // (union daily_log + measurements). `biometrics.weightKg` лишається
  // фолбеком, щоб юзер без модуля fizruk нічого не втратив.
  const fizrukWeightKg = useLatestBodyWeightKg();
  // Має значення лише при `countWorkoutsInGoal: true`; при вимкненому
  // тумблері `computeTdee` цього доданка не бачить узагалі.
  const workoutKcal = useTodayWorkoutKcal();

  const tdeeTargets = useMemo<Record<
    NutritionGoalId,
    NutritionTargets
  > | null>(() => {
    const result: Partial<Record<NutritionGoalId, NutritionTargets>> = {};
    for (const goal of NUTRITION_GOALS) {
      const t = computeNutritionTargetsFromBiometrics(
        biometrics,
        goal,
        undefined,
        fizrukWeightKg,
        workoutKcal,
      );
      if (!t) return null;
      result[goal] = t;
    }
    return result as Record<NutritionGoalId, NutritionTargets>;
  }, [biometrics, fizrukWeightKg, workoutKcal]);

  // Той самий fizruk-фолбек, що й у computeNutritionTargetsFromBiometrics
  // вище, — інакше юзер із реальним fizruk-зважуванням, але порожнім
  // полем ваги в Профілі, побачив би «вага» серед бракуючих, хоча вона
  // фактично вже враховується.
  const missingFields = useMemo(
    () =>
      tdeeTargets
        ? []
        : missingBiometricsFieldsForTdee(
            biometrics,
            resolveEffectiveWeightKg(biometrics, fizrukWeightKg),
          ),
    [tdeeTargets, biometrics, fizrukWeightKg],
  );
  const missingHint =
    missingFields.length > 0
      ? `${TDEE_COPY.missingPrefix} ${missingFields
          .map((field) => MISSING_FIELD_LABEL[field])
          .join(", ")}.`
      : TDEE_COPY.triggerHint;

  const activeGoal = tdeeTargets
    ? NUTRITION_GOALS.find((goal) => {
        const t = tdeeTargets[goal];
        return (
          t.kcal === prefs.dailyTargetKcal &&
          t.protein_g === prefs.dailyTargetProtein_g &&
          t.fat_g === prefs.dailyTargetFat_g &&
          t.carbs_g === prefs.dailyTargetCarbs_g
        );
      })
    : undefined;

  const applyTdeeTargets = (targets: NutritionTargets) => {
    setPrefs((p) => ({
      ...p,
      dailyTargetKcal: targets.kcal,
      dailyTargetProtein_g: targets.protein_g,
      dailyTargetFat_g: targets.fat_g,
      dailyTargetCarbs_g: targets.carbs_g,
    }));
    setMenuOpen(false);
    toast.success(TDEE_COPY.appliedToast);
  };

  // touchstart додатково до mousedown — історична поведінка цього меню;
  // closeOnNullRef: false відтворює старий ранній вихід при відсутньому ref.
  useOutsideClick(menuRef, () => setMenuOpen(false), {
    enabled: menuOpen,
    events: ["mousedown", "touchstart"],
    closeOnNullRef: false,
  });

  return (
    <div className="flex items-center gap-1.5 flex-wrap justify-end">
      <div ref={menuRef} className="relative">
        <button
          type="button"
          onClick={() => setMenuOpen((v) => !v)}
          disabled={busy || dayPlanBusy}
          aria-haspopup="menu"
          aria-expanded={menuOpen}
          title={tdeeTargets ? undefined : missingHint}
          className={cn(
            "inline-flex items-center gap-1 rounded-xl border px-2.5 py-1 text-style-caption",
            "border-nutrition/50 text-nutrition-strong dark:text-nutrition",
            "hover:border-nutrition hover:bg-nutrition/10",
            "disabled:opacity-50 transition-colors",
            "focus:outline-none focus-visible:ring-2 focus-visible:ring-nutrition/60 focus-visible:ring-offset-2 focus-visible:ring-offset-panel",
          )}
        >
          {activeGoal
            ? `Пресет: ${TDEE_GOAL_LABELS[activeGoal]}`
            : "Підказати з пресету"}
          <span
            aria-hidden
            className={cn(
              "inline-flex shrink-0 transition-transform",
              menuOpen ? "rotate-180" : "rotate-0",
            )}
          >
            <Icon name="chevron-down" size="sm" />
          </span>
        </button>
        {menuOpen && (
          <div
            role="menu"
            className="absolute top-full mt-1 z-10 rounded-xl border border-line bg-bg shadow-lg overflow-hidden"
            style={{ width: MENU_WIDTH_PX, left: menuLeft }}
          >
            {tdeeTargets ? (
              <>
                {NUTRITION_GOALS.map((goal) => {
                  const targets = tdeeTargets[goal];
                  return (
                    <button
                      key={goal}
                      type="button"
                      role="menuitem"
                      onClick={() => applyTdeeTargets(targets)}
                      disabled={busy || dayPlanBusy}
                      className={cn(
                        "w-full text-left px-3 py-2 border-b border-line",
                        "hover:bg-panelHi disabled:opacity-50 transition-colors",
                        "focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-nutrition/60",
                        activeGoal === goal &&
                          "bg-nutrition/10 text-nutrition-strong dark:text-nutrition",
                      )}
                    >
                      <div className="text-style-label">
                        {TDEE_GOAL_LABELS[goal]}
                      </div>
                      <div className="text-style-caption text-subtle mt-0.5">
                        <Measure value={targets.kcal} unit="ккал" /> · Б{" "}
                        <Measure value={targets.protein_g} unit="г" /> · Ж{" "}
                        <Measure value={targets.fat_g} unit="г" /> · В{" "}
                        <Measure value={targets.carbs_g} unit="г" />
                      </div>
                      <div className="text-style-caption text-nutrition-strong dark:text-nutrition mt-0.5">
                        розраховано з профілю
                      </div>
                    </button>
                  );
                })}
              </>
            ) : (
              <div className="px-3 py-2 text-style-caption text-subtle border-b border-line">
                <div className="text-text">{missingHint}</div>
                <Link
                  to={PROFILE_PATH}
                  // Тач-таргет: сам текст має 16px висоти, чого мало для
                  // пальця (WCAG 2.5.5). `inline-flex` + px-флор під coarse
                  // pointer — той самий прийом, що в `Button`/`Input`
                  // (браузерний аудит 2026-08-26: було 108×16).
                  className="mt-1 inline-flex items-center pointer-coarse:min-h-[44px] text-nutrition-strong dark:text-nutrition underline"
                  onClick={() => setMenuOpen(false)}
                >
                  {TDEE_COPY.profileLink}
                </Link>
              </div>
            )}
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
                setMenuOpen(false);
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
