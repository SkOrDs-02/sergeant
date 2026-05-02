import type { Request, Response } from "express";
import { extractJsonFromText } from "../../http/jsonSafe.js";
import { validateBody } from "../../http/validate.js";
import { DayPlanSchema } from "../../http/schemas.js";
import { ExternalServiceError } from "../../obs/errors.js";
import {
  anthropicMessages,
  extractAnthropicText,
} from "../../lib/anthropic.js";
import { formatPantryForPrompt } from "../../lib/pantryFormat.js";

type AnthropicErrorPayload = { error?: { message?: string } };
type WithAnthropicKey = Request & { anthropicKey?: string };

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

const SYSTEM = `Ти нутріціолог і шеф-кухар. Відповідай ТІЛЬКИ українською.
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
- Намагайся використовувати продукти з наявного списку (pantry)
- Загальні макроси мають максимально відповідати цільовим значенням
- description — 1-2 рядки опису страви
- ingredients — список ключових інгредієнтів з кількостями
- Якщо цільові макроси не задані — пропонуй збалансоване харчування ~2000 ккал`;

function numOrNull(v: unknown): number | null {
  return v != null && Number.isFinite(Number(v)) ? Number(v) : null;
}

function normalizeDayPlan(parsed: unknown): NormalizedDayPlan {
  const obj =
    parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : ({} as Record<string, unknown>);
  const meals = Array.isArray(obj.meals) ? (obj.meals as unknown[]) : [];
  const validTypes: MealType[] = ["breakfast", "lunch", "dinner", "snack"];
  const typeLabels: Record<MealType, string> = {
    breakfast: "Сніданок",
    lunch: "Обід",
    dinner: "Вечеря",
    snack: "Перекус",
  };
  return {
    meals: meals
      .map((m): PlanMeal | null => {
        if (!m || typeof m !== "object") return null;
        const rec = m as Record<string, unknown>;
        const type: MealType = validTypes.includes(rec.type as MealType)
          ? (rec.type as MealType)
          : "snack";
        return {
          type,
          label: String(rec.label || typeLabels[type]),
          name: String(rec.name || "").trim(),
          description: String(rec.description || "").trim(),
          ingredients: Array.isArray(rec.ingredients)
            ? (rec.ingredients as unknown[])
                .map((x) => String(x).trim())
                .filter(Boolean)
            : [],
          kcal: numOrNull(rec.kcal),
          protein_g: numOrNull(rec.protein_g),
          fat_g: numOrNull(rec.fat_g),
          carbs_g: numOrNull(rec.carbs_g),
        };
      })
      .filter((v): v is PlanMeal => Boolean(v))
      .slice(0, 6),
    totalKcal: numOrNull(obj.totalKcal),
    totalProtein_g: numOrNull(obj.totalProtein_g),
    totalFat_g: numOrNull(obj.totalFat_g),
    totalCarbs_g: numOrNull(obj.totalCarbs_g),
    note: String(obj.note || "").trim(),
  };
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

  const parsed = validateBody(DayPlanSchema, req, res);
  if (!parsed.ok) return;
  const { pantry: pantryIn, targets, regenerateMealType, locale } = parsed.data;
  const loc = String(locale || "uk-UA");

  const tgt = targets || {};
  const kcal = tgt.kcal != null ? Number(tgt.kcal) : null;
  const protein = tgt.protein_g != null ? Number(tgt.protein_g) : null;
  const fat = tgt.fat_g != null ? Number(tgt.fat_g) : null;
  const carbs = tgt.carbs_g != null ? Number(tgt.carbs_g) : null;

  const pantryStr = formatPantryForPrompt(pantryIn, {
    itemFormat: "nameQuantity",
    limit: 50,
    joinWith: "\n- ",
    fallbackWhenEmpty: "продукти не вказані",
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

Наявні продукти (намагайся використовувати їх):
- ${pantryStr}

${regenStr}`;

  const payload = {
    model: "claude-sonnet-4-6",
    max_tokens: 1500,
    temperature: 0.3,
    system: SYSTEM,
    messages: [{ role: "user", content: prompt }],
  };

  const { response, data } = await anthropicMessages(apiKey, payload, {
    timeoutMs: 30000,
    endpoint: "day-plan",
  });
  if (!response || !response.ok) {
    throw new ExternalServiceError(
      (data as AnthropicErrorPayload)?.error?.message || "AI error",
      {
        status: response?.status,
        code: "ANTHROPIC_ERROR",
      },
    );
  }

  const out = extractAnthropicText(data);
  const jsonParsed = extractJsonFromText(out);
  const plan = normalizeDayPlan(jsonParsed);

  res.status(200).json({
    plan,
    rawText: plan.meals.length === 0 ? out || null : null,
  });
}
