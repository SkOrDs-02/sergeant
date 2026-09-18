import type { Request, Response } from "express";
import type { z } from "zod";
import type { PantryMode } from "@sergeant/shared";
import { env } from "../../env/env.js";
import { extractJsonFromText } from "../../http/jsonSafe.js";
import { parseBody } from "../../http/validate.js";
import { RecommendRecipesSchema } from "../../http/schemas.js";
import { makeAiProviderError } from "../../obs/errors.js";
import { getLLMProvider, invokeLLM } from "../../lib/llm/provider.js";
import {
  pantryPromptSection,
  resolvePantryMode,
} from "../../lib/prompt-builders.js";
import { normalizeRecipes } from "../../lib/nutritionResponse.js";
import { NUTRITION_AI_TIMEOUTS_MS } from "./timeouts.js";

import { ADVICE_BOUNDARY_RULE } from "../../lib/adviceBoundary.js";

export type RecommendRecipesInput = z.infer<typeof RecommendRecipesSchema>;

type WithAnthropicKey = Request & {
  anthropicKey?: string;
  user?: { id: string };
};

/**
 * Задача + правило комори. У `prefer`/`only` вона звучить як «рецепти з
 * наявних продуктів, не вигадуй інгредієнти»; у `ignore` це формулювання
 * прямо суперечило б вибору користувача, тож підмінюється цілком.
 */
const TASK_RULE: Record<PantryMode, string> = {
  prefer: `Задача: запропонувати 2–4 реалістичних рецепти під ціль користувача.
Віддавай перевагу продуктам із комори, коли вони пасують. За потреби можна додати
звичайні доступні продукти поза списком — просто назви їх в ingredients, не видавай
за те, що вже є вдома.`,
  only: `Задача: запропонувати 2–4 реалістичних рецептів з наявних продуктів.
Не вигадуй інгредієнти. Дозволено додати лише базові "припущення" (сіль, перець, вода, олія) і тоді явно познач їх у tips.
Режим комори "only" означає БУКВАЛЬНО тільки те, що є в списку: кожен інгредієнт
рецепта мусить бути в коморі, окрім тих самих базових. Якщо з наявного не
складається жоден пристойний рецепт — поверни менше рецептів або порожній
"recipes". Рецепт із продуктом, якого в користувача немає, гірший за відсутність
рецепта: людина стане готувати й зупиниться на середині.`,
  ignore: `Задача: запропонувати 2–4 реалістичних рецептів під ціль користувача.
Комору не враховуй — списку наявних продуктів тобі свідомо не передано. Бери будь-які звичайні доступні продукти й не припускай, що саме є вдома.`,
};

export function buildRecommendRecipesSystem(
  mode: PantryMode = "prefer",
): string {
  return `Ти шеф-кухар і нутріціолог. Відповідай ТІЛЬКИ українською.

${ADVICE_BOUNDARY_RULE}
Поверни ТІЛЬКИ валідний JSON без markdown і без додаткового тексту.

${TASK_RULE[mode]}
Дай короткі поради по приготуванню і безпеці (температура/час) без зайвої води.
ВАЖЛИВО: відповідь має бути КОРОТКА і НЕ Обрізана. Якщо не вміщається — поверни МЕНШЕ рецептів і/або коротші steps/tips.

Формат JSON:
{
  "recipes": [
    {
      "title": string,
      "timeMinutes": number|null,
      "servings": number|null,
      "ingredients": string[],
      "steps": string[],
      "tips": string[],
      "macros": { "kcal": number|null, "protein_g": number|null, "fat_g": number|null, "carbs_g": number|null }
    }
  ]
}
`;
}

/** Дефолтний system-промпт (`prefer`) — сумісність зі старими імпортами. */
export const SYSTEM = buildRecommendRecipesSystem("prefer");

/**
 * Промпт рекомендації рецептів — рівно той, що йде в прод (винесено заради
 * стенду `scripts/eval/pipelines.nutrition.ts`).
 */
export function buildRecommendRecipesPrompt(input: RecommendRecipesInput): {
  system: string;
  user: string;
} {
  const { pantry: pantryIn, preferences } = input;
  const prefs = preferences || {};
  const goal = String(prefs.goal || "balanced");
  const servings = Number(prefs.servings || 1);
  const timeMinutes = Number(prefs.timeMinutes || 25);
  const exclude = String(prefs.exclude || "");
  const mealType = String(prefs.mealType || "any");
  // Один режим на весь запит — і в секцію комори, і в system-промпт.
  const pantryMode: PantryMode = resolvePantryMode(prefs.pantryMode);
  const locale = String(prefs.locale || "uk-UA");

  const pantrySec = pantryPromptSection({
    pantry: pantryIn,
    preset: "recipes",
    mode: pantryMode,
  });

  const scarcityRule =
    pantryMode === "only"
      ? "Якщо з наявного не складаються 3 рецепти — поверни менше або порожній recipes; відсутніх продуктів не додавай."
      : "Якщо продуктів у коморі мало, добирай звичайні доступні продукти відповідно до обраного режиму.";

  const prompt = `Мова: ${locale}.
Ціль: ${goal}.
Порції: ${Number.isFinite(servings) && servings > 0 ? servings : 1}.
Час: ${Number.isFinite(timeMinutes) && timeMinutes > 0 ? timeMinutes : 25} хв.
Не використовувати/алергени: ${exclude || "—"}.
Тип прийому їжі: ${mealType === "any" ? "будь-який" : mealType}.
Режим комори: ${pantryMode} (prefer — віддай перевагу наявному; only — тільки наявне; ignore — не обмежуй рецепт коморою).

${pantrySec}

Поверни 3 рецепти.
Обмеження формату:
- steps: максимум 7 кроків
- tips: максимум 4 поради
- ingredients: тільки ключові позиції
${scarcityRule}`;

  return { system: buildRecommendRecipesSystem(pantryMode), user: prompt };
}

/**
 * POST /api/nutrition/recommend-recipes — рецепти з наявних продуктів.
 * CORS / token / quota / rate-limit виставляє роутер.
 */
export default async function handler(
  req: Request,
  res: Response,
): Promise<void> {
  const apiKey = (req as WithAnthropicKey).anthropicKey as string;
  const userId = (req as WithAnthropicKey).user?.id;

  const prompt = buildRecommendRecipesPrompt(
    parseBody(RecommendRecipesSchema, req),
  );

  const provider = getLLMProvider({
    provider: env.LLM_NUTRITION_PROVIDER,
    anthropicApiKey: apiKey,
    openrouterModel: env.OPENROUTER_NUTRITION_MODEL,
  });
  const result = await invokeLLM(provider, {
    model: env.NUTRITION_MODEL,
    maxTokens: 2800,
    temperature: 0.2,
    system: prompt.system,
    messages: [{ role: "user", content: prompt.user }],
    timeoutMs: NUTRITION_AI_TIMEOUTS_MS.recommendRecipes,
    endpoint: "recommend-recipes",
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
  const recipes = normalizeRecipes(jsonParsed);
  res.status(200).json({
    recipes,
    rawText: recipes.length === 0 ? out || null : null,
  });
}
