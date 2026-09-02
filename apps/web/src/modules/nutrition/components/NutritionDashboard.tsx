/**
 * Last validated: 2026-09-01
 * Status: Active
 */
import { useMemo, useEffect, useRef } from "react";
import { InsightCard } from "@shared/components/ui/InsightCard";
import { emitHubBus } from "@shared/lib/modules/hubBus";
import { useAskAiQuotaExhausted } from "@shared/lib/insights/useAskAiQuota";
import { useProteinLowInsight } from "../hooks/useProteinLowInsight";
import { useStreakSevenDaysInsight } from "../hooks/useStreakSevenDaysInsight";
import { Card } from "@shared/components/ui/Card";
import { MealStrip, type MealStripSegment } from "./MealStrip";
import { messages } from "@shared/i18n/uk";
import { cn } from "@shared/lib/ui/cn";
import { pluralUa } from "@sergeant/shared";
import {
  MEAL_META,
  MEAL_ORDER,
  WEEK_KCAL_OVER_TOLERANCE,
  deviceWeekStartKey,
  todayISODate,
  type NutritionLog,
  type NutritionPrefs,
} from "@sergeant/nutrition-domain";
import {
  ESTIMATED_KCAL_SHARE_THRESHOLD,
  addDaysISODate,
  getDayMacros,
  getDaySummary,
  getMacrosForDateRange,
} from "../lib/nutritionStorage";
import { mealTypeKcalForDay } from "../lib/nutritionStats";
import { nextMealLabel } from "../lib/nextMealLabel";
import { WaterTrackerCard } from "./WaterTrackerCard";
import { WeekKcalCard } from "./WeekKcalCard";
import { useToast } from "@shared/hooks/useToast";
import { safeReadStringLS, safeWriteLS } from "@shared/lib/storage/storage";

// ADR-0078: "сьогодні" на дашборді (кільце макросів, isToday-підсвітка в
// тижневому графіку) і межі тижневого графіка — обидва день ПРИСТРОЮ, не
// Kyiv, бо журнал, з якого читаються ці дані, сам пишеться під ключем дня
// пристрою (useNutritionLog). unification-modules.md #1.18.
function todayISO(): string {
  return todayISODate();
}

interface NutritionDashboardProps {
  log: NutritionLog;
  prefs: NutritionPrefs;
  onGoToLog?: (() => void) | undefined;
  onGoToDailyPlan?: (() => void) | undefined;
  onAddMeal?: (() => void) | undefined;
}

export function NutritionDashboard({
  log,
  prefs,
  onGoToLog,
  onGoToDailyPlan,
  onAddMeal,
}: NutritionDashboardProps) {
  const today = todayISO();

  const macros = useMemo(() => getDayMacros(log, today), [log, today]);
  const summary = useMemo(() => getDaySummary(log, today), [log, today]);
  // Calendar ISO week (Mon→Sun, device-local), not a rolling-7 window —
  // keeps the weekly chart consistent with Routine's Monday-first week
  // (domain invariant: week starts Monday). `getMacrosForDateRange` fills
  // oldest→newest ending at the given day, so anchoring `endIso` on Sunday
  // yields Mon…Sun in order.
  const weekRows = useMemo(() => {
    const weekStart = deviceWeekStartKey();
    const weekEnd = addDaysISODate(weekStart, 6);
    return getMacrosForDateRange(log, weekEnd, 7);
  }, [log]);

  // Ціль на кожен день тижня. Поки джерело — `prefs`, тож значення однакові
  // й графік виглядає рівно як раніше; сходинка зʼявиться на стадії 3, коли
  // сюди приїде `resolveEffectiveGoalForRange` (спека
  // `nutrition-goal-journal-cutover.md`, PR-3). Форма вже правильна, тому
  // той PR міняє лише цей `useMemo`, а не компонент.
  const weekGoals = useMemo(
    () => weekRows.map(() => prefs.dailyTargetKcal || null),
    [weekRows, prefs.dailyTargetKcal],
  );

  const hasGoal = (prefs.dailyTargetKcal || 0) > 0;

  // ponytail: honesty threshold for "incomplete day" (canon §5.2 — a
  // partial log must not read as a deficit). The canon's own example is
  // "1 of 4 meals", so <3 logged meals covers both an empty day and a
  // one-meal day without inventing a per-user "expected meal count"
  // setting; 3+ meals reads as a deliberately completed log.
  const isIncompleteDay = summary.mealCount < 3;

  // Nutrition audit E-5 / founder decision 2026-08-04: share is calorie-
  // weighted (see `getDaySummary`), threshold is strictly ">50%" — exactly
  // 50% shows nothing. Distinct from `isIncompleteDay`: a day can have
  // plenty of meals (dashed track off) yet still be mostly photo-guessed
  // (badge on), so the two signals read independently rather than fighting
  // for the same visual.
  const isMostlyEstimated =
    summary.estimatedKcalShare > ESTIMATED_KCAL_SHARE_THRESHOLD;

  const kcalConsumed = Math.round(macros.kcal || 0);
  const kcalGoal = prefs.dailyTargetKcal || 0;

  // Hero стрічка дня (спека nutrition-hero-day-strip.md) — чотири сегменти
  // за MEAL_ORDER, не за фактичним порядком запису.
  const kcalByType = useMemo(
    () => mealTypeKcalForDay(log, today),
    [log, today],
  );
  const segments: MealStripSegment[] = useMemo(
    () =>
      MEAL_ORDER.map((type) => ({
        type,
        label: MEAL_META[type].label,
        kcal: kcalByType[type],
      })),
    [kcalByType],
  );
  const remainingLabel = useMemo(() => nextMealLabel(kcalByType), [kcalByType]);

  // W4 — fire a success toast once per calendar day when consumed kcal enters
  // the 95–105% window of the daily goal. Dedupe key is stored via the typed
  // storage wrapper so it survives page reload and does NOT block any save.
  const toast = useToast();
  const toastFiredRef = useRef(false);
  const LS_KEY = "nutrition:kcal-goal-toast-date";
  useEffect(() => {
    if (!hasGoal || kcalGoal <= 0) return;
    const ratio = kcalConsumed / kcalGoal;
    if (
      ratio < 2 - WEEK_KCAL_OVER_TOLERANCE ||
      ratio > WEEK_KCAL_OVER_TOLERANCE
    )
      return;
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
  const activeInsights = [streakInsight, proteinLowInsight]
    .filter(Boolean)
    .slice(0, 2) as NonNullable<typeof proteinLowInsight>[];
  const askAiDisabled = useAskAiQuotaExhausted();

  return (
    <div className="grid min-w-0 gap-3" data-testid="nutrition-dashboard">
      {/* ── Hero card ── */}
      {/* `min-w-0`: grid-item за дефолтом має `min-width:auto`, тобто його
          мінімальна ширина = min-content вмісту. Досить одного широкого
          нерозривного блоку всередині (рядок quick-add чіпів), щоб трек
          колонки роздувся і разом із ним — УСІ картки цього гріда. */}
      <Card
        prominence="hero"
        module="nutrition"
        edge="rule"
        padding="none"
        className="min-w-0"
      >
        <div className="p-4">
          <div className="flex items-center justify-between mb-3">
            <div>
              <div className="text-style-label text-hero-ink">Сьогодні</div>
              <div className="text-style-caption text-hero-ink">
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
              aria-label="Додати прийом їжі"
              className={cn(
                "text-style-label shrink-0 px-4 h-11 min-w-[44px] rounded-xl",
                "bg-nutrition-strong text-white hover:bg-nutrition-hover transition-colors",
              )}
            >
              + Додати
            </button>
          </div>

          <div className="flex flex-col gap-2">
            {hasGoal && isMostlyEstimated && (
              <p className="text-style-caption text-hero-ink text-center text-pretty">
                <span aria-hidden="true">
                  {messages.nutrition.estimatedBadge.label}{" "}
                </span>
                {messages.nutrition.estimatedBadge.caption}
              </p>
            )}
            <MealStrip
              segments={segments}
              goalKcal={hasGoal ? kcalGoal : null}
              remainingLabel={remainingLabel}
              macros={[
                {
                  label: "Білки",
                  consumed: protein.consumed,
                  goal: protein.goal,
                  unit: "г",
                },
                {
                  label: "Жири",
                  consumed: fat.consumed,
                  goal: fat.goal,
                  unit: "г",
                },
                {
                  label: "Вугл.",
                  consumed: carbs.consumed,
                  goal: carbs.goal,
                  unit: "г",
                },
              ]}
              onSetGoal={onGoToDailyPlan ?? onGoToLog}
              incompleteNote={
                hasGoal && isIncompleteDay
                  ? `Записано ${summary.mealCount} із 4`
                  : undefined
              }
            />
          </div>
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
          onAskAi={() =>
            emitHubBus("openChat", {
              message: insight.askAiPrompt,
              autoSend: false,
            })
          }
          askAiDisabled={askAiDisabled}
          className="mx-0"
        />
      ))}

      <WeekKcalCard
        rows={weekRows}
        goalsByDay={weekGoals}
        todayIso={today}
        onGoToLog={onGoToLog}
      />

      <WaterTrackerCard goalMl={prefs.waterGoalMl ?? 2000} />
    </div>
  );
}
