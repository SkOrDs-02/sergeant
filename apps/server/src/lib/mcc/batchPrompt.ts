/**
 * Status: Active.
 *
 * Pure prompt-building + response-parsing для batch-категоризації
 * unknown-MCC tx-ів (PR-18 з pr-plan-2026-05, WF-06 mono optimization).
 *
 * Чому окремий модуль: чисті функції — їх тривіально тестувати без
 * Anthropic-моків і без БД. Workflow:
 *
 *   1. `buildBatchPrompt(items)` → `{ system, user }` для `anthropicMessages()`.
 *      `user` — JSON-array `[{i: 0, d: "<masked desc>", a: 4321, m: 5499}, …]`.
 *      Claude інструктовано повернути JSON-array такого ж розміру з
 *      `{i, c, conf}` (index, category, confidence).
 *   2. `parseBatchResponse(rawText, items)` → `{ ok, missing }` мапи.
 *      `ok` — Map<index, CategorizeResult> для items, які Claude поклав
 *      у відповідь з валідною category. `missing` — items, чий index у
 *      відповіді відсутній або category поза enum-ом / parse-fail.
 *
 * Категорії — той самий AI-enum що й у `routes/internal/categorize.ts`
 * (groceries / transport / dining / entertainment / utilities / health /
 * shopping / education / subscriptions / income / transfer / other).
 *
 * Безпека PII (Hard Rule #21): caller MUST pass already-masked descriptions
 * у `UnknownMccItem.description`. `buildBatchPrompt()` НЕ робить mask
 * самостійно, бо це обовʼязок producer-а (`enrichmentWorker.ts`) — який
 * має доступ до raw tx через `mono_transaction.description`. Подвійний
 * mask нічого не зламає, але first-line defense має бути на producer-і.
 */

import type { Category } from "../../routes/internal/categorize.js";
import { CATEGORIES } from "../../routes/internal/categorize.js";
import type { UnknownMccItem } from "./unknownQueue.js";

export interface BatchPromptPayload {
  system: string;
  user: string;
}

export interface BatchCategoryResult {
  category: Category;
  confidence: number;
}

export interface BatchParseResult {
  /** Map index → result для items, де Claude дав валідну відповідь. */
  ok: Map<number, BatchCategoryResult>;
  /** Items, чиї index-и відсутні / невалідні у Claude-response. */
  missing: UnknownMccItem[];
}

const BATCH_SYSTEM_PROMPT =
  "You are a transaction categorizer for a Ukrainian personal finance app. " +
  "You will receive a JSON array of transactions. For EACH transaction return " +
  "one of: groceries, transport, dining, entertainment, utilities, health, " +
  "shopping, education, subscriptions, income, transfer, other. " +
  'Respond with JSON only — an array of {"i": <index>, "c": "<category>", ' +
  '"conf": 0.0-1.0}. Include EVERY input index exactly once. No prose, ' +
  "no markdown fencing.";

/**
 * Build Anthropic system+user prompts для batch-категоризації. `items`
 * пишемо у компактний JSON (`i/d/a/m` коротші за `index/description/…`),
 * що економить input tokens — на batch=100 економія ~30%.
 */
export function buildBatchPrompt(items: UnknownMccItem[]): BatchPromptPayload {
  const payload = items.map((item, index) => {
    const row: Record<string, unknown> = { i: index, d: item.description };
    if (item.amount != null) {
      // Сума у hryvnyas з двома знаками — як у per-row prompt-і.
      row["a"] = Math.abs(item.amount / 100).toFixed(2);
    }
    if (item.mcc != null) row["m"] = item.mcc;
    return row;
  });
  return {
    system: BATCH_SYSTEM_PROMPT,
    user: JSON.stringify(payload),
  };
}

const CATEGORY_SET = new Set<string>(CATEGORIES);

interface RawBatchEntry {
  i?: unknown;
  c?: unknown;
  conf?: unknown;
}

/**
 * Розпарсити Claude-response для batch-prompt-у. Толерантне до
 * markdown-fencing-ів (```json …```) та "пояснень навколо" — шукаємо
 * перший JSON-array у тексті. Items, чий index у parsed-array відсутній
 * або має невалідну category → в `missing`. Items зі ствалідним
 * `{i, c, conf}` → в `ok` мапі.
 *
 * На повний parse-fail (немає JSON-array у тексті) повертаємо ВСІ items
 * у `missing` — caller може повернути їх у буфер для наступного tick-у
 * або redirect у per-row queue.
 */
export function parseBatchResponse(
  raw: string,
  items: UnknownMccItem[],
): BatchParseResult {
  const stripped = raw
    .replace(/```(?:json)?\s*/g, "")
    .replace(/```/g, "")
    .trim();
  const arrayMatch = stripped.match(/\[[\s\S]*\]/);

  const ok = new Map<number, BatchCategoryResult>();
  if (!arrayMatch) {
    return { ok, missing: [...items] };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(arrayMatch[0]);
  } catch {
    return { ok, missing: [...items] };
  }
  if (!Array.isArray(parsed)) {
    return { ok, missing: [...items] };
  }
  for (const entry of parsed as RawBatchEntry[]) {
    if (!entry || typeof entry !== "object") continue;
    const i = entry.i;
    if (typeof i !== "number" || !Number.isInteger(i)) continue;
    if (i < 0 || i >= items.length) continue;
    const c = entry.c;
    if (typeof c !== "string" || !CATEGORY_SET.has(c)) continue;
    const confRaw = entry.conf;
    const confidence =
      typeof confRaw === "number" && Number.isFinite(confRaw)
        ? Math.min(1, Math.max(0, confRaw))
        : 0;
    ok.set(i, { category: c as Category, confidence });
  }

  const missing: UnknownMccItem[] = [];
  for (let i = 0; i < items.length; i += 1) {
    if (!ok.has(i)) {
      const item = items[i];
      if (item) missing.push(item);
    }
  }
  return { ok, missing };
}
