/**
 * `llm_input` hook factory — per-call budget gate (Stage 4a).
 *
 * On every LLM-input event the plugin checks the founder's running daily
 * spend against the configured OpenClaw daily USD budget (server-side
 * env `OPENCLAW_DAILY_USD_BUDGET`, default $5). When the server returns
 * `allowed: false`, the hook returns `{ block: true, blockReason }` and
 * the runtime aborts the upcoming LLM call before any token spend.
 *
 * Endpoint contract (apps/server/src/routes/internal/openclaw.ts):
 *   POST /api/internal/openclaw/budget
 *   body: { founderUserId, tzName? }  (default tz = Europe/Kyiv)
 *   resp: {
 *     allowed: boolean;
 *     spentUsd: number;
 *     budgetUsd: number;
 *     remainingUsd: number;
 *     reason?: "budget_exceeded";
 *   }
 *
 * Fail-closed posture: any HTTP/transport error → return
 * `block: true` so we never silently leak spend when the budget service
 * is unreachable. The server is the single source of truth (Locked
 * decision #4 + plan § "Per-call USD cap і budget enforcement").
 */

import type {
  PluginHookLlmInputEvent,
  PluginHookLlmInputResult,
} from "openclaw/plugin-sdk/plugin-entry";
import { OpenClawHttpError, type OpenClawHttpClient } from "../http-client.js";

export interface BudgetCheckResponse {
  allowed: boolean;
  spentUsd: number;
  budgetUsd: number;
  remainingUsd: number;
  reason?: "budget_exceeded";
}

export interface BudgetGateOptions {
  http: OpenClawHttpClient;
  founderUserId: string;
  /** IANA TZ for day boundary; defaults to Europe/Kyiv on the server. */
  tzName?: string;
  /**
   * Logger hook — taken from `api.logger` when available; falls back to
   * `console`. Kept injectable so unit tests can assert log calls.
   */
  log?: (
    level: "debug" | "info" | "warn" | "error",
    message: string,
    fields?: Record<string, unknown>,
  ) => void;
}

export type LlmInputHookHandler = (
  event: PluginHookLlmInputEvent,
) => Promise<PluginHookLlmInputResult | undefined>;

/**
 * Builds an `llm_input` hook handler that gates each LLM call against
 * the founder's daily USD budget. Returns `undefined` when allowed so the
 * runtime treats it as pass-through; returns `{ block, blockReason }`
 * when the server rejects or is unreachable.
 */
export function createBudgetGate(opts: BudgetGateOptions): LlmInputHookHandler {
  const log = opts.log ?? defaultLog;

  return async (event) => {
    try {
      const body: { founderUserId: string; tzName?: string } = {
        founderUserId: opts.founderUserId,
      };
      if (opts.tzName) body.tzName = opts.tzName;
      const response = await opts.http.post<BudgetCheckResponse>(
        "/budget",
        body,
      );

      if (!response.allowed) {
        const reason = formatBlockReason(response);
        log("warn", "sergeant.budget.blocked", {
          runId: event.runId,
          spentUsd: response.spentUsd,
          budgetUsd: response.budgetUsd,
          remainingUsd: response.remainingUsd,
          serverReason: response.reason,
        });
        return { block: true, blockReason: reason };
      }

      log("debug", "sergeant.budget.allowed", {
        runId: event.runId,
        spentUsd: response.spentUsd,
        remainingUsd: response.remainingUsd,
      });
      return undefined;
    } catch (err) {
      const reason =
        err instanceof OpenClawHttpError
          ? `Daily budget service unreachable (HTTP ${err.status}). Failing closed.`
          : `Daily budget service error: ${
              err instanceof Error ? err.message : "unknown"
            }`;
      log("error", "sergeant.budget.error", {
        runId: event.runId,
        error: err instanceof Error ? err.message : String(err),
      });
      return { block: true, blockReason: reason };
    }
  };
}

function formatBlockReason(r: BudgetCheckResponse): string {
  const spent = r.spentUsd.toFixed(2);
  const budget = r.budgetUsd.toFixed(2);
  return `Daily OpenClaw budget reached: spent $${spent} of $${budget} (server reason: ${
    r.reason ?? "budget_exceeded"
  }).`;
}

function defaultLog(
  level: "debug" | "info" | "warn" | "error",
  message: string,
  fields?: Record<string, unknown>,
): void {
  const payload = fields ? ` ${JSON.stringify(fields)}` : "";
  if (level === "error") console.error(`[sergeant] ${message}${payload}`);
  else if (level === "warn") console.warn(`[sergeant] ${message}${payload}`);
  else console.log(`[sergeant] ${message}${payload}`);
}
