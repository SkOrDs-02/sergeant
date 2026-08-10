import type { Request, Response } from "express";
import type { z } from "zod";
import type { PantryMode } from "@sergeant/shared";
import { env } from "../../env/env.js";
import { extractJsonFromText } from "../../http/jsonSafe.js";
import { parseBody } from "../../http/validate.js";
import { WeekPlanSchema } from "../../http/schemas.js";
import { makeAiProviderError } from "../../obs/errors.js";
import { getLLMProvider, invokeLLM } from "../../lib/llm/provider.js";
import { pantryPromptSection } from "../../lib/prompt-builders.js";
import { NUTRITION_AI_TIMEOUTS_MS } from "./timeouts.js";

import { ADVICE_BOUNDARY_RULE } from "../../lib/adviceBoundary.js";

export type WeekPlanInput = z.infer<typeof WeekPlanSchema>;

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

/**
 * Правило комори в system-промпті.
 *
 * AI-CONTEXT: у `prefer`/`only` тут стоїть «не вигадуй інгредієнти поза
 * списком» — фактично жорстке обмеження коморою. Саме воно робило вибір
 * «не враховувати комору» невидимим: навіть порожній список читався як
 * «нічого поза ним не можна». Для `ignore` обмеження мусить зникнути разом
 * зі списком.
 */
const PANTRY_RULE: Record<PantryMode, string> = {
  prefer:
    "Не вигадуй екзотичні інгредієнти поза списком — дозволено додати сіль, олію, базові спеції.",
  only: "Використовуй ТІЛЬКИ продукти зі списку — дозволено додати сіль, олію, базові спеції.",
  ignore:
    "Комору не враховуй: списку наявних продуктів тобі не передано, тож склади план вільно зі звичайних доступних продуктів. Не вигадуй, що є вдома.",
};

export function buildWeekPlanSystem(mode: PantryMode = "prefer"): string {
  return `Ти шеф-кухар і планувальник харчування. Відповідай ТІЛЬКИ українською.

${ADVICE_BOUNDARY_RULE}
Поверни ТІЛЬКИ валідний JSON без markdown.

Формат:
{
  "days": [
    { "label": "Пн", "note": "коротко", "meals": ["сніданок — ...", "обід — ..."] }
  ]
}
Максимум 7 днів. ${PANTRY_RULE[mode]}`;
}

/** Дефолтний system-промпт (`prefer`) — сумісність зі старими імпортами. */
export const SYSTEM = buildWeekPlanSystem("prefer");

/**
 * Промпт тижневого плану — рівно той, що йде в прод (винесено заради стенду
 * `scripts/eval/pipelines.nutrition.ts`).
 */
export function buildWeekPlanPrompt(input: WeekPlanInput): {
  system: string;
  user: string;
} {
  const { pantry: pantryIn, pantryMode, preferences, locale } = input;
  const prefs = preferences || {};
  const goal = String(prefs.goal || "balanced");
  const loc = String(locale || "uk-UA");
  const mode: PantryMode = pantryMode ?? "prefer";

  const pantrySec = pantryPromptSection({
    pantry: pantryIn,
    preset: "weekPlan",
    label: "Продукти вдома",
    mode,
  });

  const prompt = `Мова: ${loc}. Ціль: ${goal}.
${pantrySec}

Запропонуй приблизний план харчування на 7 днів (коротко, реалістично).
Не створюй список покупок: користувач генерує його окремо у «Коморі».`;

  return { system: buildWeekPlanSystem(mode), user: prompt };
}

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

  const prompt = buildWeekPlanPrompt(parseBody(WeekPlanSchema, req));

  const provider = getLLMProvider({
    provider: env.LLM_NUTRITION_PROVIDER,
    anthropicApiKey: apiKey,
    openrouterModel: env.OPENROUTER_NUTRITION_MODEL,
  });
  const result = await invokeLLM(provider, {
    model: env.NUTRITION_MODEL,
    maxTokens: 2000,
    temperature: 0.25,
    system: prompt.system,
    messages: [{ role: "user", content: prompt.user }],
    timeoutMs: NUTRITION_AI_TIMEOUTS_MS.weekPlan,
    endpoint: "week-plan",
    ...(userId ? { userId } : {}),
  });
  if (!result.ok) {
    throw makeAiProviderError({
      rawProviderMessage: result.error,
      status: result.status,
    });
  }

  const out = result.text;
  let plan: NormalizedWeekPlan = { days: [], shoppingList: [] };
  try {
    const jsonParsed = extractJsonFromText(out);
    plan = normalizeWeekPlan(jsonParsed);
  } catch {
    plan = { days: [], shoppingList: [] };
  }
  res.status(200).json({ plan, rawText: plan.days.length === 0 ? out : null });
}
