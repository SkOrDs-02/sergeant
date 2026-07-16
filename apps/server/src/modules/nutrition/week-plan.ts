import type { Request, Response } from "express";
import { extractJsonFromText } from "../../http/jsonSafe.js";
import { parseBody } from "../../http/validate.js";
import { WeekPlanSchema } from "../../http/schemas.js";
import { makeAiProviderError } from "../../obs/errors.js";
import {
  anthropicMessages,
  extractAnthropicText,
} from "../../lib/anthropic.js";
import { pantryPromptSection } from "../../lib/prompt-builders.js";
import { NUTRITION_AI_TIMEOUTS_MS } from "./timeouts.js";

type AnthropicErrorPayload = { error?: { message?: string } };
type WithAnthropicKey = Request & {
  anthropicKey?: string;
  user?: { id: string };
};

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
  const days = Array.isArray(obj["days"]) ? (obj["days"] as unknown[]) : [];
  return {
    days: days.slice(0, 7).map((d, i): WeekDay => {
      if (!d || typeof d !== "object")
        return { label: `День ${i + 1}`, note: "", meals: [] };
      const rec = d as Record<string, unknown>;
      const label = String(rec["label"] || `День ${i + 1}`).slice(0, 40);
      const note = String(rec["note"] || "").slice(0, 500);
      const meals = Array.isArray(rec["meals"])
        ? (rec["meals"] as unknown[])
            .slice(0, 8)
            .map((x) => String(x || "").trim())
            .filter(Boolean)
        : [];
      return { label, note, meals };
    }),
    // Список покупок має окремий явний сценарій у «Коморі». Тижневий план
    // більше не створює другий, неочікуваний список автоматично.
    shoppingList: [],
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
  ]
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
  const userId = (req as WithAnthropicKey).user?.id;

  const {
    pantry: pantryIn,
    preferences,
    locale,
  } = parseBody(WeekPlanSchema, req);

  const prefs = preferences || {};
  const goal = String(prefs.goal || "balanced");
  const loc = String(locale || "uk-UA");

  const pantrySec = pantryPromptSection({
    pantry: pantryIn,
    preset: "weekPlan",
    label: "Продукти вдома",
  });

  const prompt = `Мова: ${loc}. Ціль: ${goal}.
${pantrySec}

Запропонуй приблизний план харчування на 7 днів (коротко, реалістично).
Не створюй список покупок: користувач генерує його окремо у «Коморі».`;

  const payload = {
    model: "claude-sonnet-4-6",
    max_tokens: 2000,
    temperature: 0.25,
    system: SYSTEM,
    messages: [{ role: "user", content: prompt }],
  };

  const { response, data } = await anthropicMessages(apiKey, payload, {
    timeoutMs: NUTRITION_AI_TIMEOUTS_MS.weekPlan,
    endpoint: "week-plan",
    ...(userId ? { userId } : {}),
  });
  if (!response || !response.ok) {
    throw makeAiProviderError({
      rawProviderMessage: (data as AnthropicErrorPayload)?.error?.message,
      status: response?.status,
    });
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
