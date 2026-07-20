import type { Request, Response } from "express";
import { env } from "../../env/env.js";
import { extractJsonFromText } from "../../http/jsonSafe.js";
import { parseBody } from "../../http/validate.js";
import { RecommendRecipesSchema } from "../../http/schemas.js";
import { makeAiProviderError } from "../../obs/errors.js";
import {
  anthropicMessages,
  extractAnthropicText,
} from "../../lib/anthropic.js";
import { pantryPromptSection } from "../../lib/prompt-builders.js";
import { normalizeRecipes } from "../../lib/nutritionResponse.js";
import { NUTRITION_AI_TIMEOUTS_MS } from "./timeouts.js";

type AnthropicErrorPayload = { error?: { message?: string } };
type WithAnthropicKey = Request & {
  anthropicKey?: string;
  user?: { id: string };
};

const SYSTEM = `Ти шеф-кухар і нутріціолог. Відповідай ТІЛЬКИ українською.
Поверни ТІЛЬКИ валідний JSON без markdown і без додаткового тексту.

Задача: запропонувати 2–4 реалістичних рецептів з наявних продуктів.
Не вигадуй інгредієнти. Дозволено додати лише базові "припущення" (сіль, перець, вода, олія) і тоді явно познач їх у tips.
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
 * POST /api/nutrition/recommend-recipes — рецепти з наявних продуктів.
 * CORS / token / quota / rate-limit виставляє роутер.
 */
export default async function handler(
  req: Request,
  res: Response,
): Promise<void> {
  const apiKey = (req as WithAnthropicKey).anthropicKey as string;
  const userId = (req as WithAnthropicKey).user?.id;

  const { pantry: pantryIn, preferences } = parseBody(
    RecommendRecipesSchema,
    req,
  );

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

  const payload = {
    model: env.NUTRITION_MODEL,
    max_tokens: 2800,
    temperature: 0.2,
    system: SYSTEM,
    messages: [{ role: "user", content: prompt }],
  };

  const { response, data } = await anthropicMessages(apiKey, payload, {
    timeoutMs: NUTRITION_AI_TIMEOUTS_MS.recommendRecipes,
    endpoint: "recommend-recipes",
    ...(userId ? { userId } : {}),
  });
  if (!response || !response.ok) {
    throw makeAiProviderError({
      rawProviderMessage: (data as AnthropicErrorPayload)?.error?.message,
      status: response?.status,
    });
  }

  const out = extractAnthropicText(data);

  const jsonParsed = extractJsonFromText(out);
  const recipes = normalizeRecipes(jsonParsed);
  res.status(200).json({
    recipes,
    rawText: recipes.length === 0 ? out || null : null,
  });
}
