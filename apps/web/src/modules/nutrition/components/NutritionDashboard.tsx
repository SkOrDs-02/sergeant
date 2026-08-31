/**
 * Last validated: 2026-05-19
 * Status: Active
 */
import { useMemo, useEffect, useRef } from "react";
import { InsightCard } from "@shared/components/ui/InsightCard";
import { emitHubBus } from "@shared/lib/modules/hubBus";
import { useAskAiQuotaExhausted } from "@shared/lib/insights/useAskAiQuota";
import { Measure } from "@shared/components/ui/Measure";
import { useProteinLowInsight } from "../hooks/useProteinLowInsight";
import { useStreakSevenDaysInsight } from "../hooks/useStreakSevenDaysInsight";
import { Card } from "@shared/components/ui/Card";
import { ProgressRing } from "@shared/components/ui/ProgressRing";
import { MacroRings } from "./MacroRings";
import { messages } from "@shared/i18n/uk";
import { cn } from "@shared/lib/ui/cn";
import { pluralUa } from "@sergeant/shared";
import {
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
import { WaterTrackerCard } from "./WaterTrackerCard";
import { WeekKcalCard } from "./WeekKcalCard";
import { useToast } from "@shared/hooks/useToast";
import { safeReadStringLS, safeWriteLS } from "@shared/lib/storage/storage";
import { getKyivWeekStartKey } from "@shared/lib/time/kyivTime";

// ADR-0078: "сьогодні" на дашборді (кільце макросів, isToday-підсвітка в
// тижневому графіку) — день ПРИСТРОЮ, не Kyiv, бо журнал, з якого читаються
// ці дані, тепер сам пишеться під ключем дня пристрою (useNutritionLog).
//
// НЕ ЧІПАЛОСЬ навмисно: `getKyivWeekStartKey()` нижче (вікно тижневого
// графіка) лишається Kyiv-анкорним. Це залишкова неузгодженість — див. звіт
// агента / "потребує рішення власника".
function todayISO(): string {
  return todayISODate();
}

/**
 * Outcome-framed sub-label for macro stats. Replaces neutral "X / Y г"
 * with gap- or surplus-aware text on the Nutrition hero. Returns only
 * the right-hand outcome portion — the macro name is rendered separately
 * by MacroRings' caption slot. Bands mirror the Phase 4.2 onboarding
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
  // Calendar ISO week (Mon→Sun, Kyiv), not a rolling-7 window — keeps the
  // weekly chart consistent with Routine's Monday-first week (domain
  // invariant: week starts Monday). `getMacrosForDateRange` fills oldest→
  // newest ending at the given day, so anchoring `endIso` on Sunday yields
  // Mon…Sun in order.
  const weekRows = useMemo(() => {
    const weekStart = getKyivWeekStartKey();
    const weekEnd = addDaysISODate(weekStart, 6);
    return getMacrosForDateRange(log, weekEnd, 7);
  }, [log]);

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

          {hasGoal ? (
            <div className="flex flex-col gap-4">
              <div className="flex flex-col items-center justify-center gap-1.5">
                <ProgressRing
                  variant="nutrition"
                  value={kcalConsumed}
                  max={kcalGoal}
                  size="lg"
                  incomplete={isIncompleteDay}
                  // Both ring groups live on the `prominence="hero"` fill —
                  // without this the arc is lime-800 on the lime-800→-700
                  // hero gradient (invisible in light theme).
                  onHero
                  aria-label={
                    isMostlyEstimated
                      ? `Калорії: ${kcalConsumed} з ${kcalGoal} · ${messages.nutrition.estimatedBadge.a11ySuffix}`
                      : `Калорії: ${kcalConsumed} з ${kcalGoal}`
                  }
                  label={
                    <span className="flex flex-col items-center leading-none gap-0.5">
                      <span className="text-style-title text-hero-ink tabular-nums">
                        {isMostlyEstimated && (
                          <span aria-hidden="true">
                            {messages.nutrition.estimatedBadge.label}
                          </span>
                        )}
                        {kcalConsumed}
                      </span>
                      <span className="text-style-caption text-hero-ink">
                        /{" "}
                        <Measure value={kcalGoal} unit="ккал" tone="inherit" />
                      </span>
                    </span>
                  }
                />
                {isMostlyEstimated && (
                  <p className="text-style-caption text-hero-ink text-center text-pretty">
                    {messages.nutrition.estimatedBadge.caption}
                  </p>
                )}
              </div>
              <MacroRings
                aria-label={messages.nutrition.macrosToday}
                incomplete={isIncompleteDay}
                onHero
                macros={[
                  {
                    label: "Білки",
                    consumed: protein.consumed,
                    goal: protein.goal,
                    variant: "nutrition",
                    unit: "г",
                    outcome: formatMacroOutcome(protein.consumed, protein.goal),
                  },
                  {
                    label: "Жири",
                    consumed: fat.consumed,
                    goal: fat.goal,
                    variant: "warning",
                    unit: "г",
                    outcome: formatMacroOutcome(fat.consumed, fat.goal),
                  },
                  {
                    label: "Вугл.",
                    consumed: carbs.consumed,
                    goal: carbs.goal,
                    variant: "routine",
                    unit: "г",
                    outcome: formatMacroOutcome(carbs.consumed, carbs.goal),
                  },
                ]}
              />
            </div>
          ) : (
            <div className="flex justify-center py-2">
              <button
                type="button"
                onClick={onGoToDailyPlan ?? onGoToLog}
                className="text-style-caption min-h-[44px] min-w-[44px] rounded-xl px-4 text-center text-hero-ink hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-hero-ink/60"
              >
                Встановити денну ціль, щоб бачити прогрес
                <span aria-hidden="true"> →</span>
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
        targetKcal={prefs.dailyTargetKcal || 0}
        todayIso={today}
        onGoToLog={onGoToLog}
      />

      <WaterTrackerCard goalMl={prefs.waterGoalMl ?? 2000} />
    </div>
  );
}
