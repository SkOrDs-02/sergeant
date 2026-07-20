import type { Request, Response } from "express";
import { env } from "../../env/env.js";
import { extractJsonFromText } from "../../http/jsonSafe.js";
import { parseBody } from "../../http/validate.js";
import { ParsePantrySchema } from "../../http/schemas.js";
import { makeAiProviderError } from "../../obs/errors.js";
import { getLLMProvider, invokeLLM } from "../../lib/llm/provider.js";
import { normalizePantryItems } from "../../lib/nutritionResponse.js";

type WithAnthropicKey = Request & {
  anthropicKey?: string;
  user?: { id: string };
};

const SYSTEM = `Ти помічник з харчування. Відповідай ТІЛЬКИ українською.
Поверни ТІЛЬКИ валідний JSON без markdown і без додаткового тексту.

Задача: перетвори сирий список продуктів (може бути надиктований, з помилками) у структурований масив.
Нормалізуй назви (однина), витягни кількість і одиниці якщо вказані.

Правила для unit:
- Якщо вказана одиниця виміру (г, кг, мл, л, уп) — використовуй її.
- Якщо вказана кількість, але одиниця НЕ є г/кг/мл/л/уп — встановлюй unit = "шт".
- Якщо кількість не вказана — unit = null.

Правила для дублікатів:
- Якщо один і той самий продукт зустрічається кілька разів — об'єднуй в один запис.
- Пріоритет має запис з qty та unit; якщо обидва мають qty — суми не додавай, залишай перший.

Формат JSON:
{
  "items": [
    { "name": string, "qty": number|null, "unit": string|null, "notes": string|null }
  ]
}
`;

/**
 * POST /api/nutrition/parse-pantry — розпарсити сирий список продуктів.
 * CORS / token / quota / rate-limit виставляє роутер.
 */
export default async function handler(
  req: Request,
  res: Response,
): Promise<void> {
  const apiKey = (req as WithAnthropicKey).anthropicKey as string;
  const userId = (req as WithAnthropicKey).user?.id;

  const { text: raw, locale } = parseBody(ParsePantrySchema, req);

  const provider = getLLMProvider({
    provider: env.LLM_NUTRITION_PROVIDER,
    anthropicApiKey: apiKey,
    openrouterModel: env.OPENROUTER_NUTRITION_MODEL,
  });
  const result = await invokeLLM(provider, {
    model: env.NUTRITION_MODEL,
    maxTokens: 500,
    temperature: 0.2,
    system: SYSTEM,
    messages: [
      {
        role: "user",
        content: `Мова: ${locale || "uk-UA"}.\nОсь список продуктів:\n${raw}`,
      },
    ],
    timeoutMs: 20000,
    endpoint: "parse-pantry",
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
  const items = normalizePantryItems(jsonParsed);
  res.status(200).json({ items, rawText: out || null });
}
