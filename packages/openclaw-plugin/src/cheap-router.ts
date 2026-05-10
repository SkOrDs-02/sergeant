/**
 * Layer 1 — Cheap router (Haiku classifier).
 *
 * Один короткий LLM-call (~200 токенів) до claude-3-5-haiku-latest.
 * Класифікує user message на:
 *   - routine_metrics — питання про цифри
 *   - routine_recall — запит на згадку з пам'яті
 *   - routine_remind — встановити нагадування
 *   - thinking — потрібен синтез, planning, code review → Layer 2
 *   - chat — коротка відповідь від самого Haiku
 *
 * Якщо class починається з "routine_" — повертаємо shortcut slug,
 * і Layer 0 shortcut виконує tool calls.
 * Якщо class="thinking" — ескалація до Layer 2 (full agent).
 * Якщо class="chat" — Haiku сама дає коротку відповідь.
 *
 * ~$0.0002 per classification call.
 */

import { z } from "zod";

// ─────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────

export const CheapRouterClassSchema = z.enum([
  "routine_metrics",
  "routine_recall",
  "routine_remind",
  "thinking",
  "chat",
]);

export type CheapRouterClass = z.infer<typeof CheapRouterClassSchema>;

export const CheapRouterResponseSchema = z.object({
  class: CheapRouterClassSchema,
  shortcut: z.string().nullable().optional(),
  persona: z.string().nullable().optional(),
  params: z.record(z.string(), z.unknown()).nullable().optional(),
  chat_response: z.string().nullable().optional(),
});

export type CheapRouterResponse = z.infer<typeof CheapRouterResponseSchema>;

/** Result from the cheap router classification. */
export interface CheapRouterResult {
  classification: CheapRouterResponse;
  /** Estimated cost of the Haiku call in USD. */
  costUsd: number;
}

/** LLM call abstraction — allows injection for testing. */
export type LlmClassifier = (
  systemPrompt: string,
  userMessage: string,
) => Promise<{ text: string; costUsd: number }>;

// ─────────────────────────────────────────────────────────────────────────
// System prompt
// ─────────────────────────────────────────────────────────────────────────

export const CHEAP_ROUTER_SYSTEM_PROMPT = `Класифікуй message українською:
A) routine_metrics — питання про поточні цифри (revenue, signups, PR queue, sentry, status)
B) routine_recall — запит на згадку («що ми вирішили по X», «де я писав про Y»)
C) routine_remind — встановити нагадування / cron
D) thinking — потрібен синтез, decision, planning, code review
E) chat — світська бесіда / уточнення

Output JSON: { "class": "\u2026", "shortcut": "\u2026"|null, "persona": "\u2026"|null, "params": {\u2026}|null, "chat_response": "\u2026"|null }

Rules:
- If class=chat, include a short 1-2 sentence reply in chat_response (Ukrainian).
- If class=thinking, optionally suggest persona (eng/growth/finance/devops/pm/data/content/seo/cs/cofounder).
- If class starts with routine_, suggest the most appropriate shortcut slug.
- shortcut slugs: metrics, runway, status, sentry, stripe, posthog, prs, releases, builds, workflows, refresh_metrics, heartbeat, recall, decisions, digest, remind.
- Output ONLY valid JSON, no markdown fencing.`;

// ─────────────────────────────────────────────────────────────────────────
// Router
// ─────────────────────────────────────────────────────────────────────────

export interface CheapRouterOptions {
  classify: LlmClassifier;
  log?: (
    level: "debug" | "info" | "warn" | "error",
    message: string,
    fields?: Record<string, unknown>,
  ) => void;
}

export class CheapRouter {
  private readonly classify: LlmClassifier;
  private readonly log: NonNullable<CheapRouterOptions["log"]>;

  constructor(opts: CheapRouterOptions) {
    this.classify = opts.classify;
    this.log = opts.log ?? (() => undefined);
  }

  /**
   * Classify the user message via a cheap Haiku call.
   * Returns the parsed classification or falls back to "chat" on errors.
   */
  async route(userMessage: string): Promise<CheapRouterResult> {
    try {
      const { text, costUsd } = await this.classify(
        CHEAP_ROUTER_SYSTEM_PROMPT,
        userMessage,
      );

      const parsed = this.parseResponse(text);
      this.log("debug", "openclaw.cheap_router.classified", {
        class: parsed.class,
        shortcut: parsed.shortcut,
        persona: parsed.persona,
      });

      return { classification: parsed, costUsd };
    } catch (err) {
      this.log("error", "openclaw.cheap_router.error", {
        error: err instanceof Error ? err.message : String(err),
      });
      return {
        classification: {
          class: "chat",
          chat_response:
            "Вибач, не вдалось класифікувати запит. Спробуй ще раз.",
        },
        costUsd: 0,
      };
    }
  }

  private parseResponse(raw: string): CheapRouterResponse {
    const trimmed = raw.trim();
    // Strip markdown code fences if present
    const jsonStr = trimmed
      .replace(/^```(?:json)?\s*/i, "")
      .replace(/\s*```$/, "");

    const parsed = JSON.parse(jsonStr) as unknown;
    const validated = CheapRouterResponseSchema.parse(parsed);
    return validated;
  }
}

// ─────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────

/** Maps routine classification to a shortcut slug. */
export function routineToShortcutSlug(
  classification: CheapRouterResponse,
): string | null {
  if (!classification.class.startsWith("routine_")) return null;

  // If the classifier suggested a specific shortcut, use it
  if (classification.shortcut) return classification.shortcut;

  // Otherwise, map from class name
  switch (classification.class) {
    case "routine_metrics":
      return "metrics";
    case "routine_recall":
      return "recall";
    case "routine_remind":
      return "remind";
    default:
      return null;
  }
}

/** Check if the classification means Layer 2 escalation. */
export function isLayer2Escalation(
  classification: CheapRouterResponse,
): boolean {
  return classification.class === "thinking";
}

/** Check if the cheap router can respond directly (chat class). */
export function isChatResponse(classification: CheapRouterResponse): boolean {
  return classification.class === "chat";
}
