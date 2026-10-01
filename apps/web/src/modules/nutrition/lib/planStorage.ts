/**
 * Last validated: 2026-08-13
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
 * сутність, яку ми синхронізуємо між пристроями: у нього немає id чи історії, і
 * сервер його не зберігає (`day-plan.ts` /
 * `week-plan.ts` — чистий прохід у LLM). Крос-девайс — окреме рішення з
 * таблицею, міграцією і контрактом, а не розширення цього файлу.
 * Локальний `ownerId` у key/payload — privacy-partition одного пристрою,
 * а не server-side ownership: account A не може прочитати план account B.
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
const ANONYMOUS_PLAN_OWNER_ID = "local-anon";

export interface StoredDayPlan {
  ownerId: string;
  plan: NutritionDayPlan;
  /** Unix ms генерації — для майбутнього маркера свіжості в UI. */
  savedAt: number;
}

export interface StoredWeekPlan {
  ownerId: string;
  plan: NutritionWeekPlan | null;
  /** Сирий текст LLM — `DailyPlanCard` показує його, коли `days` порожній. */
  raw: string;
  savedAt: number;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function ownerKey(baseKey: string, ownerId: string): string {
  return `${baseKey}:${encodeURIComponent(ownerId)}`;
}

function removeUnsafeLegacyRecord(baseKey: string): void {
  // v1 records had no owner and therefore cannot be safely attributed to the
  // account that happens to sign in after an expired session.
  nutritionStorage.removeItem(baseKey);
}

function readOwnedRecord(
  baseKey: string,
  ownerId: string,
): Record<string, unknown> | null {
  const key = ownerKey(baseKey, ownerId);
  const raw = nutritionStorage.readJSON<unknown>(key, null);
  if (!isRecord(raw)) return null;
  if (raw["ownerId"] !== ownerId) {
    nutritionStorage.removeItem(key);
    return null;
  }
  return raw;
}

function claimAnonymousRecord(
  baseKey: string,
  ownerId: string,
  current: Record<string, unknown> | null,
): Record<string, unknown> | null {
  if (ownerId === ANONYMOUS_PLAN_OWNER_ID) return current;
  const anonymous = readOwnedRecord(baseKey, ANONYMOUS_PLAN_OWNER_ID);
  if (!anonymous) return current;

  const currentSavedAt =
    typeof current?.["savedAt"] === "number" ? current["savedAt"] : 0;
  const anonymousSavedAt =
    typeof anonymous["savedAt"] === "number" ? anonymous["savedAt"] : 0;
  if (current && currentSavedAt >= anonymousSavedAt) {
    nutritionStorage.removeItem(ownerKey(baseKey, ANONYMOUS_PLAN_OWNER_ID));
    return current;
  }

  const claimed = { ...anonymous, ownerId };
  if (!nutritionStorage.writeJSON(ownerKey(baseKey, ownerId), claimed)) {
    return current;
  }
  nutritionStorage.removeItem(ownerKey(baseKey, ANONYMOUS_PLAN_OWNER_ID));
  return claimed;
}

/**
 * Читання навмисно параноїдальне: у localStorage лежить JSON, який пережив
 * попередні версії застосунку і ручні правки в devtools. Будь-яка невідповідність
 * формі — це `null`, тобто «плану немає», а не виняток посеред рендера.
 */
export function loadDayPlan(
  ownerId: string | null,
  claimAnonymous = false,
): StoredDayPlan | null {
  if (!ownerId) return null;
  removeUnsafeLegacyRecord(NUTRITION_DAY_PLAN_KEY);
  const owned = readOwnedRecord(NUTRITION_DAY_PLAN_KEY, ownerId);
  const raw = claimAnonymous
    ? claimAnonymousRecord(NUTRITION_DAY_PLAN_KEY, ownerId, owned)
    : owned;
  if (!raw) return null;
  const plan = raw["plan"];
  // Порожній план еквівалентний його відсутності: картка все одно показала б
  // кнопку «Згенерувати», але з мертвим блоком підсумків над нею.
  if (!isRecord(plan) || !Array.isArray(plan["meals"]) || !plan["meals"].length)
    return null;
  const savedAt = raw["savedAt"];
  return {
    ownerId,
    plan: plan as NutritionDayPlan,
    savedAt: typeof savedAt === "number" ? savedAt : 0,
  };
}

/** Повертає записаний `savedAt`, або `null`, якщо слот очищено. */
export function saveDayPlan(
  plan: NutritionDayPlan | null,
  ownerId: string | null,
): number | null {
  if (!ownerId) return null;
  removeUnsafeLegacyRecord(NUTRITION_DAY_PLAN_KEY);
  const key = ownerKey(NUTRITION_DAY_PLAN_KEY, ownerId);
  const meals = plan?.meals;
  if (!plan || !Array.isArray(meals) || meals.length === 0) {
    nutritionStorage.removeItem(key);
    return null;
  }
  const savedAt = Date.now();
  nutritionStorage.writeJSON(key, {
    ownerId,
    plan,
    savedAt,
  } satisfies StoredDayPlan);
  return savedAt;
}

export function loadWeekPlan(
  ownerId: string | null,
  claimAnonymous = false,
): StoredWeekPlan | null {
  if (!ownerId) return null;
  removeUnsafeLegacyRecord(NUTRITION_WEEK_PLAN_KEY);
  const owned = readOwnedRecord(NUTRITION_WEEK_PLAN_KEY, ownerId);
  const raw = claimAnonymous
    ? claimAnonymousRecord(NUTRITION_WEEK_PLAN_KEY, ownerId, owned)
    : owned;
  if (!raw) return null;
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
    ownerId,
    plan,
    raw: rawText,
    savedAt: typeof savedAt === "number" ? savedAt : 0,
  };
}

export function saveWeekPlan(
  plan: NutritionWeekPlan | null,
  raw: string,
  ownerId: string | null,
): void {
  if (!ownerId) return;
  removeUnsafeLegacyRecord(NUTRITION_WEEK_PLAN_KEY);
  const key = ownerKey(NUTRITION_WEEK_PLAN_KEY, ownerId);
  const hasDays = Array.isArray(plan?.days) && plan.days.length > 0;
  if (!hasDays && !raw) {
    nutritionStorage.removeItem(key);
    return;
  }
  nutritionStorage.writeJSON(key, {
    ownerId,
    plan,
    raw,
    savedAt: Date.now(),
  } satisfies StoredWeekPlan);
}
