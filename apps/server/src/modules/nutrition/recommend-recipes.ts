import type { Request, Response } from "express";
import { extractJsonFromText } from "../../http/jsonSafe.js";
import { validateBody } from "../../http/validate.js";
import { RecommendRecipesSchema } from "../../http/schemas.js";
import { ExternalServiceError } from "../../obs/errors.js";
import {
  anthropicMessages,
  extractAnthropicText,
} from "../../lib/anthropic.js";
import { formatPantryForPrompt } from "../../lib/pantryFormat.js";
import { normalizeRecipes } from "../../lib/nutritionResponse.js";

type AnthropicErrorPayload = { error?: { message?: string } };
type WithAnthropicKey = Request & { anthropicKey?: string };

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

  const parsed = validateBody(RecommendRecipesSchema, req, res);
  if (!parsed.ok) return;
  const { pantry: pantryIn, preferences } = parsed.data;

  const prefs = preferences || {};
  const goal = String(prefs.goal || "balanced");
  const servings = Number(prefs.servings || 1);
  const timeMinutes = Number(prefs.timeMinutes || 25);
  const exclude = String(prefs.exclude || "");
  const locale = String(prefs.locale || "uk-UA");

  const pantry = formatPantryForPrompt(pantryIn, {
    itemFormat: "nameQuantityNotes",
    limit: 60,
    joinWith: "\n- ",
  });

  const prompt = `Мова: ${locale}.
Ціль: ${goal}.
Порції: ${Number.isFinite(servings) && servings > 0 ? servings : 1}.
Час: ${Number.isFinite(timeMinutes) && timeMinutes > 0 ? timeMinutes : 25} хв.
Не використовувати/алергени: ${exclude || "—"}.

Наявні продукти:
- ${pantry}

Поверни 3 рецепти.
Обмеження формату:
- steps: максимум 7 кроків
- tips: максимум 4 поради
- ingredients: тільки ключові позиції
Якщо продуктів мало — все одно поверни 2 прості рецепти.`;

  const payload = {
    model: "claude-sonnet-4-6",
    max_tokens: 2800,
    temperature: 0.2,
    system: SYSTEM,
    messages: [{ role: "user", content: prompt }],
  };

  const { response, data } = await anthropicMessages(apiKey, payload, {
    timeoutMs: 45000,
    endpoint: "recommend-recipes",
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
  const recipes = normalizeRecipes(jsonParsed);
  res.status(200).json({
    recipes,
    rawText: recipes.length === 0 ? out || null : null,
  });
}
