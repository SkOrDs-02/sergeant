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

import { extractJsonFromText } from "../../http/jsonSafe.js";
import { anthropicMessages } from "../../lib/anthropic.js";

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
 * Canonical embedded fallback prompt. Mirrors
 * `ops/openclaw/cheap-router.system.md` (the single source of truth on the
 * Gateway volume). Keep both in sync via the `pnpm lint:docs-freshness` gate.
 */
export const DEFAULT_CHEAP_ROUTER_SYSTEM_PROMPT = [
  "Класифікуй message українською:",
  "A) routine_metrics — питання про поточні цифри (revenue, signups, PR queue, sentry, status)",
  "B) routine_recall — запит на згадку («що ми вирішили по X», «де я писав про Y»)",
  "C) routine_remind — встановити нагадування / cron",
  "D) thinking — потрібен синтез, decision, planning, code review",
  "E) chat — світська бесіда / уточнення",
  "",
  'Output JSON: { "class": "…", "shortcut": "…"|null, "persona": "…"|null, "params": {…}|null, "chat_response": "…"|null }',
  "",
  "Rules:",
  "- If class=chat, include a short 1-2 sentence reply in chat_response (Ukrainian).",
  "- If class=thinking, optionally suggest persona (eng/growth/finance/devops/pm/data/content/seo/cs/cofounder).",
  "- If class starts with routine_, suggest the most appropriate shortcut slug.",
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
 * Pure helper — calls Haiku, parses the response, returns the classification.
 * Throws on upstream not-ok (caller maps to 502). On parse failure or empty
 * content silently returns `{ class: "chat" }` so the plugin always gets a
 * predictable shape — failures should never crash a `before_dispatch` hook.
 *
 * `apiKey` parametrised for testability (mirrors `categorizeTransaction`).
 */
export async function classifyMessage(
  args: ClassifyMessageArgs,
  apiKey: string,
): Promise<CheapRouterClassification> {
  const userMessage = args.userMessage?.trim();
  if (!userMessage) {
    throw new Error("classifyMessage: userMessage is required");
  }

  const systemPrompt = args.systemPrompt ?? DEFAULT_CHEAP_ROUTER_SYSTEM_PROMPT;

  const { response, data } = await anthropicMessages(
    apiKey,
    {
      // claude-haiku-4-5 — найдешевший актуальний tier ($1 / $5 per M tokens
      // на 2026-05; ~$0.0002 / classification з 200/80 input/output split).
      // Той самий model, що використовує `routes/internal/categorize.ts`.
      model: "claude-haiku-4-5-20251001",
      max_tokens: 200,
      system: systemPrompt,
      messages: [{ role: "user", content: userMessage }],
    },
    { endpoint: "internal/openclaw/classify", timeoutMs: 10_000 },
  );

  if (!response?.ok) {
    const status = response?.status ?? 0;
    throw new Error(`classifyMessage: upstream not ok (status=${status})`);
  }

  const text =
    (data as { content?: Array<{ type: string; text?: string }> }).content?.[0]
      ?.text ?? "";

  return parseClassification(text);
}
