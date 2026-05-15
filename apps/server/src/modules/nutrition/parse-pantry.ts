import type { Request, Response } from "express";
import { extractJsonFromText } from "../../http/jsonSafe.js";
import { parseBody } from "../../http/validate.js";
import { ParsePantrySchema } from "../../http/schemas.js";
import { ExternalServiceError } from "../../obs/errors.js";
import {
  anthropicMessages,
  extractAnthropicText,
} from "../../lib/anthropic.js";
import { normalizePantryItems } from "../../lib/nutritionResponse.js";

type AnthropicErrorPayload = { error?: { message?: string } };
type WithAnthropicKey = Request & { anthropicKey?: string };

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

  const { text: raw, locale } = parseBody(ParsePantrySchema, req);

  const payload = {
    model: "claude-sonnet-4-6",
    max_tokens: 500,
    temperature: 0.2,
    system: SYSTEM,
    messages: [
      {
        role: "user",
        content: `Мова: ${locale || "uk-UA"}.\nОсь список продуктів:\n${raw}`,
      },
    ],
  };

  const { response, data } = await anthropicMessages(apiKey, payload, {
    timeoutMs: 20000,
    endpoint: "parse-pantry",
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
  const items = normalizePantryItems(jsonParsed);
  res.status(200).json({ items, rawText: out || null });
}
