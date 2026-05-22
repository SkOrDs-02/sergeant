/**
 * Last validated: 2026-05-19
 * Status: Active
 */
import { useMemo, useEffect, useRef } from "react";
import { InsightCard } from "@shared/components/ui/InsightCard";
import { useProteinLowInsight } from "../hooks/useProteinLowInsight";
import { useStreakSevenDaysInsight } from "../hooks/useStreakSevenDaysInsight";
import { Card } from "@shared/components/ui/Card";
import { SectionHeading } from "@shared/components/ui/SectionHeading";
import { ProgressRing } from "@shared/components/ui/ProgressRing";
import { MacroBarRow } from "@shared/components/ui/MacroBarRow";
import { cn } from "@shared/lib/ui/cn";
import { pluralUa } from "@sergeant/shared";
import type { NutritionLog, NutritionPrefs } from "@sergeant/nutrition-domain";
import {
  getDayMacros,
  getDaySummary,
  getMacrosForDateRange,
  toLocalISODate,
  type MacrosRow,
} from "../lib/nutritionStorage";
import { WaterTrackerCard } from "./WaterTrackerCard";
import { useToast } from "@shared/hooks/useToast";
import { safeReadStringLS, safeWriteLS } from "@shared/lib/storage/storage";

type WeekRow = MacrosRow;

function todayISO(): string {
  return toLocalISODate(new Date());
}

/**
 * Outcome-framed sub-label for macro stats. Replaces neutral "X / Y г"
 * with gap- or surplus-aware text on the Nutrition hero. Returns only
 * the right-hand outcome portion — the macro name is rendered separately
 * by MacroBarRow's `label` slot. Bands mirror the Phase 4.2 onboarding
 * outcome-copy heuristic but stay Nutrition-local.
 *
 * Bands:
 *  - hit window: consumed ∈ [goal, goal*1.05]  → "ціль виконано"
 *  - overshoot:  consumed > goal*1.05          → "+N г понад ціль"
 *  - on-track:   consumed >= goal*0.6          → "N г запас"
 *  - lagging:    else                           → "N г до цілі"
 *
 * Returns `undefined` when goal is not set so the primitive falls back
 * to its default "value / max" rendering.
 */
function formatMacroOutcome(
  consumed: number,
  goal: number,
): string | undefined {
  if (goal <= 0) return undefined;
  if (consumed >= goal && consumed <= goal * 1.05) {
    return "ціль виконано";
  }
  if (consumed > goal * 1.05) {
    return `+${Math.round(consumed - goal)} г понад ціль`;
  }
  const gap = goal - consumed;
  if (consumed >= goal * 0.6) {
    return `${Math.round(gap)} г запас`;
  }
  return `${Math.round(gap)} г до цілі`;
}

function MiniBar({
  rows,
  targetKcal,
}: {
  rows: WeekRow[];
  targetKcal: number;
}) {
  const max = Math.max(targetKcal || 1, ...rows.map((r) => r.kcal || 0));
  const dayLabels = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Нд"];
  return (
    <div className="flex items-end gap-1 h-16">
      {rows.map((r) => {
        const h = max > 0 ? Math.max(2, (r.kcal / max) * 100) : 2;
        const isToday = r.date === todayISO();
        const dayOfWeek = new Date(r.date + "T00:00:00").getDay();
        const label = dayLabels[(dayOfWeek + 6) % 7];
        return (
          <div
            key={r.date}
            className="flex-1 flex flex-col items-center gap-0.5"
          >
            <div
              className="w-full flex justify-center"
              style={{ height: "48px", alignItems: "flex-end" }}
            >
              <div
                className={cn(
                  "w-full max-w-[18px] rounded-t-md transition-[height,background-color] duration-300",
                  isToday ? "bg-nutrition" : "bg-nutrition/30",
                )}
                style={{ height: `${h}%`, minHeight: "3px" }}
              />
            </div>
            <span
              className={cn(
                "text-style-caption leading-none",
                isToday ? "text-text font-bold" : "text-muted",
              )}
            >
              {label}
            </span>
          </div>
        );
      })}
    </div>
  );
}

interface NutritionDashboardProps {
  log: NutritionLog;
  prefs: NutritionPrefs;
  onGoToLog?: () => void;
  onGoToDailyPlan?: () => void;
  onAddMeal?: () => void;
  onFetchDayHint?: () => void | Promise<void>;
  dayHintText?: string;
  dayHintBusy?: boolean;
}

export function NutritionDashboard({
  log,
  prefs,
  onGoToLog,
  onGoToDailyPlan,
  onAddMeal,
  onFetchDayHint,
  dayHintText,
  dayHintBusy,
}: NutritionDashboardProps) {
  const today = todayISO();

  const macros = useMemo(() => getDayMacros(log, today), [log, today]);
  const summary = useMemo(() => getDaySummary(log, today), [log, today]);
  const weekRows = useMemo(
    () => getMacrosForDateRange(log, today, 7),
    [log, today],
  );

  const hasGoal = (prefs.dailyTargetKcal || 0) > 0;

  const kcalConsumed = Math.round(macros.kcal || 0);
  const kcalGoal = prefs.dailyTargetKcal || 0;

  // W4 — fire a success toast once per calendar day when consumed kcal enters
  // the 95–105% window of the daily goal. Dedupe key is stored via the typed
  // storage wrapper so it survives page reload and does NOT block any save.
  const toast = useToast();
  const toastFiredRef = useRef(false);
  const LS_KEY = "nutrition:kcal-goal-toast-date";
  useEffect(() => {
    if (!hasGoal || kcalGoal <= 0) return;
    const ratio = kcalConsumed / kcalGoal;
    if (ratio < 0.95 || ratio > 1.05) return;
    if (toastFiredRef.current) return;

    // Persist per-day dedup so it survives remounts within the same day.
    const lastFiredDate = safeReadStringLS(LS_KEY);
    if (lastFiredDate === today) return;

    toastFiredRef.current = true;
    safeWriteLS(LS_KEY, today);
    toast.success("Денну норму виконано");
  }, [kcalConsumed, kcalGoal, hasGoal, today, toast]);

  const protein = {
    consumed: Math.round(macros.protein_g || 0),
    goal: prefs.dailyTargetProtein_g || 0,
  };
  const fat = {
    consumed: Math.round(macros.fat_g || 0),
    goal: prefs.dailyTargetFat_g || 0,
  };
  const carbs = {
    consumed: Math.round(macros.carbs_g || 0),
    goal: prefs.dailyTargetCarbs_g || 0,
  };

  // Phase 5d — nutrition insight triggers.
  // Both hooks return null when their condition is not met; InsightCard
  // additionally checks the dismissal LS key so dismissed cards stay gone.
  const proteinLowInsight = useProteinLowInsight(log, prefs);
  const streakInsight = useStreakSevenDaysInsight(log, prefs);

  // Cap at 2 simultaneous insights. Priority: streak > protein-low so the
  // positive signal surfaces first when both conditions fire together.
  const activeInsights = [streakInsight, proteinLowInsight].filter(
    Boolean,
  ).slice(0, 2) as NonNullable<typeof proteinLowInsight>[];

  return (
    <div className="grid gap-3">
      {/* ── Hero card ── */}
      <Card prominence="hero" module="nutrition" radius="r-2xl" padding="none">
        <div className="p-4">
          <div className="flex items-center justify-between mb-3">
            <div>
              <div className="text-style-label text-text">Сьогодні</div>
              <div className="text-xs text-subtle">
                {summary.mealCount}{" "}
                {pluralUa(summary.mealCount, {
                  one: "прийом",
                  few: "прийоми",
                  many: "прийомів",
                })}{" "}
                їжі
              </div>
            </div>
            <button
              type="button"
              onClick={onAddMeal}
              className={cn(
                "text-style-label shrink-0 px-4 h-11 min-w-[44px] rounded-xl",
                "bg-nutrition-strong text-white hover:bg-nutrition-hover transition-colors",
              )}
            >
              + Додати
            </button>
          </div>

          {hasGoal ? (
            <div className="flex flex-col gap-4">
              <div className="flex items-center justify-center">
                <ProgressRing
                  variant="nutrition"
                  value={kcalConsumed}
                  max={kcalGoal}
                  size="lg"
                  aria-label={`Калорії: ${kcalConsumed} з ${kcalGoal}`}
                  label={
                    <span className="flex flex-col items-center leading-none gap-0.5">
                      <span className="text-style-title text-text tabular-nums">
                        {kcalConsumed}
                      </span>
                      <span className="text-style-caption text-subtle">
                        / {kcalGoal} ккал
                      </span>
                    </span>
                  }
                />
              </div>
              <MacroBarRow
                macros={[
                  {
                    label: "Білки",
                    value: protein.consumed,
                    max: protein.goal,
                    accent: "nutrition",
                    unit: "г",
                    valueDisplay: formatMacroOutcome(
                      protein.consumed,
                      protein.goal,
                    ),
                  },
                  {
                    label: "Жири",
                    value: fat.consumed,
                    max: fat.goal,
                    accent: "warning",
                    unit: "г",
                    valueDisplay: formatMacroOutcome(
                      fat.consumed,
                      fat.goal,
                    ),
                  },
                  {
                    label: "Вугл.",
                    value: carbs.consumed,
                    max: carbs.goal,
                    accent: "routine",
                    unit: "г",
                    valueDisplay: formatMacroOutcome(
                      carbs.consumed,
                      carbs.goal,
                    ),
                  },
                ]}
              />
            </div>
          ) : (
            <div className="flex flex-col items-center gap-3 py-2">
              <SectionHeading as="div" size="xs" variant="nutrition">
                Встанови ціль калорій щоб бачити прогрес дня
              </SectionHeading>
              <button
                type="button"
                onClick={onGoToDailyPlan ?? onGoToLog}
                className="text-style-caption min-h-[44px] min-w-[44px] px-4 text-nutrition-strong dark:text-nutrition hover:underline text-center"
              >
                Налаштувати денні цілі КБЖВ →
              </button>
            </div>
          )}
        </div>
      </Card>

      {/* ── Insight cards (Phase 5d) — below hero, above weekly mini-bar ── */}
      {activeInsights.map((insight) => (
        <InsightCard
          key={insight.id}
          id={insight.id}
          title={insight.title}
          subtitle={insight.subtitle}
          onActivate={() => {
            if (insight.action.type === "navigate") {
              // Map insight paths to in-module navigation callbacks.
              if (insight.action.path === "/nutrition/log") {
                onGoToLog?.();
              } else if (insight.action.path === "/nutrition/menu") {
                onGoToDailyPlan?.();
              }
            }
          }}
          className="mx-0"
        />
      ))}

      <Card className="p-4">
        <div className="flex items-center justify-between mb-2">
          <div className="text-style-label text-text">Тиждень · ккал</div>
          <button
            type="button"
            onClick={onGoToLog}
            className="text-style-caption text-nutrition-strong dark:text-nutrition hover:underline"
          >
            Журнал →
          </button>
        </div>
        <MiniBar rows={weekRows} targetKcal={prefs.dailyTargetKcal || 0} />
      </Card>

      <WaterTrackerCard goalMl={prefs.waterGoalMl ?? 2000} />

      {typeof onFetchDayHint === "function" && (
        <Card className="p-4">
          <div className="flex items-center justify-between gap-3 mb-2">
            <div className="text-style-label text-text">Підказка AI</div>
            <button
              type="button"
              onClick={onFetchDayHint}
              disabled={dayHintBusy}
              className="shrink-0 px-3 h-8 rounded-xl text-style-caption bg-nutrition/10 text-nutrition-strong dark:text-nutrition border border-nutrition/30 hover:bg-nutrition/20 transition-colors disabled:opacity-50"
            >
              {dayHintBusy ? "…" : "Отримати"}
            </button>
          </div>
          {dayHintText ? (
            <p className="text-sm text-text leading-snug">{dayHintText}</p>
          ) : (
            <p className="text-xs text-subtle">
              Аналіз харчування за сьогодні від AI
            </p>
          )}
        </Card>
      )}
    </div>
  );
}
