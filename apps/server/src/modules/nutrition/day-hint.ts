import type { Request, Response } from "express";
import { env } from "../../env/env.js";
import { extractJsonFromText } from "../../http/jsonSafe.js";
import { parseBody } from "../../http/validate.js";
import { DayHintSchema } from "../../http/schemas.js";
import { makeAiProviderError } from "../../obs/errors.js";
import {
  anthropicMessages,
  extractAnthropicText,
} from "../../lib/anthropic.js";

type AnthropicErrorPayload = { error?: { message?: string } };
type WithAnthropicKey = Request & {
  anthropicKey?: string;
  user?: { id: string };
};

function safeNonNegOrNull(x: unknown): number | null {
  if (x == null || x === "") return null;
  const n = Number(x);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

function normalizeHint(text: unknown): string {
  const t = String(text || "").trim();
  return t.slice(0, 1200);
}

/**
 * POST /api/nutrition/day-hint — коротка порада по денних макросах.
 * CORS / token / quota / rate-limit виставляє роутер.
 */
export default async function handler(
  req: Request,
  res: Response,
): Promise<void> {
  const apiKey = (req as WithAnthropicKey).anthropicKey as string;
  const userId = (req as WithAnthropicKey).user?.id;

  const { macros, targets, locale, hasMeals, hasAnyMacros, macroSources } =
    parseBody(DayHintSchema, req);

  const mRaw = macros || {};
  const m = {
    kcal: safeNonNegOrNull(mRaw.kcal),
    protein_g: safeNonNegOrNull(mRaw.protein_g),
    fat_g: safeNonNegOrNull(mRaw.fat_g),
    carbs_g: safeNonNegOrNull(mRaw.carbs_g),
  };
  const t = targets || {};
  const loc = String(locale || "uk-UA");

  const contextNote =
    hasMeals && !hasAnyMacros
      ? "У журналі є прийоми їжі, але без КБЖВ (макроси не задані). Дай пораду, як краще заповнювати/оцінювати КБЖВ, не звинувачуючи.\n"
      : "";

  const sourcesNote =
    macroSources && typeof macroSources === "object"
      ? `Походження КБЖВ (кількість прийомів): ${JSON.stringify(macroSources)}.\nЯкщо багато AI — обережно формулюй висновки, можеш порадити уточнити вагу/порцію.\n`
      : "";

  /* eslint-disable sergeant-design/no-ellipsis-dots --
     {"hint":"..."} is a JSON-schema format hint for the LLM, not user-facing copy. */
  const prompt = `Мова: ${loc}.
${contextNote}${sourcesNote}Факт за день: ккал ${m.kcal ?? "—"}, білки ${m.protein_g ?? "—"} г, жири ${m.fat_g ?? "—"} г, вуглеводи ${m.carbs_g ?? "—"} г.
Цілі (якщо є): ккал ${t.dailyTargetKcal ?? "—"}, білки ${t.dailyTargetProtein_g ?? "—"}, жири ${t.dailyTargetFat_g ?? "—"}, вуглеводи ${t.dailyTargetCarbs_g ?? "—"}.

Дай 2–4 речення: коротко порівняй з цілями (якщо цілі задані), що добре / що звернути увагу завтра. Без моралізаторства. Відповідь ТІЛЬКИ JSON: {"hint":"..."}`;
  /* eslint-enable sergeant-design/no-ellipsis-dots */

  const payload = {
    model: env.NUTRITION_MODEL,
    max_tokens: 400,
    temperature: 0.3,
    messages: [{ role: "user", content: prompt }],
  };

  const { response, data } = await anthropicMessages(apiKey, payload, {
    timeoutMs: 20000,
    endpoint: "day-hint",
    ...(userId ? { userId } : {}),
  });
  if (!response || !response.ok) {
    throw makeAiProviderError({
      rawProviderMessage: (data as AnthropicErrorPayload)?.error?.message,
      status: response?.status,
    });
  }

  const out = extractAnthropicText(data);
  let hint = "";
  try {
    const jsonParsed = extractJsonFromText(out);
    hint = normalizeHint((jsonParsed as { hint?: unknown } | null)?.hint);
  } catch {
    hint = normalizeHint(out);
  }
  if (!hint) hint = "Не вдалося сформувати підказку.";
  res.status(200).json({ hint });
}
