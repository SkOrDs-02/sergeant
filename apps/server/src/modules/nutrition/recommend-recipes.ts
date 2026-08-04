import type { Request, Response } from "express";
import type { z } from "zod";
import { env } from "../../env/env.js";
import { extractJsonFromText } from "../../http/jsonSafe.js";
import { parseBody } from "../../http/validate.js";
import { RecommendRecipesSchema } from "../../http/schemas.js";
import { makeAiProviderError } from "../../obs/errors.js";
import { getLLMProvider, invokeLLM } from "../../lib/llm/provider.js";
import { pantryPromptSection } from "../../lib/prompt-builders.js";
import { normalizeRecipes } from "../../lib/nutritionResponse.js";
import { NUTRITION_AI_TIMEOUTS_MS } from "./timeouts.js";

import { ADVICE_BOUNDARY_RULE } from "../../lib/adviceBoundary.js";

export type RecommendRecipesInput = z.infer<typeof RecommendRecipesSchema>;

type WithAnthropicKey = Request & {
  anthropicKey?: string;
  user?: { id: string };
};

export const SYSTEM = `Ти шеф-кухар і нутріціолог. Відповідай ТІЛЬКИ українською.

${ADVICE_BOUNDARY_RULE}
Поверни ТІЛЬКИ валідний JSON без markdown і без додаткового тексту.

Задача: запропонувати 2–4 реалістичних рецептів з наявних продуктів.
Не вигадуй інгредієнти. Дозволено додати лише базові "припущення" (сіль, перець, вода, олія) і тоді явно познач їх у tips.
Режим комори "only" означає БУКВАЛЬНО тільки те, що є в списку: кожен інгредієнт
рецепта мусить бути в коморі, окрім тих самих базових. Якщо з наявного не
складається жоден пристойний рецепт — поверни менше рецептів або порожній
"recipes". Рецепт із продуктом, якого в користувача немає, гірший за відсутність
рецепта: людина стане готувати й зупиниться на середині.
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
  const pantryMode = String(prefs.pantryMode || "prefer");
  const locale = String(prefs.locale || "uk-UA");

  const pantrySec = pantryPromptSection({
    pantry: pantryIn,
    preset: "recipes",
  });

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
Якщо продуктів мало — все одно поверни 2 прості рецепти.`;

  return { system: SYSTEM, user: prompt };
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
