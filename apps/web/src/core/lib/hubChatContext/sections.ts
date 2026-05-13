import {
  parseWorkoutsFromStorage,
  WORKOUTS_STORAGE_KEY,
  ACTIVE_WORKOUT_KEY,
  completedWorkoutsCount,
  countCompletedInCurrentWeek,
  totalCompletedVolumeKg,
  weeklyVolumeSeriesNow,
} from "@sergeant/fizruk-domain";
import { safeReadStringLS } from "@shared/lib/storage/storage";
import { fmt, ls } from "../hubChatUtils";
import { generateRecommendations } from "../recommendationEngine";
import { generateInsights } from "../insightsEngine";
import { CATEGORY_META, readMemoryEntries } from "../../profile/memoryBank";
import type {
  HabitState,
  NutritionDay,
  NutritionMeal,
  NutritionPrefs,
} from "./types";

function dayKey(d: Date): string {
  return [
    d.getFullYear(),
    String(d.getMonth() + 1).padStart(2, "0"),
    String(d.getDate()).padStart(2, "0"),
  ].join("-");
}

export function appendWorkoutLines(lines: string[]): void {
  try {
    const raw = safeReadStringLS(WORKOUTS_STORAGE_KEY);
    const w = parseWorkoutsFromStorage(raw) as Array<{
      id?: string;
      startedAt?: string;
      endedAt?: string;
      items?: Array<{ nameUk?: string; name?: string; exercise?: string }>;
    }>;
    if (!Array.isArray(w) || w.length === 0) return;

    const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
    const withTs = w.map((x) => ({
      ...x,
      _ts: x.startedAt ? new Date(x.startedAt).getTime() : 0,
    }));
    const cnt = withTs.filter((x) => x._ts > weekAgo).length;
    const sorted = [...withTs].sort((a, b) => b._ts - a._ts);
    const last = sorted[0];
    const dt = last?.startedAt
      ? new Date(last.startedAt).toLocaleDateString("uk-UA", {
          day: "numeric",
          month: "short",
        })
      : "—";
    lines.push(
      `[Тренування] завершених всього: ${completedWorkoutsCount(w)}, цього тижня завершено: ${countCompletedInCurrentWeek(w)}, за останні 7 днів сесій: ${cnt}, остання дата: ${dt}`,
    );
    const { volumeKg } = weeklyVolumeSeriesNow(w);
    const weekVol = volumeKg.reduce((a, b) => a + b, 0);
    lines.push(`[Фізрук тиждень] обʼєм кг×повт (Пн–Нд): ${fmt(weekVol)}`);
    lines.push(
      `[Фізрук загалом] сумарний обʼєм завершених: ${fmt(totalCompletedVolumeKg(w))} кг×повт`,
    );

    let activeHint = "немає";
    try {
      const aid = safeReadStringLS(ACTIVE_WORKOUT_KEY);
      if (aid) {
        const aw = w.find((x) => x.id === aid && !x.endedAt);
        if (aw)
          activeHint = `${(aw.items || []).length} вправ у поточній сесії (id тренування ${aid})`;
      }
    } catch {}
    lines.push(`[Фізрук активне тренування] ${activeHint}`);

    const firstItems = sorted[0]?.items;
    if (firstItems && firstItems.length > 0) {
      const exercises = firstItems
        .map(
          (i: { nameUk?: string; name?: string; exercise?: string }) =>
            i.nameUk || i.name || i.exercise || "—",
        )
        .join(", ");
      lines.push(`[Останнє тренування вправи] ${exercises}`);
    }
  } catch {}
}

export function appendRoutineLines(lines: string[], now: Date): void {
  try {
    const routineState = ls<HabitState | null>("hub_routine_v1", null);
    if (!routineState) return;
    const habits = (routineState.habits || []).filter((h) => !h.archived);
    const completions = routineState.completions || {};
    if (habits.length === 0) return;

    const todayKey = dayKey(now);
    const todayDone = habits.filter(
      (h) =>
        Array.isArray(completions[h.id]) &&
        completions[h.id]!.includes(todayKey),
    );
    lines.push(
      `[Рутина] ${habits.length} активних звичок, виконано сьогодні: ${todayDone.length} з ${habits.length}`,
    );

    const habitDetails = habits
      .map((h) => {
        const done =
          Array.isArray(completions[h.id]) &&
          completions[h.id]!.includes(todayKey);
        return `${h.emoji || ""} ${h.name} (id:${h.id}): ${done ? "✓" : "✗"}`;
      })
      .join(", ");
    lines.push(`[Рутина сьогодні] ${habitDetails}`);

    const dow = (now.getDay() + 6) % 7;
    let weekDone = 0;
    let weekTotal = 0;
    for (let i = 0; i <= dow; i++) {
      const d2 = new Date(now);
      d2.setDate(now.getDate() - dow + i);
      const dk = dayKey(d2);
      weekTotal += habits.length;
      for (const h of habits) {
        if (Array.isArray(completions[h.id]) && completions[h.id]!.includes(dk))
          weekDone++;
      }
    }
    const weekPct =
      weekTotal > 0 ? Math.round((weekDone / weekTotal) * 100) : 0;
    lines.push(
      `[Рутина тиждень] ${weekPct}% виконання (${weekDone} з ${weekTotal})`,
    );

    let streak = 0;
    const sd = new Date(now);
    sd.setDate(sd.getDate() - 1);
    for (let i = 0; i < 365; i++) {
      const dk = dayKey(sd);
      if (
        habits.every(
          (h) =>
            Array.isArray(completions[h.id]) && completions[h.id]!.includes(dk),
        )
      ) {
        streak++;
      } else {
        break;
      }
      sd.setDate(sd.getDate() - 1);
    }
    if (streak > 0)
      lines.push(`[Рутина серія] ${streak} днів поспіль (всі звички)`);
  } catch {}
}

export function appendNutritionLines(lines: string[], now: Date): void {
  try {
    const nutritionLog = ls<Record<string, NutritionDay>>(
      "nutrition_log_v1",
      {},
    );
    const nutritionPrefs = ls<NutritionPrefs | null>(
      "nutrition_prefs_v1",
      null,
    );
    const todayKey = dayKey(now);
    const todayData = nutritionLog[todayKey];

    if (todayData) {
      const meals = Array.isArray(todayData.meals) ? todayData.meals : [];
      const kcal = meals.reduce((s, m) => s + (m?.macros?.kcal ?? 0), 0);
      const protein = meals.reduce(
        (s, m) => s + (m?.macros?.protein_g ?? 0),
        0,
      );
      const fat = meals.reduce((s, m) => s + (m?.macros?.fat_g ?? 0), 0);
      const carbs = meals.reduce((s, m) => s + (m?.macros?.carbs_g ?? 0), 0);
      lines.push(
        `[Харчування сьогодні] ${Math.round(kcal)} ккал | білок: ${Math.round(protein)}г | жири: ${Math.round(fat)}г | вуглеводи: ${Math.round(carbs)}г | прийомів: ${meals.length}`,
      );
      if (meals.length > 0) {
        const mealList = meals
          .slice(0, 6)
          .map(
            (m) =>
              `${m.name || "?"} (${Math.round(m?.macros?.kcal ?? 0)} ккал)`,
          )
          .join(", ");
        lines.push(`[Харчування прийоми] ${mealList}`);
      }
    }

    if (nutritionPrefs) {
      const tKcal = nutritionPrefs.dailyTargetKcal;
      const tProt =
        nutritionPrefs.dailyTargetProtein_g ||
        nutritionPrefs.dailyTargetProtein;
      if (tKcal || tProt) {
        lines.push(
          `[Харчування ціль] ${tKcal ? `${tKcal} ккал/день` : ""}${tKcal && tProt ? ", " : ""}${tProt ? `білок: ${tProt}г/день` : ""}`,
        );
      }
    }

    const weekKcalArr: number[] = [];
    for (let i = 6; i >= 0; i--) {
      const d3 = new Date(now);
      d3.setDate(now.getDate() - i);
      const dk = dayKey(d3);
      const dayMeals: NutritionMeal[] = Array.isArray(nutritionLog[dk]?.meals)
        ? (nutritionLog[dk].meals as NutritionMeal[])
        : [];
      const k = dayMeals.reduce((s, m) => s + (m?.macros?.kcal ?? 0), 0);
      if (k > 0) weekKcalArr.push(k);
    }
    if (weekKcalArr.length > 0) {
      const avg = Math.round(
        weekKcalArr.reduce((a, b) => a + b, 0) / weekKcalArr.length,
      );
      lines.push(
        `[Харчування тиждень] середньо ${avg} ккал/день (за ${weekKcalArr.length} днів)`,
      );
    }
  } catch {}
}

export function appendAiSignalLines(lines: string[]): void {
  try {
    const recs = generateRecommendations().slice(0, 5);
    if (recs.length > 0) {
      lines.push("[Активні рекомендації]");
      recs.forEach((r) => {
        lines.push(`  ${r.icon} ${r.title} — ${r.body} (модуль: ${r.module})`);
      });
    }
  } catch {}

  try {
    const insights = generateInsights();
    if (insights.length > 0) {
      lines.push("[Аналітичні інсайти]");
      insights.forEach((i) => {
        lines.push(`  ${i.emoji} ${i.title} (${i.stat}) — ${i.detail}`);
      });
    }
  } catch {}

  try {
    const profile = readMemoryEntries();
    if (profile.length > 0) {
      lines.push("[Профіль користувача]");
      const grouped: Record<string, string[]> = {};
      for (const entry of profile) {
        const cat = entry.category || "other";
        if (!grouped[cat]) grouped[cat] = [];
        grouped[cat].push(entry.fact);
      }
      for (const [cat, facts] of Object.entries(grouped)) {
        lines.push(
          `  ${CATEGORY_META[cat]?.label || cat}: ${facts.join("; ")}`,
        );
      }
    }
  } catch {}
}
