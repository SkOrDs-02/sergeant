/**
 * Last validated: 2026-08-10
 * Status: Active
 * Персистенція денного і тижневого планів харчування.
 *
 * До 2026-08-10 обидва плани жили ЛИШЕ в `useState` всередині
 * `useNutritionUiState` — жодного запису в сховище не було. `/nutrition/*`
 * — lazy-роут, тож `NutritionApp` розмонтовується на будь-якому переході в
 * інший модуль, і план зникав не тільки після закриття застосунку, а й
 * після «Хаб → Харчування» чи звичайного перезавантаження. Репорт тестера
 * 2026-08-10 описував саме цей симптом (закриття), але причина ширша.
 *
 * Сховище — `nutritionStorage` (localStorage через `webKVStore`), а не
 * SQLite / оп-лог. План — разова AI-порада на основі комори й цілей, а не
 * сутність, яку ми синхронізуємо між пристроями: у нього немає ані id, ані
 * власника, ані історії, і сервер його не зберігає (`day-plan.ts` /
 * `week-plan.ts` — чистий прохід у LLM). Крос-девайс — окреме рішення з
 * таблицею, міграцією і контрактом, а не розширення цього файлу.
 *
 * **Свідомо БЕЗ протухання за днем чи тижнем.** Спокуса «денний план діє
 * лише сьогодні» веде рівно до того ж, що ми тут лагодимо: план знову
 * зникає сам собою, просто з іншої причини, і тестер пише той самий репорт.
 * План живе, доки його не перегенерують. `savedAt` лишається у записі, щоб
 * UI колись міг показати «згенеровано тоді-то» — це дешевше і чесніше за
 * тихе видалення.
 */
import type {
  NutritionDayPlan,
  NutritionWeekPlan,
} from "../hooks/useNutritionUiState";

import { nutritionStorage } from "./nutritionStorageInstance";

export const NUTRITION_DAY_PLAN_KEY = "nutrition_day_plan_v1";
// `gitleaks:allow` — це імʼя слота в localStorage, не секрет. Евристика
// `generic-api-key` ловить ALL_CAPS-константу на `_KEY` з достатньо
// «випадковим» рядком праворуч; той самий прецедент уже позначено в
// `fizruk/lib/demoSeedImport.test.ts` (`fizruk_measurements_v1`).
export const NUTRITION_WEEK_PLAN_KEY = "nutrition_week_plan_v1"; // gitleaks:allow

export interface StoredDayPlan {
  plan: NutritionDayPlan;
  /** Unix ms генерації — для майбутнього маркера свіжості в UI. */
  savedAt: number;
}

export interface StoredWeekPlan {
  plan: NutritionWeekPlan | null;
  /** Сирий текст LLM — `DailyPlanCard` показує його, коли `days` порожній. */
  raw: string;
  savedAt: number;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Читання навмисно параноїдальне: у localStorage лежить JSON, який пережив
 * попередні версії застосунку і ручні правки в devtools. Будь-яка невідповідність
 * формі — це `null`, тобто «плану немає», а не виняток посеред рендера.
 */
export function loadDayPlan(): StoredDayPlan | null {
  const raw = nutritionStorage.readJSON<unknown>(NUTRITION_DAY_PLAN_KEY, null);
  if (!isRecord(raw)) return null;
  const plan = raw["plan"];
  // Порожній план еквівалентний його відсутності: картка все одно показала б
  // кнопку «Згенерувати», але з мертвим блоком підсумків над нею.
  if (!isRecord(plan) || !Array.isArray(plan["meals"]) || !plan["meals"].length)
    return null;
  const savedAt = raw["savedAt"];
  return {
    plan: plan as NutritionDayPlan,
    savedAt: typeof savedAt === "number" ? savedAt : 0,
  };
}

/** Повертає записаний `savedAt`, або `null`, якщо слот очищено. */
export function saveDayPlan(plan: NutritionDayPlan | null): number | null {
  const meals = plan?.meals;
  if (!plan || !Array.isArray(meals) || meals.length === 0) {
    nutritionStorage.removeItem(NUTRITION_DAY_PLAN_KEY);
    return null;
  }
  const savedAt = Date.now();
  nutritionStorage.writeJSON(NUTRITION_DAY_PLAN_KEY, {
    plan,
    savedAt,
  } satisfies StoredDayPlan);
  return savedAt;
}

export function loadWeekPlan(): StoredWeekPlan | null {
  const raw = nutritionStorage.readJSON<unknown>(NUTRITION_WEEK_PLAN_KEY, null);
  if (!isRecord(raw)) return null;
  const plan = isRecord(raw["plan"])
    ? (raw["plan"] as NutritionWeekPlan)
    : null;
  const rawText = typeof raw["raw"] === "string" ? raw["raw"] : "";
  const hasDays = Array.isArray(plan?.days) && plan.days.length > 0;
  // `weekPlanRaw` — легальний самостійний носій: коли LLM не віддав структуру,
  // картка показує сирий текст. Тому запис валідний, якщо є бодай одне з двох.
  if (!hasDays && !rawText) return null;
  const savedAt = raw["savedAt"];
  return {
    plan,
    raw: rawText,
    savedAt: typeof savedAt === "number" ? savedAt : 0,
  };
}

export function saveWeekPlan(
  plan: NutritionWeekPlan | null,
  raw: string,
): void {
  const hasDays = Array.isArray(plan?.days) && plan.days.length > 0;
  if (!hasDays && !raw) {
    nutritionStorage.removeItem(NUTRITION_WEEK_PLAN_KEY);
    return;
  }
  nutritionStorage.writeJSON(NUTRITION_WEEK_PLAN_KEY, {
    plan,
    raw,
    savedAt: Date.now(),
  } satisfies StoredWeekPlan);
}
