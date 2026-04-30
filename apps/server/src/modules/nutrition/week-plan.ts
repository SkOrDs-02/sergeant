import type { Request, Response } from "express";
import { extractJsonFromText } from "../../http/jsonSafe.js";
import { validateBody } from "../../http/validate.js";
import { WeekPlanSchema } from "../../http/schemas.js";
import { ExternalServiceError } from "../../obs/errors.js";
import {
  anthropicMessages,
  extractAnthropicText,
} from "../../lib/anthropic.js";
import { formatPantryForPrompt } from "../../lib/pantryFormat.js";

type AnthropicErrorPayload = { error?: { message?: string } };
type WithAnthropicKey = Request & { anthropicKey?: string };

interface WeekDay {
  label: string;
  note: string;
  meals: string[];
}

interface NormalizedWeekPlan {
  days: WeekDay[];
  shoppingList: string[];
}

function normalizeWeekPlan(parsed: unknown): NormalizedWeekPlan {
  const obj =
    parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : ({} as Record<string, unknown>);
  const days = Array.isArray(obj.days) ? (obj.days as unknown[]) : [];
  const shoppingList = Array.isArray(obj.shoppingList)
    ? (obj.shoppingList as unknown[])
    : [];
  return {
    days: days.slice(0, 7).map((d, i): WeekDay => {
      if (!d || typeof d !== "object")
        return { label: `День ${i + 1}`, note: "", meals: [] };
      const rec = d as Record<string, unknown>;
      const label = String(rec.label || `День ${i + 1}`).slice(0, 40);
      const note = String(rec.note || "").slice(0, 500);
      const meals = Array.isArray(rec.meals)
        ? (rec.meals as unknown[])
            .slice(0, 8)
            .map((x) => String(x || "").trim())
            .filter(Boolean)
        : [];
      return { label, note, meals };
    }),
    shoppingList: shoppingList
      .map((x) => String(x || "").trim())
      .filter(Boolean)
      .slice(0, 50),
  };
}

/* eslint-disable sergeant-design/no-ellipsis-dots --
   JSON-schema format hint for the LLM (placeholder-style `"..."` entries), not user-facing copy. */
const SYSTEM = `Ти шеф-кухар і планувальник харчування. Відповідай ТІЛЬКИ українською.
Поверни ТІЛЬКИ валідний JSON без markdown.

Формат:
{
  "days": [
    { "label": "Пн", "note": "коротко", "meals": ["сніданок — ...", "обід — ..."] }
  ],
  "shoppingList": ["продукт (кількість)", "..."]
}
Максимум 7 днів. Не вигадуй екзотичні інгредієнти поза списком — дозволено додати сіль, олію, базові спеції.`;
/* eslint-enable sergeant-design/no-ellipsis-dots */

/**
 * POST /api/nutrition/week-plan — згенерувати план харчування на тиждень.
 * CORS / token / quota / rate-limit виставляє роутер.
 */
export default async function handler(
  req: Request,
  res: Response,
): Promise<void> {
  const apiKey = (req as WithAnthropicKey).anthropicKey as string;

  const parsed = validateBody(WeekPlanSchema, req, res);
  if (!parsed.ok) return;
  const { pantry: pantryIn, preferences, locale } = parsed.data;

  const prefs = preferences || {};
  const goal = String(prefs.goal || "balanced");
  const loc = String(locale || "uk-UA");

  const pantry = formatPantryForPrompt(pantryIn, {
    itemFormat: "nameOnly",
    limit: 50,
    joinWith: "\n- ",
  });

  const prompt = `Мова: ${loc}. Ціль: ${goal}.
Продукти вдома:
- ${pantry}

Запропонуй приблизний план харчування на 7 днів і список покупок того, чого бракує (коротко, реалістично).`;

  const payload = {
    model: "claude-sonnet-4-6",
    max_tokens: 2000,
    temperature: 0.25,
    system: SYSTEM,
    messages: [{ role: "user", content: prompt }],
  };

  const { response, data } = await anthropicMessages(apiKey, payload, {
    timeoutMs: 35000,
    endpoint: "week-plan",
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
  let plan: NormalizedWeekPlan = { days: [], shoppingList: [] };
  try {
    const jsonParsed = extractJsonFromText(out);
    plan = normalizeWeekPlan(jsonParsed);
  } catch {
    plan = { days: [], shoppingList: [] };
  }
  res.status(200).json({ plan, rawText: plan.days.length === 0 ? out : null });
}
