/**
 * Council round-table orchestration helpers (Phase 5 / PR-E).
 *
 * Plugin-side helpers for the `/council <питання>` flow. The actual
 * sequential orchestration happens at the OpenClaw runtime level via the
 * `council-roundtable` SKILL (`ops/openclaw/skills/council-roundtable/`),
 * which prepends the deterministic persona sequence into the agent loop.
 * What lives here:
 *
 *   1. `COUNCIL_DEFAULT_SEQUENCE` — canonical Locked decision #8 order
 *      (`devops → eng → pm → growth → finance → cofounder synthesis`).
 *      Single source of truth for the constant — `openclaw.example.json` §
 *      `council.defaultSequence` mirrors it, and the
 *      `council-config.test.ts` sanity gate asserts the two stay aligned.
 *   2. `COUNCIL_SYNTHESIS_PERSONA` — last entry in the sequence; receives
 *      the aggregated specialist replies and produces the final answer.
 *   3. `createCouncilBudgetGate` — pre-flight HTTP helper that hits
 *      `/api/internal/openclaw/budget` and refuses the council session
 *      when `remainingUsd < councilUsdBudget`. Mirrors the legacy grammy
 *      bot's `/council` precondition (`tools/console/src/openclaw/
 *      handler-commands.ts`) so behaviour stays identical when the
 *      external Gateway takes over (Phase 6.5 parallel-run window).
 *
 * AI-CONTEXT: This module is a *gate* helper only. It does NOT loop over
 * personas, build prompts, or call the LLM — that responsibility lives in
 * the runtime (Variant A multi-agent orchestration per plan §740). Keeping
 * the gate pure-ish lets the same helper run under either runtime
 * (Gateway or legacy grammy fallback during Phase 6.5 parity).
 */

import type { OpenClawHttpClient } from "./http-client.js";
import { OpenClawHttpError } from "./http-client.js";

/**
 * Default sequence for `/council` without arguments (Locked decision #8).
 *
 * `cofounder` is the synthesis step — runtime feeds specialists' replies
 * back into the cofounder turn so it produces the final agreed-upon
 * recommendation. Specialists run sequentially (not parallel) for cost
 * predictability and to share the single Anthropic rate-limit budget.
 */
export const COUNCIL_DEFAULT_SEQUENCE = [
  "devops",
  "eng",
  "pm",
  "growth",
  "finance",
  "cofounder",
] as const;

export type CouncilPersona = (typeof COUNCIL_DEFAULT_SEQUENCE)[number];

/** Synthesis persona — always the last entry in the canonical sequence. */
export const COUNCIL_SYNTHESIS_PERSONA: CouncilPersona =
  COUNCIL_DEFAULT_SEQUENCE[COUNCIL_DEFAULT_SEQUENCE.length - 1]!;

/**
 * Audit-trigger label written to `openclaw_invocations.metadata.councilStep`
 * for the cofounder synthesis turn. Specialist turns use the persona slug
 * itself (e.g. `councilStep: "devops"`); only the cofounder synthesis row
 * uses this sentinel so the audit query can distinguish "cofounder ran as
 * a regular persona" vs. "cofounder ran as the synthesis facilitator".
 */
export const COUNCIL_SYNTHESIS_STEP_LABEL = "synthesis";

// ─────────────────────────────────────────────────────────────────────────
// Pre-flight budget gate
// ─────────────────────────────────────────────────────────────────────────

/**
 * Response shape from `/api/internal/openclaw/budget`. The server's
 * `BudgetBody` validator only requires `founderUserId` (+ optional
 * `tzName`); the response carries the daily-spend rollup. We do the
 * `remainingUsd < councilUsdBudget` comparison client-side.
 */
export interface CouncilBudgetResponse {
  allowed: boolean;
  /** Total spent so far today (USD). */
  spentUsd?: number;
  /** Daily budget cap (USD) — same value for every persona. */
  budgetUsd?: number;
  /** Headroom left today = `budgetUsd - spentUsd`. */
  remainingUsd?: number;
  /** Human-readable reason when `allowed === false`. */
  reason?: string;
}

export type CouncilGateOutcome =
  | { allowed: true; remainingUsd: number; spentUsd: number; budgetUsd: number }
  | {
      allowed: false;
      /** UI-ready message — pass straight to messaging service. */
      reason: string;
      /** Distinguishes "no daily budget left at all" from "headroom < council cap". */
      kind:
        | "daily_cap_exceeded"
        | "headroom_below_council_cap"
        | "service_error";
      /** Echoed when available; useful for log/audit. */
      remainingUsd?: number;
    };

export interface CouncilBudgetGateOptions {
  http: OpenClawHttpClient;
  founderUserId: string;
  /** Required headroom (USD) before a council session is allowed to start. */
  councilUsdBudget: number;
  /** Optional IANA tz override (defaults to server-side Europe/Kyiv). */
  tzName?: string;
  /** Logger hook — injected from SDK; default no-op. */
  log?: (
    level: "debug" | "info" | "warn" | "error",
    message: string,
    fields?: Record<string, unknown>,
  ) => void;
}

/**
 * Returns a function that, when invoked, calls `/budget` and decides
 * whether a `/council` session can proceed. Pure-ish — all side effects
 * (HTTP, log) live in injected dependencies, so tests run hermetically
 * without mocking `fetch`.
 *
 * Failure modes (all fail-closed):
 *   - server says `allowed: false` → `daily_cap_exceeded`.
 *   - `remainingUsd < councilUsdBudget` → `headroom_below_council_cap`.
 *   - HTTP error / transport error → `service_error` (do NOT start a
 *     council session with unknown budget state).
 */
export function createCouncilBudgetGate(
  opts: CouncilBudgetGateOptions,
): () => Promise<CouncilGateOutcome> {
  const log = opts.log ?? (() => undefined);

  return async () => {
    try {
      const body: Record<string, unknown> = {
        founderUserId: opts.founderUserId,
      };
      if (opts.tzName) body["tzName"] = opts.tzName;

      const response = await opts.http.post<CouncilBudgetResponse>(
        "/budget",
        body,
      );

      const spent = response.spentUsd ?? 0;
      const cap = response.budgetUsd ?? 0;
      const remaining = response.remainingUsd ?? Math.max(0, cap - spent);

      if (!response.allowed) {
        log("warn", "openclaw.council.daily_cap_exceeded", {
          spentUsd: spent,
          budgetUsd: cap,
          remainingUsd: remaining,
        });
        return {
          allowed: false,
          kind: "daily_cap_exceeded",
          reason:
            response.reason ??
            `Не вистачає бюджету: $${spent.toFixed(2)} / $${cap.toFixed(2)}. ` +
              `/council потребує мінімум $${opts.councilUsdBudget.toFixed(2)} залишку.`,
          remainingUsd: remaining,
        };
      }

      if (remaining < opts.councilUsdBudget) {
        log("warn", "openclaw.council.headroom_below_cap", {
          remainingUsd: remaining,
          councilUsdBudget: opts.councilUsdBudget,
        });
        return {
          allowed: false,
          kind: "headroom_below_council_cap",
          reason:
            `Council вимагає ≥ $${opts.councilUsdBudget.toFixed(2)} budget headroom; ` +
            `зараз залишок $${remaining.toFixed(4)}. Спробуй окрему /persona або завтра.`,
          remainingUsd: remaining,
        };
      }

      log("info", "openclaw.council.allowed", {
        remainingUsd: remaining,
        councilUsdBudget: opts.councilUsdBudget,
      });
      return {
        allowed: true,
        remainingUsd: remaining,
        spentUsd: spent,
        budgetUsd: cap,
      };
    } catch (err) {
      const detail =
        err instanceof OpenClawHttpError
          ? `Budget service unreachable (${err.status}).`
          : `Budget service error: ${
              err instanceof Error ? err.message : "unknown"
            }`;
      log("error", "openclaw.council.service_error", {
        error: err instanceof Error ? err.message : String(err),
      });
      return {
        allowed: false,
        kind: "service_error",
        reason: `${detail} Council відкладено — fail-closed.`,
      };
    }
  };
}
