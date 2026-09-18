import type { Request, Response } from "express";
import type { z } from "zod";
import { env } from "../../env/env.js";
import { extractJsonFromText } from "../../http/jsonSafe.js";
import { parseBody } from "../../http/validate.js";
import { ShoppingListSchema } from "../../http/schemas.js";
import { ValidationError, makeAiProviderError } from "../../obs/errors.js";
import { getLLMProvider, invokeLLM } from "../../lib/llm/provider.js";
import { pantryPromptSection } from "../../lib/prompt-builders.js";
import { NUTRITION_AI_TIMEOUTS_MS } from "./timeouts.js";

export type ShoppingListInput = z.infer<typeof ShoppingListSchema>;

type WithAnthropicKey = Request & {
  anthropicKey?: string;
  user?: { id: string };
};

interface ShoppingItem {
  id: string;
  name: string;
  quantity: string;
  note: string;
  checked: false;
}

interface ShoppingCategory {
  name: string;
  items: ShoppingItem[];
}

export const SYSTEM = `Ти помічник з планування покупок і харчування. Відповідай ТІЛЬКИ українською.
Поверни ТІЛЬКИ валідний JSON без markdown і без додаткового тексту.

Формат JSON:
{
  "categories": [
    {
      "name": string,
      "items": [
        { "name": string, "quantity": string, "note": string }
      ]
    }
  ]
}

Категорії (використовуй лише доречні):
"Мʼясо та риба", "Молочні продукти", "Овочі та гриби", "Фрукти", "Крупи та злаки",
"Хлібобулочні вироби", "Яйця", "Олії та жири", "Приправи та соуси", "Напої", "Інше"

Правила класифікації:
- Гриби (печериці, шампіньйони, лисички, гливи тощо) → "Овочі та гриби"
- Молоко, сир, йогурт, вершки, масло, кефір → "Молочні продукти"
- Мʼясо, птиця, риба, морепродукти → "Мʼясо та риба"
- Яйця → "Яйця"

ГОЛОВНЕ ПРАВИЛО — що НЕ потрапляє в список:
1. Продукт уже є в коморі (блок нижче). Пройдись по коморі ПЕРЕД тим, як
   писати список, і викресли кожен збіг. Купити вдруге те, що лежить удома, —
   найдорожча помилка цього екрана.
2. Продукту немає в жодному рецепті. Ні солі, ні спецій, ні олії, ні «базових»
   про запас — нічого, чого ти не бачив у списку інгредієнтів вище.
3. Продукт уже є в списку. Той самий продукт із кількох рецептів — ОДИН пункт
   із підсумованою кількістю.

Усе потрібне вже вдома — поверни {"categories": []}. Порожній список це
правильна відповідь, а не помилка: вигаданий пункт відправить людину в магазин
по те, що їй не потрібно.

Оформлення:
- quantity: вказуй кількість (напр. "500 г", "1 шт", "2 пачки")
- note: якщо потрібна порада або уточнення — додай стисло, інакше ""`;

/**
 * Промпт списку покупок — рівно той, що йде в прод (винесено заради стенду
 * `scripts/eval/pipelines.nutrition.ts`).
 *
 * Кидає `ValidationError`, коли нема ні рецептів, ні тижневого плану —
 * інваріант лишається на місці, лише переїхав разом зі своїм єдиним
 * користувачем.
 */
export function buildShoppingListPrompt(input: ShoppingListInput): {
  system: string;
  user: string;
} {
  const { recipes, weekPlan, pantryItems, locale } = input;
  const loc = String(locale || "uk-UA");

  const pantrySec = pantryPromptSection({
    pantry: pantryItems,
    preset: "shoppingList",
    label: "Що вже є в коморі (НЕ додавай до списку покупок)",
  });

  let ingredientsList = "";

  if (Array.isArray(recipes) && recipes.length > 0) {
    ingredientsList = recipes
      .map((r) => {
        const title = r?.title || "Рецепт";
        const ings = Array.isArray(r?.ingredients)
          ? r.ingredients.join(", ")
          : "";
        return `• ${title}: ${ings || "без деталей"}`;
      })
      .join("\n");
  } else if (
    weekPlan &&
    Array.isArray(weekPlan.days) &&
    weekPlan.days.length > 0
  ) {
    ingredientsList = weekPlan.days
      .map((d) => {
        const day = d?.label || "День";
        const meals = Array.isArray(d?.meals) ? d.meals.join("; ") : "";
        return `• ${day}: ${meals}`;
      })
      .join("\n");
  }

  if (!ingredientsList) {
    throw new ValidationError("Потрібно передати рецепти або тижневий план.");
  }

  const prompt = `Мова: ${loc}.

${pantrySec}

Страви / рецепти з яких треба скласти список покупок:
${ingredientsList}

Склади список покупок, виключи все що вже є в коморі, згрупуй за категоріями.`;

  return { system: SYSTEM, user: prompt };
}

/**
 * POST /api/nutrition/shopping-list — скласти список покупок з рецептів.
 * CORS / token / quota / rate-limit виставляє роутер.
 */
export default async function handler(
  req: Request,
  res: Response,
): Promise<void> {
  const apiKey = (req as WithAnthropicKey).anthropicKey as string;
  const userId = (req as WithAnthropicKey).user?.id;

  const prompt = buildShoppingListPrompt(parseBody(ShoppingListSchema, req));

  const provider = getLLMProvider({
    provider: env.LLM_NUTRITION_PROVIDER,
    anthropicApiKey: apiKey,
    openrouterModel: env.OPENROUTER_NUTRITION_MODEL,
  });
  const result = await invokeLLM(provider, {
    model: env.NUTRITION_MODEL,
    maxTokens: 1200,
    temperature: 0.15,
    system: prompt.system,
    messages: [{ role: "user", content: prompt.user }],
    timeoutMs: NUTRITION_AI_TIMEOUTS_MS.shoppingList,
    endpoint: "shopping-list",
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

  const obj: Record<string, unknown> =
    jsonParsed && typeof jsonParsed === "object" && !Array.isArray(jsonParsed)
      ? (jsonParsed as Record<string, unknown>)
      : {};

  const seenNames = new Set<string>();
  const normalize = (s: string): string =>
    s.toLowerCase().replace(/\s+/g, " ").trim();

  const rawCategories = Array.isArray(obj["categories"])
    ? (obj["categories"] as unknown[])
    : [];

  const categories: ShoppingCategory[] = rawCategories
    .map((cat): ShoppingCategory | null => {
      if (!cat || typeof cat !== "object") return null;
      const catRec = cat as Record<string, unknown>;
      const name = String(catRec["name"] || "Інше").trim();
      const rawItems = Array.isArray(catRec["items"])
        ? (catRec["items"] as unknown[])
        : [];
      const items = rawItems
        .map((item): ShoppingItem | null => {
          if (!item || typeof item !== "object") return null;
          const itemRec = item as Record<string, unknown>;
          const itemName = String(itemRec["name"] || "").trim();
          if (!itemName) return null;
          const key = normalize(itemName);
          if (seenNames.has(key)) return null;
          seenNames.add(key);
          return {
            id: `si_${Date.now()}_${crypto.randomUUID()}`,
            name: itemName,
            quantity: String(itemRec["quantity"] || "").trim(),
            note: String(itemRec["note"] || "").trim(),
            checked: false,
          };
        })
        .filter((v): v is ShoppingItem => Boolean(v));
      if (items.length === 0) return null;
      return { name, items };
    })
    .filter((v): v is ShoppingCategory => Boolean(v));

  res.status(200).json({
    categories,
    rawText: categories.length === 0 ? out || null : null,
  });
}
