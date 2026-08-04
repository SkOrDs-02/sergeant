import type { Request, Response } from "express";
import type { z } from "zod";
import { env } from "../../env/env.js";
import { extractJsonFromText } from "../../http/jsonSafe.js";
import { parseBody } from "../../http/validate.js";
import { DayHintSchema } from "../../http/schemas.js";
import { makeAiProviderError } from "../../obs/errors.js";
import { getLLMProvider, invokeLLM } from "../../lib/llm/provider.js";
import { VOICE_RULE } from "../chat/toolDefs/systemPrompt.js";

export type DayHintInput = z.infer<typeof DayHintSchema>;

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
 * Промпт денної підказки — рівно той, що йде в прод.
 *
 * AI-CONTEXT: винесено з хендлера заради стенду
 * (`scripts/eval/pipelines.nutrition.ts`). `system` тут немає навмисно —
 * прод шле все одним user-повідомленням; стенд має дзеркалити це, інакше
 * міряє інший режим моделі.
 */
export function buildDayHintPrompt(input: DayHintInput): { user: string } {
  const { macros, targets, locale, hasMeals, hasAnyMacros, macroSources } =
    input;
  const mRaw = macros || {};
  const m = {
    kcal: safeNonNegOrNull(mRaw.kcal),
    protein_g: safeNonNegOrNull(mRaw.protein_g),
    fat_g: safeNonNegOrNull(mRaw.fat_g),
    carbs_g: safeNonNegOrNull(mRaw.carbs_g),
  };
  const t = targets || {};
  const loc = String(locale || "uk-UA");

  const sourcesNote =
    macroSources && typeof macroSources === "object"
      ? `Походження КБЖВ (кількість прийомів): ${JSON.stringify(macroSources)}.\nЯкщо багато AI — обережно формулюй висновки, можеш порадити уточнити вагу/порцію.\n`
      : "";

  // Гілка без макросів отримує ВЛАСНУ задачу, а не примітку поверх спільної.
  //
  // AI-CONTEXT: раніше сюди дописувався `contextNote` («дай пораду, як краще
  // заповнювати КБЖВ»), але решта промпта лишалася незмінною — блок «Цілі»
  // друкував `ккал 2200`, а фінальна інструкція просила «порівняй з цілями».
  // Дві інструкції суперечили одна одній, і моделі слухалися сильнішої:
  // sonnet-4-6 валив цю гілку 12/12, gpt-5.1 — 9/12, будуючи пораду навколо
  // цілі, якої нема з чим порівнювати. Прибрати суперечність можна лише
  // прибравши цілі з поля зору, а не додавши ще одне речення.
  const noMacros = Boolean(hasMeals) && !hasAnyMacros;

  const factsBlock = noMacros
    ? `У журналі є прийоми їжі, але КБЖВ не заповнені — жодного числа за день немає.`
    : `Факт за день: ккал ${m.kcal ?? "—"}, білки ${m.protein_g ?? "—"} г, жири ${m.fat_g ?? "—"} г, вуглеводи ${m.carbs_g ?? "—"} г.
Цілі (якщо є): ккал ${t.dailyTargetKcal ?? "—"}, білки ${t.dailyTargetProtein_g ?? "—"}, жири ${t.dailyTargetFat_g ?? "—"}, вуглеводи ${t.dailyTargetCarbs_g ?? "—"}.`;

  const task = noMacros
    ? `Дай 2–4 речення про те, ЯК зручніше фіксувати КБЖВ (вага порції, готові страви, фото), без звинувачень.
НЕ називай жодних чисел — ні спожитих, ні цільових: порівнювати нема з чим, і будь-яка цифра тут буде вигаданою.`
    : `Дай 2–4 речення: коротко порівняй з цілями (якщо цілі задані), що добре / що звернути увагу завтра. Без моралізаторства.`;

  const prompt = `Мова: ${loc}.
${sourcesNote}${factsBlock}

${task}
${VOICE_RULE}
Відповідь ТІЛЬКИ JSON: {"hint":"..."}`;

  return { user: prompt };
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

  const prompt = buildDayHintPrompt(parseBody(DayHintSchema, req));

  const provider = getLLMProvider({
    provider: env.LLM_NUTRITION_PROVIDER,
    anthropicApiKey: apiKey,
    openrouterModel: env.OPENROUTER_NUTRITION_MODEL,
  });
  const result = await invokeLLM(provider, {
    model: env.NUTRITION_MODEL,
    maxTokens: 400,
    temperature: 0.3,
    messages: [{ role: "user", content: prompt.user }],
    timeoutMs: 20000,
    endpoint: "day-hint",
    ...(userId ? { userId } : {}),
  });
  if (!result.ok) {
    throw makeAiProviderError({
      rawProviderMessage: result.error,
      status: result.status,
    });
  }

  const out = result.text;
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
