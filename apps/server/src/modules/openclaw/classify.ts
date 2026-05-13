/**
 * Stage 4c — Layer 1 cheap-router classifier (Haiku).
 *
 * Один короткий LLM-call (~200 токенів вхідні / ~80 вихідні) до Anthropic
 * Haiku, який класифікує inbound user message на one of:
 *
 *   - routine_metrics — питання про поточні цифри (revenue, signups, sentry…)
 *   - routine_recall  — запит на згадку («що ми вирішили по X»)
 *   - routine_remind  — встановити нагадування / cron
 *   - thinking        — потрібен синтез, decision, planning, code review
 *   - chat            — світська бесіда / уточнення
 *
 * Плагін (`packages/openclaw-plugin/src/hooks/cheap-router.ts`) сам
 * вирішує що робити з класифікацією:
 *
 *   - `routine_*` → resolves to Layer 0 shortcut slug → execute → return text
 *   - `chat`     → return Haiku's own `chat_response` (1-2 речення)
 *   - `thinking` → fall through to Layer 2 (full agent)
 *
 * Чому endpoint на server, а не прямий Anthropic call із plugin:
 *   - `ANTHROPIC_API_KEY` ніколи не покидає server-side (Hard Rule #20:
 *     `apps/server` — єдина точка довіри для third-party credentials).
 *   - Reuses `lib/anthropic.ts` wrapper: метрики, redaction, AI span.
 *   - Симетрично з `categorize.ts` — той самий patern: helper + route.
 *
 * Failure modes:
 *   - Anthropic 5xx / network error → throws; route handler maps to 502.
 *   - Empty / malformed JSON → falls back to `{ class: "chat" }` так само як
 *     `parseCategory` робить fallback на "other". Caller (plugin hook) бачить
 *     `class: "chat"` без `chat_response` і просто пропускає до Layer 2.
 */

import { env } from "../../env/env.js";
import { extractJsonFromText } from "../../http/jsonSafe.js";
import {
  getLLMProvider,
  invokeLLM,
  type LLMBreadcrumbFn,
  type LLMProvider,
} from "../../lib/llm/provider.js";

/**
 * Allowed classification classes. Must stay in sync with the plugin-side
 * `CheapRouterClassSchema` in `packages/openclaw-plugin/src/cheap-router/`.
 */
export const CHEAP_ROUTER_CLASSES = [
  "routine_metrics",
  "routine_recall",
  "routine_remind",
  "thinking",
  "chat",
] as const;

export type CheapRouterClass = (typeof CHEAP_ROUTER_CLASSES)[number];

/**
 * Parsed classification — shape used by the plugin hook and any future
 * consumer. `params` lets the prompt suggest extra structured args (e.g.
 * `{ "params": { "topic": "stripe" } }` for routine_recall).
 */
export interface CheapRouterClassification {
  class: CheapRouterClass;
  shortcut?: string | null;
  persona?: string | null;
  params?: Record<string, unknown> | null;
  chat_response?: string | null;
}

export interface ClassifyMessageArgs {
  userMessage: string;
  /**
   * Override system prompt — used by the plugin when it has loaded a
   * canonical prompt from `ops/openclaw/cheap-router.system.md`. Falls back
   * to `DEFAULT_CHEAP_ROUTER_SYSTEM_PROMPT` when not provided so the route
   * is always callable without a prompt round-trip.
   */
  systemPrompt?: string;
}

/**
 * Canonical embedded fallback prompt. Byte-for-byte mirror of
 * `ops/openclaw/cheap-router.system.md` (the single source of truth on the
 * Gateway volume) after `stripHtmlComments(...).trim()`. Drift gate enforced
 * by `classify.test.ts § DEFAULT_CHEAP_ROUTER_SYSTEM_PROMPT mirrors the
 * Gateway-side file` — any change to either side without the other is a
 * hard failure in CI.
 *
 * Includes a persona preamble + identity-escalation rule so Layer 1 chat
 * answers ВІД ІМЕНІ Сергія, not as Claude/assistant; identity questions
 * always escalate to Layer 2 (full SKILL.md persona stack).
 */
export const DEFAULT_CHEAP_ROUTER_SYSTEM_PROMPT = [
  "Ти — Сергій, cofounder Sergeant-у і права рука founder-а (Дмитра).",
  "Ukrainian, прямий tone, без bullshit. Опонент-режим за замовч.",
  "",
  "Завдання — класифікуй кожне повідомлення founder-а у такі класи:",
  "A) routine_metrics — питання про поточні цифри (revenue, signups, PR queue, sentry, status)",
  "B) routine_recall — запит на згадку («що ми вирішили по X», «де я писав про Y»)",
  "C) routine_remind — встановити нагадування / cron",
  "D) thinking — потрібен синтез, decision, planning, code review АБО identity-питання («хто ти», «ти Claude?», «представся», «who are you», similar)",
  "E) chat — світська бесіда / коротке уточнення (НЕ identity-питання)",
  "",
  'Output JSON: { "class": "…", "shortcut": "…"|null, "persona": "…"|null, "params": {…}|null, "chat_response": "…"|null }',
  "",
  "Rules:",
  "",
  "- Identity-питання («хто ти», «ти Claude?», «представся», «who are you», similar) → ЗАВЖДИ class=thinking, persona=cofounder, chat_response=null. Ніколи не відповідай verbatim — Layer 2 з повною persona stack з SKILL.md відіграє identity з тоном Сергія.",
  "- If class=chat (тільки small-talk, НЕ identity): chat_response — 1-2 речення українською ВІД ІМЕНІ Сергія (cofounder, прямий tone). НЕ представляйся як Claude / AI / language model / assistant.",
  "- If class=thinking, optionally suggest persona (eng/growth/finance/devops/pm/data/content/seo/cs/cofounder).",
  "- If class starts with routine\\_, suggest the most appropriate shortcut slug.",
  "- shortcut slugs: metrics, runway, status, sentry, stripe, posthog, prs, releases, builds, workflows, refresh_metrics, heartbeat, recall, decisions, digest, remind.",
  "- Output ONLY valid JSON, no markdown fencing.",
].join("\n");

/**
 * Parses the raw Haiku text. Tolerates markdown fencing (```json …```), free
 * text around the JSON, missing optional fields, and unknown classes.
 *
 * Fallback shape: `{ class: "chat" }` — caller treats it як «не вгадав, нехай
 * lower-level layer вирішує» (Layer 2 full agent у поточному дизайні).
 */
export function parseClassification(raw: string): CheapRouterClassification {
  const parsed = extractJsonFromText(raw);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return { class: "chat" };
  }

  const obj = parsed as Record<string, unknown>;
  const rawClass = obj["class"];
  const cls = CHEAP_ROUTER_CLASSES.includes(rawClass as CheapRouterClass)
    ? (rawClass as CheapRouterClass)
    : "chat";

  const result: CheapRouterClassification = { class: cls };

  const shortcut = obj["shortcut"];
  if (typeof shortcut === "string" && shortcut.length > 0) {
    result.shortcut = shortcut;
  } else if (shortcut === null) {
    result.shortcut = null;
  }

  const persona = obj["persona"];
  if (typeof persona === "string" && persona.length > 0) {
    result.persona = persona;
  } else if (persona === null) {
    result.persona = null;
  }

  const params = obj["params"];
  if (params && typeof params === "object" && !Array.isArray(params)) {
    result.params = params as Record<string, unknown>;
  } else if (params === null) {
    result.params = null;
  }

  const chatResponse = obj["chat_response"];
  if (typeof chatResponse === "string" && chatResponse.length > 0) {
    result.chat_response = chatResponse;
  } else if (chatResponse === null) {
    result.chat_response = null;
  }

  return result;
}

/**
 * Default stub-response для read-only classifier-у: `class=chat` без
 * `chat_response`. Caller (plugin hook) трактує це як "не вгадав, нехай
 * Layer 2 повний agent відіграє". Підходить для:
 *   - `LLM_READONLY_PROVIDER=stub` у production під час Anthropic outage;
 *   - dev/preview без `ANTHROPIC_API_KEY`;
 *   - e2e-тестів — детермінований, безкоштовний шлях.
 */
const STUB_CLASSIFY_RESPONSE = JSON.stringify({ class: "chat" });

/**
 * PR-24 optional knobs:
 * - `provider` — підмінити provider у тестах (DI); default = factory
 *   `getLLMProvider({ provider: env.LLM_READONLY_PROVIDER })`.
 * - `addBreadcrumb` — підмінити Sentry breadcrumb emitter у тестах.
 */
export interface ClassifyMessageOptions {
  provider?: LLMProvider;
  addBreadcrumb?: LLMBreadcrumbFn;
}

/**
 * Pure helper — calls Haiku через `LLMProvider`-абстракцію (PR-23/24),
 * parses the response, returns the classification. Throws on upstream
 * not-ok (caller maps to 502). On parse failure or empty content
 * silently returns `{ class: "chat" }` so the plugin always gets a
 * predictable shape — failures should never crash a `before_dispatch` hook.
 *
 * `apiKey` parametrised for testability (mirrors `categorizeTransaction`).
 * Provider override доступний через `options.provider` (для тестів). Якщо
 * `env.LLM_READONLY_PROVIDER=stub` — повертає `{ class: "chat" }` без
 * жодного HTTP-callu, що ідеально для Anthropic-outage / dev-без-ключа.
 */
export async function classifyMessage(
  args: ClassifyMessageArgs,
  apiKey: string,
  options: ClassifyMessageOptions = {},
): Promise<CheapRouterClassification> {
  const userMessage = args.userMessage?.trim();
  if (!userMessage) {
    throw new Error("classifyMessage: userMessage is required");
  }

  const systemPrompt = args.systemPrompt ?? DEFAULT_CHEAP_ROUTER_SYSTEM_PROMPT;

  const provider =
    options.provider ??
    getLLMProvider({
      provider: env.LLM_READONLY_PROVIDER,
      anthropicApiKey: apiKey,
      stubResponse: { text: STUB_CLASSIFY_RESPONSE },
    });

  const result = await invokeLLM(
    provider,
    {
      // claude-haiku-4-5 — найдешевший актуальний tier ($1 / $5 per M tokens
      // на 2026-05; ~$0.0002 / classification з 200/80 input/output split).
      // Той самий model, що використовує `routes/internal/categorize.ts`.
      model: "claude-haiku-4-5-20251001",
      maxTokens: 200,
      system: systemPrompt,
      messages: [{ role: "user", content: userMessage }],
      endpoint: "internal/openclaw/classify",
      timeoutMs: 10_000,
    },
    options.addBreadcrumb ? { addBreadcrumb: options.addBreadcrumb } : {},
  );

  if (!result.ok) {
    throw new Error(
      `classifyMessage: provider error (code=${result.code ?? "unknown"}, status=${result.status ?? 0})`,
    );
  }

  return parseClassification(result.text);
}
