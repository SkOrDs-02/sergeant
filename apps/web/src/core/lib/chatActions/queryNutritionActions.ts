import { getKyivDayKey } from "@shared/lib/time/kyivTime";
import { loadNutritionLog } from "@nutrition/lib/nutritionStorage";
import type {
  ChatAction,
  ChatActionResult,
  NutritionDay,
  NutritionMeal,
} from "./types";

/**
 * Read-only "talk to your data" виконавці для Харчування (PR3
 * talk-to-your-data). Дзеркало серверних `QUERY_NUTRITION_TOOLS`
 * (`toolDefs/queryNutrition.ts`). Жоден з них НЕ пише — лише читають журнал
 * їжі (`nutrition_log_v1`) і повертають числові відповіді / агрегації.
 *
 * Реєструється у `hubChatActions.ts` dispatch-chain окремою гілкою, не
 * чіпаючи мутаційний `handleNutritionAction`. Діапазон визначається або
 * парою `date_from`/`date_to`, або `period_days` (days-ago cutoff). Day-key —
 * Europe/Kyiv через `getKyivDayKey`.
 */

interface QueryNutritionAction {
  name: "query_nutrition";
  input: {
    query?: string;
    date_from?: string;
    date_to?: string;
    period_days?: number | string;
    limit?: number | string;
  };
}

interface NutritionAveragesAction {
  name: "nutrition_averages";
  input: {
    date_from?: string;
    date_to?: string;
    period_days?: number | string;
  };
}

const DAY_MS = 86_400_000;

interface DatedMeal extends NutritionMeal {
  day: string;
}

// ─── helpers ────────────────────────────────────────────────────────────────

function normalizeText(value: unknown): string {
  return String(value ?? "")
    .trim()
    .toLowerCase();
}

function isoOrUndef(value: unknown): string | undefined {
  const s = String(value ?? "").trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : undefined;
}

function clampDays(value: unknown, fallback: number): number {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return Math.min(365, Math.floor(n));
}

function clamp(value: unknown, fallback: number, max: number): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(1, Math.floor(n)));
}

function round(n: number): number {
  return Math.round(n);
}

/**
 * Resolve the inclusive `[from, to]` day-key window. Explicit dates win; else
 * `period_days` back from today (Kyiv).
 */
function resolveRange(
  dateFrom: unknown,
  dateTo: unknown,
  periodDays: unknown,
): { from: string; to: string } {
  const to = isoOrUndef(dateTo) ?? getKyivDayKey();
  const explicitFrom = isoOrUndef(dateFrom);
  if (explicitFrom) return { from: explicitFrom, to };
  const days = clampDays(periodDays, 7);
  const from = getKyivDayKey(Date.now() - (days - 1) * DAY_MS);
  return { from, to };
}

function readLog(): Record<string, NutritionDay> {
  // Canonical meal log — SQLite warm cache (`nutrition_log_v1` is tombstoned
  // and drained on boot). Mirrors recommendationEngine / briefingHandlers,
  // which read via the nutritionStorage wrappers, not the dead LS key.
  // Normalize the domain `Meal` shape (nullable macros, no `addedAt`) into the
  // local query shape — macro nulls collapse to 0 (executors only sum macros).
  const out: Record<string, NutritionDay> = {};
  for (const [day, data] of Object.entries(loadNutritionLog())) {
    out[day] = {
      meals: (data?.meals ?? []).map((m) => ({
        id: m.id,
        name: m.name,
        macros: {
          kcal: m.macros?.kcal ?? 0,
          protein_g: m.macros?.protein_g ?? 0,
          fat_g: m.macros?.fat_g ?? 0,
          carbs_g: m.macros?.carbs_g ?? 0,
        },
      })),
    };
  }
  return out;
}

/** Flattened meals within `[from, to]`, each tagged with its day key. */
function mealsInRange(from: string, to: string): DatedMeal[] {
  const log = readLog();
  const meals: DatedMeal[] = [];
  for (const [day, data] of Object.entries(log)) {
    if (day < from || day > to) continue;
    const dayMeals = Array.isArray(data?.meals) ? data.meals : [];
    for (const m of dayMeals) {
      meals.push({ ...m, day });
    }
  }
  return meals.sort((a, b) => (a.day < b.day ? 1 : a.day > b.day ? -1 : 0));
}

function mealKcal(m: NutritionMeal): number {
  return m?.macros?.kcal ?? 0;
}

// ─── executors ──────────────────────────────────────────────────────────────

export function queryNutrition(action: QueryNutritionAction): ChatActionResult {
  const input = action.input;
  const query = normalizeText(input.query);
  const { from, to } = resolveRange(
    input.date_from,
    input.date_to,
    input.period_days,
  );
  const limit = clamp(input.limit, 20, 100);

  const matched = mealsInRange(from, to).filter((m) => {
    if (!query) return true;
    return normalizeText(m.name).includes(query);
  });

  if (matched.length === 0) {
    const flt = query ? ` (${query})` : "";
    return `Прийомів їжі${flt} за ${from} — ${to} не знайдено.`;
  }

  const totals = matched.reduce(
    (acc, m) => {
      acc.kcal += m?.macros?.kcal ?? 0;
      acc.protein += m?.macros?.protein_g ?? 0;
      acc.fat += m?.macros?.fat_g ?? 0;
      acc.carbs += m?.macros?.carbs_g ?? 0;
      return acc;
    },
    { kcal: 0, protein: 0, fat: 0, carbs: 0 },
  );

  const shown = matched.slice(0, limit);
  const list = shown
    .map(
      (m) => `${m.day}: ${m.name || "Без назви"} · ${round(mealKcal(m))} ккал`,
    )
    .join("; ");
  const more =
    matched.length > shown.length
      ? ` (показано ${shown.length} з ${matched.length})`
      : "";

  return `Прийомів за ${from} — ${to}: ${matched.length}, разом ${round(totals.kcal)} ккал (Б ${round(totals.protein)}г · Ж ${round(totals.fat)}г · В ${round(totals.carbs)}г)${more}: ${list}`;
}

export function nutritionAverages(
  action: NutritionAveragesAction,
): ChatActionResult {
  const input = action.input;
  const { from, to } = resolveRange(
    input.date_from,
    input.date_to,
    input.period_days,
  );

  // Aggregate per day, then average across days that actually have meals.
  const log = readLog();
  const days = Object.entries(log)
    .filter(([day]) => day >= from && day <= to)
    .map(([day, data]) => {
      const meals = Array.isArray(data?.meals) ? data.meals : [];
      const totals = meals.reduce(
        (acc, m) => {
          acc.kcal += m?.macros?.kcal ?? 0;
          acc.protein += m?.macros?.protein_g ?? 0;
          acc.fat += m?.macros?.fat_g ?? 0;
          acc.carbs += m?.macros?.carbs_g ?? 0;
          return acc;
        },
        { kcal: 0, protein: 0, fat: 0, carbs: 0 },
      );
      return { day, ...totals };
    })
    .filter((d) => d.kcal > 0)
    .sort((a, b) => (a.day < b.day ? -1 : a.day > b.day ? 1 : 0));

  if (days.length === 0) {
    return `Немає записів їжі за ${from} — ${to}.`;
  }

  const n = days.length;
  const sum = days.reduce(
    (acc, d) => {
      acc.kcal += d.kcal;
      acc.protein += d.protein;
      acc.fat += d.fat;
      acc.carbs += d.carbs;
      return acc;
    },
    { kcal: 0, protein: 0, fat: 0, carbs: 0 },
  );

  const avg = {
    kcal: sum.kcal / n,
    protein: sum.protein / n,
    fat: sum.fat / n,
    carbs: sum.carbs / n,
  };

  const lines = [
    `Середнє харчування за ${from} — ${to} (${n} ${n === 1 ? "день" : "днів"} із записами):`,
    `Калорії: ${round(avg.kcal)} ккал/день`,
    `Макроси/день: Б ${round(avg.protein)}г · Ж ${round(avg.fat)}г · В ${round(avg.carbs)}г`,
  ];

  // Trend: first half vs second half kcal/day (needs ≥2 days).
  if (n >= 2) {
    const mid = Math.floor(n / 2);
    const firstHalf = days.slice(0, mid);
    const secondHalf = days.slice(mid);
    const avgOf = (arr: typeof days): number =>
      arr.reduce((s, d) => s + d.kcal, 0) / arr.length;
    const a = avgOf(firstHalf);
    const b = avgOf(secondHalf);
    const trend = b > a ? "зростає" : b < a ? "спадає" : "стабільно";
    lines.push(`Тренд калорій: ${trend} (${round(a)} → ${round(b)} ккал/день)`);
  }

  return lines.join("\n");
}

/**
 * Доменний router для read-only nutrition query-tools. Повертає `undefined` для
 * нерелевантних дій, щоб `hubChatActions.dispatch` пішов далі по ланцюгу.
 */
export function handleQueryNutritionAction(
  action: ChatAction,
): ChatActionResult | undefined {
  switch (action.name) {
    case "query_nutrition":
      return queryNutrition(action as QueryNutritionAction);
    case "nutrition_averages":
      return nutritionAverages(action as NutritionAveragesAction);
    default:
      return undefined;
  }
}
