/**
 * Budget gate (`llm_input` hook helper). Перед кожним LLM-call-ом плагін
 * звертається до server-а `/api/internal/openclaw/budget`, передаючи
 * `kind: "per_call"` + estimated cost-у. Server повертає
 * `{ allowed: boolean, reason?: string, dailyTotalUsd?: number }`.
 *
 * Якщо `allowed === false` — hook повертає `{ ok: false, status:
 * "budget_exceeded" }`, runtime фіналізує invocation з відповідним status,
 * audit-rollup hook (`agent_turn_end`) запише causa в `openclaw_invocations`.
 *
 * PoC валідує:
 *   1. Hook реально блокує LLM-call коли cap перевищено (test).
 *   2. Hard-coded cap у тесті дозволяє детерміністично відтворити
 *      `budget_exceeded` без реального LLM call.
 */

import type { OpenClawHttpClient } from "./http-client.js";
import { OpenClawHttpError } from "./http-client.js";
import type { HookHandler } from "./sdk-types.js";

export interface BudgetCheckRequest {
  founderUserId: string;
  kind: "per_call" | "daily" | "council";
  /** Estimated cost of the upcoming LLM call (USD). */
  estimatedCostUsd: number;
  /** Optional cap override; server has its own limit but plugin може forward-ити opt-in cap. */
  perCallCapUsd?: number;
}

export interface BudgetCheckResponse {
  allowed: boolean;
  reason?: string;
  dailyTotalUsd?: number;
}

export interface BudgetGateOptions {
  http: OpenClawHttpClient;
  founderUserId: string;
  perCallCapUsd: number;
  /** Logger hook — injected from SDK; default no-op. */
  log?: (
    level: "debug" | "info" | "warn" | "error",
    message: string,
    fields?: Record<string, unknown>,
  ) => void;
}

/**
 * Builds an `llm_input` hook handler that calls `/budget` with the
 * estimated cost of the upcoming LLM call. Returns `{ ok: false }` with
 * `status: "budget_exceeded"` when server says no.
 *
 * Keeps logic pure-ish: side effects (HTTP, log) live in injected
 * dependencies so tests can run hermetically without mocking `fetch`.
 */
export function createBudgetGate(
  opts: BudgetGateOptions,
): HookHandler<"llm_input"> {
  return async (ctx) => {
    const log = opts.log ?? (() => undefined);

    try {
      const response = await opts.http.post<BudgetCheckResponse>("/budget", {
        founderUserId: opts.founderUserId,
        kind: "per_call",
        estimatedCostUsd: ctx.estimatedCostUsd,
        perCallCapUsd: opts.perCallCapUsd,
      } satisfies BudgetCheckRequest);

      if (!response.allowed) {
        log("warn", "openclaw.budget.blocked", {
          invocationId: ctx.invocationId,
          reason: response.reason,
          dailyTotalUsd: response.dailyTotalUsd,
          estimatedCostUsd: ctx.estimatedCostUsd,
        });
        return {
          ok: false,
          reason:
            response.reason ??
            "Per-call budget cap exceeded. Спробуй пізніше або підвищ cap у openclaw.json.",
          status: "budget_exceeded",
        };
      }

      log("debug", "openclaw.budget.allowed", {
        invocationId: ctx.invocationId,
        dailyTotalUsd: response.dailyTotalUsd,
      });
      return { ok: true };
    } catch (err) {
      // Fail-closed на server-error: краще заблокувати, ніж витратити
      // невідомий budget. Локальний cap (Hard Rule #20-style invariant)
      // — server єдина source of truth.
      const reason =
        err instanceof OpenClawHttpError
          ? `Budget service unreachable (${err.status}). Failing closed.`
          : `Budget service error: ${
              err instanceof Error ? err.message : "unknown"
            }`;
      log("error", "openclaw.budget.error", {
        invocationId: ctx.invocationId,
        error: err instanceof Error ? err.message : String(err),
      });
      return {
        ok: false,
        reason,
        status: "budget_exceeded",
      };
    }
  };
}
