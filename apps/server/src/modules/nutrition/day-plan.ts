import type { Request, Response } from "express";
import type { z } from "zod";
import type { PantryMode } from "@sergeant/shared";
import { env } from "../../env/env.js";
import { extractJsonFromText } from "../../http/jsonSafe.js";
import { parseBody } from "../../http/validate.js";
import { DayPlanSchema } from "../../http/schemas.js";
import { makeAiProviderError } from "../../obs/errors.js";
import { getLLMProvider, invokeLLM } from "../../lib/llm/provider.js";
import {
  pantryPromptSection,
  resolvePantryMode,
} from "../../lib/prompt-builders.js";
import { NUTRITION_AI_TIMEOUTS_MS } from "./timeouts.js";

import { ADVICE_BOUNDARY_RULE } from "../../lib/adviceBoundary.js";

export type DayPlanInput = z.infer<typeof DayPlanSchema>;

type WithAnthropicKey = Request & {
  anthropicKey?: string;
  user?: { id: string };
};

type MealType = "breakfast" | "lunch" | "dinner" | "snack";

interface PlanMeal {
  type: MealType;
  label: string;
  name: string;
  description: string;
  ingredients: string[];
  kcal: number | null;
  protein_g: number | null;
  fat_g: number | null;
  carbs_g: number | null;
}

interface NormalizedDayPlan {
  meals: PlanMeal[];
  totalKcal: number | null;
  totalProtein_g: number | null;
  totalFat_g: number | null;
  totalCarbs_g: number | null;
  note: string;
}

/**
 * Правило комори в system-промпті. Раніше тут беззастережно стояло
 * «Намагайся використовувати продукти з наявного списку (pantry)» — і саме
 * воно перекривало вибір користувача «не враховувати комору», навіть коли б
 * той вибір доїхав до сервера.
 */
const PANTRY_RULE: Record<PantryMode, string> = {
  prefer:
    "- Намагайся використовувати продукти з наявного списку (pantry), але за потреби для повноцінного плану можна додати звичайні доступні продукти поза списком",
  only: "- Використовуй ТІЛЬКИ продукти з наявного списку (pantry) плюс сіль, олію, воду й базові спеції. Якщо продуктів не вистачає на повний день — поверни менше прийомів або повтори простий варіант і поясни це в note; відсутніх продуктів не додавай",
  ignore:
    "- Комору НЕ враховуй: складай план вільно, з будь-яких доступних у магазині продуктів. Списку наявного тобі не передано — не вигадуй його вміст",
};

export function buildDayPlanSystem(mode: PantryMode = "prefer"): string {
  return `Ти нутріціолог і шеф-кухар. Відповідай ТІЛЬКИ українською.

${ADVICE_BOUNDARY_RULE}
Поверни ТІЛЬКИ валідний JSON без markdown і без додаткового тексту.

Формат JSON:
{
  "meals": [
    {
      "type": "breakfast"|"lunch"|"dinner"|"snack",
      "label": string,
      "name": string,
      "description": string,
      "ingredients": string[],
      "kcal": number|null,
      "protein_g": number|null,
      "fat_g": number|null,
      "carbs_g": number|null
    }
  ],
  "totalKcal": number|null,
  "totalProtein_g": number|null,
  "totalFat_g": number|null,
  "totalCarbs_g": number|null,
  "note": string
}

Правила:
- Сніданок (breakfast), обід (lunch), вечеря (dinner), і 1-2 перекуси (snack)
${PANTRY_RULE[mode]}
- Загальні макроси мають максимально відповідати цільовим значенням
- description — 1-2 рядки опису страви
- ingredients — список ключових інгредієнтів з кількостями
- Якщо цільові макроси не задані — пропонуй збалансоване харчування ~2000 ккал`;
}

/** Дефолтний system-промпт (`prefer`) — сумісність зі старими імпортами. */
export const SYSTEM = buildDayPlanSystem("prefer");

function numOrNull(v: unknown): number | null {
  return v != null && Number.isFinite(Number(v)) ? Number(v) : null;
}

/**
 * Підсумок по прийомах, які РЕАЛЬНО лишились у плані.
 *
 * AI-DANGER: тотали приходять від моделі окремим полем, і довіряти їм
 * не можна з двох причин. Перша: модель помиляється в арифметиці —
 * прогін 2026-09-01 дав прийоми на 166 г вуглеводів при заявлених 171.
 * Друга, гірша: `meals` обрізається до шести, тож на довшій видачі
 * тотали лишились би від усіх прийомів, включно з викинутими, і план
 * показував би калорії, яких у ньому немає.
 *
 * Рахуємо самі лише коли КОЖЕН прийом несе це число: одна дірка в
 * макросі зробила б суму заниженою, а занижена сума гірша за чесно
 * взяту від моделі.
 */
function sumMeals(meals: PlanMeal[], key: keyof PlanMeal): number | null {
  if (meals.length === 0) return null;
  let total = 0;
  for (const meal of meals) {
    const v = meal[key];
    if (typeof v !== "number" || !Number.isFinite(v)) return null;
    total += v;
  }
  return Math.round(total * 10) / 10;
}

function normalizeDayPlan(parsed: unknown): NormalizedDayPlan {
  const obj =
    parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : ({} as Record<string, unknown>);
  const meals = Array.isArray(obj["meals"]) ? (obj["meals"] as unknown[]) : [];
  const validTypes: MealType[] = ["breakfast", "lunch", "dinner", "snack"];
  const typeLabels: Record<MealType, string> = {
    breakfast: "Сніданок",
    lunch: "Обід",
    dinner: "Вечеря",
    snack: "Перекус",
  };
  const normalizedMeals = meals
    .map((m): PlanMeal | null => {
      if (!m || typeof m !== "object") return null;
      const rec = m as Record<string, unknown>;
      const type: MealType = validTypes.includes(rec["type"] as MealType)
        ? (rec["type"] as MealType)
        : "snack";
      return {
        type,
        label: String(rec["label"] || typeLabels[type]),
        name: String(rec["name"] || "").trim(),
        description: String(rec["description"] || "").trim(),
        ingredients: Array.isArray(rec["ingredients"])
          ? (rec["ingredients"] as unknown[])
              .map((x) => String(x).trim())
              .filter(Boolean)
          : [],
        kcal: numOrNull(rec["kcal"]),
        protein_g: numOrNull(rec["protein_g"]),
        fat_g: numOrNull(rec["fat_g"]),
        carbs_g: numOrNull(rec["carbs_g"]),
      };
    })
    .filter((v): v is PlanMeal => Boolean(v))
    .slice(0, 6);

  return {
    meals: normalizedMeals,
    totalKcal: sumMeals(normalizedMeals, "kcal") ?? numOrNull(obj["totalKcal"]),
    totalProtein_g:
      sumMeals(normalizedMeals, "protein_g") ??
      numOrNull(obj["totalProtein_g"]),
    totalFat_g:
      sumMeals(normalizedMeals, "fat_g") ?? numOrNull(obj["totalFat_g"]),
    totalCarbs_g:
      sumMeals(normalizedMeals, "carbs_g") ?? numOrNull(obj["totalCarbs_g"]),
    note: String(obj["note"] || "").trim(),
  };
}

/**
 * Промпт денного плану — рівно той, що йде в прод (винесено заради стенду
 * `scripts/eval/pipelines.nutrition.ts`).
 */
export function buildDayPlanPrompt(input: DayPlanInput): {
  system: string;
  user: string;
} {
  const {
    pantry: pantryIn,
    pantryMode,
    targets,
    regenerateMealType,
    locale,
  } = input;
  const loc = String(locale || "uk-UA");
  // Один режим на весь запит — і в секцію комори, і в system-промпт.
  // `only` із порожньою коморою відсікає pantryPromptSection до виклику LLM.
  const mode: PantryMode = resolvePantryMode(pantryMode);

  const tgt = targets || {};
  const kcal = tgt.kcal != null ? Number(tgt.kcal) : null;
  const protein = tgt.protein_g != null ? Number(tgt.protein_g) : null;
  const fat = tgt.fat_g != null ? Number(tgt.fat_g) : null;
  const carbs = tgt.carbs_g != null ? Number(tgt.carbs_g) : null;

  const pantrySec = pantryPromptSection({
    pantry: pantryIn,
    preset: "dayPlan",
    label:
      mode === "only"
        ? "Наявні продукти (тільки вони)"
        : "Наявні продукти (намагайся використовувати їх)",
    mode,
  });

  const targetsStr =
    kcal != null
      ? `Ціль ккал: ${kcal}. Білки: ${protein ?? "не задано"} г. Жири: ${fat ?? "не задано"} г. Вуглеводи: ${carbs ?? "не задано"} г.`
      : "Цілі не задані — запропонуй збалансоване харчування.";

  const regenStr = regenerateMealType
    ? `Потрібно перегенерувати ТІЛЬКИ прийом їжі типу: "${regenerateMealType}". Решту не включай.`
    : "Згенеруй повний план на день: сніданок, обід, вечеря, 1-2 перекуси.";

  const prompt = `Мова: ${loc}.
${targetsStr}

${pantrySec}

${regenStr}`;

  return { system: buildDayPlanSystem(mode), user: prompt };
}

/**
 * POST /api/nutrition/day-plan — згенерувати план харчування на день.
 * CORS / token / quota / rate-limit виставляє роутер.
 */
export default async function handler(
  req: Request,
  res: Response,
): Promise<void> {
  const apiKey = (req as WithAnthropicKey).anthropicKey as string;
  const userId = (req as WithAnthropicKey).user?.id;

  const prompt = buildDayPlanPrompt(parseBody(DayPlanSchema, req));

  const provider = getLLMProvider({
    provider: env.LLM_NUTRITION_PROVIDER,
    anthropicApiKey: apiKey,
    openrouterModel: env.OPENROUTER_NUTRITION_MODEL,
  });
  const result = await invokeLLM(provider, {
    model: env.NUTRITION_MODEL,
    maxTokens: 1500,
    temperature: 0.3,
    system: prompt.system,
    messages: [{ role: "user", content: prompt.user }],
    timeoutMs: NUTRITION_AI_TIMEOUTS_MS.dayPlan,
    endpoint: "day-plan",
    ...(userId ? { userId } : {}),
  });
  if (!result.ok) {
    throw makeAiProviderError({
      rawProviderMessage: result.error,
      status: result.status,
    });
  }

  const out = result.text;
  const jsonParsed = extractJsonFromText(out);
  const plan = normalizeDayPlan(jsonParsed);

  res.status(200).json({
    plan,
    rawText: plan.meals.length === 0 ? out || null : null,
  });
}
