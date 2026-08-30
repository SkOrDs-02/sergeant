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

export const SYSTEM = `Ти помічник з харчування. Відповідай ТІЛЬКИ українською.
Поверни ТІЛЬКИ валідний JSON без markdown і без додаткового тексту.

Задача: перетвори сирий список продуктів (може бути надиктований, з помилками) у структурований масив.
Нормалізуй назви (однина), витягни кількість і одиниці якщо вказані.

Правила для unit:
- Якщо вказана одиниця виміру (г, кг, мл, л, уп) — використовуй її.
- Якщо вказана кількість, але одиниця НЕ є г/кг/мл/л/уп — встановлюй unit = "шт".
- Якщо кількість не вказана — unit = null.

Правила для дублікатів:
- Якщо один і той самий продукт зустрічається кілька разів — обʼєднуй в один запис.
- Пріоритет має запис з qty та unit; якщо обидва мають qty — суми не додавай, залишай перший.

Що НЕ є продуктом:
- Текст може бути будь-яким — нагадування, справи, нотатки. Бери з нього ЛИШЕ їстівне.
- Нехарчовий запис («запис до стоматолога», «подзвонити мамі», «купити зарядку»)
  пропускай мовчки. Не перетворюй його на позицію комори.
- Якщо їстівного немає взагалі — поверни {"items": []}. Порожній масив це
  правильна відповідь; вигаданий продукт потрапить у комору й зіпсує подальші
  рецепти та списки покупок.

Формат JSON:
{
  "items": [
    { "name": string, "qty": number|null, "unit": string|null, "notes": string|null }
  ]
}
`;

/**
 * Промпт розбору комори — рівно той, що йде в прод (винесено заради стенду
 * `scripts/eval/pipelines.nutrition.ts`).
 */
export function buildParsePantryPrompt(input: {
  text: string;
  locale?: string | undefined;
}): { system: string; user: string } {
  return {
    system: SYSTEM,
    user: `Мова: ${input.locale || "uk-UA"}.\nОсь список продуктів:\n${input.text}`,
  };
}

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

  const prompt = buildParsePantryPrompt(parseBody(ParsePantrySchema, req));

  const provider = getLLMProvider({
    provider: env.LLM_NUTRITION_PROVIDER,
    anthropicApiKey: apiKey,
    openrouterModel: env.OPENROUTER_NUTRITION_MODEL,
  });
  const result = await invokeLLM(provider, {
    model: env.NUTRITION_MODEL,
    // 500 обрізало JSON посеред масиву вже на ~25 позиціях — відповідь
    // не парсилась і користувач втрачав увесь список. 2000 покриває
    // стелю `normalizePantryItems` (80 позицій); довші списки все одно
    // ріжуться там, а обірваний JSON ловить `extractJsonFromText` нижче.
    maxTokens: 2000,
    temperature: 0.2,
    system: prompt.system,
    messages: [{ role: "user", content: prompt.user }],
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
