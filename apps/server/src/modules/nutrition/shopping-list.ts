import type { Request, Response } from "express";
import { extractJsonFromText } from "../../http/jsonSafe.js";
import { validateBody } from "../../http/validate.js";
import { ShoppingListSchema } from "../../http/schemas.js";
import { ValidationError, ExternalServiceError } from "../../obs/errors.js";
import {
  anthropicMessages,
  extractAnthropicText,
} from "../../lib/anthropic.js";
import { formatPantryForPrompt } from "../../lib/pantryFormat.js";

type AnthropicErrorPayload = { error?: { message?: string } };
type WithAnthropicKey = Request & { anthropicKey?: string };

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

const SYSTEM = `Ти помічник з планування покупок і харчування. Відповідай ТІЛЬКИ українською.
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
"М'ясо та риба", "Молочні продукти", "Овочі та гриби", "Фрукти", "Крупи та злаки",
"Хлібобулочні вироби", "Яйця", "Олії та жири", "Приправи та соуси", "Напої", "Інше"

Правила класифікації:
- Гриби (печериці, шампіньйони, лисички, гливи тощо) → "Овочі та гриби"
- Молоко, сир, йогурт, вершки, масло, кефір → "Молочні продукти"
- М'ясо, птиця, риба, морепродукти → "М'ясо та риба"
- Яйця → "Яйця"

Правила:
- КОЖЕН продукт має з'явитися в списку ЛИШЕ ОДИН РАЗ — якщо той самий продукт є в кількох рецептах, об'єднай у один пункт і підсумуй кількість
- ВИКЛЮЧАЙ продукти, що вже є в коморі (pantry)
- quantity: вказуй кількість (напр. "500 г", "1 шт", "2 пачки")
- note: якщо потрібна порада або уточнення — додай стисло, інакше ""
- Якщо список покупок порожній (все є в коморі) — поверни порожній масив categories`;

/**
 * POST /api/nutrition/shopping-list — скласти список покупок з рецептів.
 * CORS / token / quota / rate-limit виставляє роутер.
 */
export default async function handler(
  req: Request,
  res: Response,
): Promise<void> {
  const apiKey = (req as WithAnthropicKey).anthropicKey as string;

  const parsed = validateBody(ShoppingListSchema, req, res);
  if (!parsed.ok) return;
  const { recipes, weekPlan, pantryItems, locale } = parsed.data;
  const loc = String(locale || "uk-UA");

  const pantryStr = formatPantryForPrompt(pantryItems, {
    itemFormat: "nameOnly",
    joinWith: ", ",
    fallbackWhenEmpty: "нічого",
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

Що вже є в коморі (НЕ додавай до списку покупок):
${pantryStr}

Страви / рецепти з яких треба скласти список покупок:
${ingredientsList}

Склади список покупок, виключи все що вже є в коморі, згрупуй за категоріями.`;

  const payload = {
    model: "claude-sonnet-4-6",
    max_tokens: 1200,
    temperature: 0.15,
    system: SYSTEM,
    messages: [{ role: "user", content: prompt }],
  };

  const { response, data } = await anthropicMessages(apiKey, payload, {
    timeoutMs: 25000,
    endpoint: "shopping-list",
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

  const obj: Record<string, unknown> =
    jsonParsed && typeof jsonParsed === "object" && !Array.isArray(jsonParsed)
      ? (jsonParsed as Record<string, unknown>)
      : {};

  const seenNames = new Set<string>();
  const normalize = (s: string): string =>
    s.toLowerCase().replace(/\s+/g, " ").trim();

  const rawCategories = Array.isArray(obj.categories)
    ? (obj.categories as unknown[])
    : [];

  const categories: ShoppingCategory[] = rawCategories
    .map((cat): ShoppingCategory | null => {
      if (!cat || typeof cat !== "object") return null;
      const catRec = cat as Record<string, unknown>;
      const name = String(catRec.name || "Інше").trim();
      const rawItems = Array.isArray(catRec.items)
        ? (catRec.items as unknown[])
        : [];
      const items = rawItems
        .map((item): ShoppingItem | null => {
          if (!item || typeof item !== "object") return null;
          const itemRec = item as Record<string, unknown>;
          const itemName = String(itemRec.name || "").trim();
          if (!itemName) return null;
          const key = normalize(itemName);
          if (seenNames.has(key)) return null;
          seenNames.add(key);
          return {
            id: `si_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
            name: itemName,
            quantity: String(itemRec.quantity || "").trim(),
            note: String(itemRec.note || "").trim(),
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
