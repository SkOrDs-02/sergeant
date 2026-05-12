/**
 * Invocation lifecycle hooks (Stage 4a) — `before_agent_start` opens an
 * `openclaw_invocations` row, `agent_end` finalizes it with rollup cost
 * and status.
 *
 * Endpoint contract (apps/server/src/routes/internal/openclaw.ts):
 *
 *   POST /api/internal/openclaw/invocations/open
 *     body: {
 *       founderUserId, founderTgUserId, trigger ("dm" | "morning_ritual" |
 *       "weekly_review" | "monthly_okr"), userMessage, metadata?
 *     }
 *     resp: { invocationId: number }
 *
 *   POST /api/internal/openclaw/invocations/finalize
 *     body: {
 *       invocationId, status ("success" | "error" | "budget_exceeded" |
 *       "iteration_cap" | "allowlist_fail" | "dm_only_violation"),
 *       assistantResponse?, costUsd?, durationMs?, iterations?, ...
 *     }
 *
 * Plugin keeps a small in-memory map from `runId` → `invocationId`
 * keyed during `before_agent_start` and consumed during `agent_end`.
 * Soft-fail posture: errors are logged but never block the agent turn
 * — audit miss is preferable to user-facing breakage.
 *
 * Live-shape disclaimer (per `docs/notes/spikes/openclaw-sdk-5.7-real-api.md`
 * § "Що не перевіряли"): runtime event payloads for `before_agent_start`
 * and `agent_end` are type-level only; the first Stage 4a deploy should
 * verify `runId` / `trigger` / `userMessage` / `status` are actually
 * populated by the Gateway. Until then we read fields defensively and
 * skip the audit write rather than crash.
 */

import type {
  PluginHookAgentEndEvent,
  PluginHookBeforeAgentStartEvent,
} from "openclaw/plugin-sdk/plugin-entry";
import type { OpenClawHttpClient } from "../http-client.js";

const VALID_STATUS = new Set([
  "success",
  "error",
  "budget_exceeded",
  "iteration_cap",
  "allowlist_fail",
  "dm_only_violation",
]);

const VALID_TRIGGER = new Set([
  "dm",
  "morning_ritual",
  "weekly_review",
  "monthly_okr",
]);

export interface OpenInvocationResponse {
  invocationId: number;
}

/**
 * In-memory map from `runId` (OpenClaw runtime identifier) to server-side
 * `invocation_id` (DB row id). `before_agent_start` populates;
 * `agent_end` consumes + clears. One plugin instance = one map.
 *
 * Use Map rather than WeakMap so we can iterate for leak diagnostics +
 * size assertions in tests.
 */
export class InvocationCorrelator {
  private readonly map = new Map<string, number>();

  set(runId: string, invocationId: number): void {
    this.map.set(runId, invocationId);
  }

  consume(runId: string): number | undefined {
    const id = this.map.get(runId);
    if (id !== undefined) this.map.delete(runId);
    return id;
  }

  size(): number {
    return this.map.size;
  }

  clear(): void {
    this.map.clear();
  }
}

export interface AuditHookOptions {
  http: OpenClawHttpClient;
  founderUserId: string;
  /**
   * Numeric Telegram user id — `/invocations/open` requires it
   * (`z.number().int()`). Plugin reads it from
   * `OPENCLAW_FOUNDER_TG_USER_ID` env. Optional in the type so the
   * factory can no-op gracefully when env is missing in tests / local.
   * `| undefined` is explicit because tsconfig sets
   * `exactOptionalPropertyTypes: true` — callers may want to forward an
   * `undefined` slot from `PluginConfig` without re-narrowing.
   */
  founderTgUserId?: number | undefined;
  correlator: InvocationCorrelator;
  log?: (
    level: "debug" | "info" | "warn" | "error",
    message: string,
    fields?: Record<string, unknown>,
  ) => void;
}

export type BeforeAgentStartHookHandler = (
  event: PluginHookBeforeAgentStartEvent,
) => Promise<void>;

export type AgentEndHookHandler = (
  event: PluginHookAgentEndEvent,
) => Promise<void>;

/**
 * Builds a `before_agent_start` handler. When `runId` is present in the
 * event payload, opens an invocation row and stores the resulting id in
 * the correlator. Missing `runId` (or missing tg user id) is a soft skip.
 */
export function createBeforeAgentStartHook(
  opts: AuditHookOptions,
): BeforeAgentStartHookHandler {
  const log = opts.log ?? defaultLog;

  return async (event) => {
    if (!event.runId) {
      log("debug", "sergeant.invocation.open_skipped", {
        reason: "no_run_id",
      });
      return;
    }
    if (opts.founderTgUserId === undefined) {
      log("debug", "sergeant.invocation.open_skipped", {
        reason: "no_founder_tg_user_id",
        runId: event.runId,
      });
      return;
    }

    const trigger = VALID_TRIGGER.has(event.trigger ?? "")
      ? (event.trigger as string)
      : "dm";
    const userMessage =
      typeof event.userMessage === "string" && event.userMessage.length > 0
        ? event.userMessage.slice(0, 8000)
        : "(empty user message)";

    try {
      const response = await opts.http.post<OpenInvocationResponse>(
        "/invocations/open",
        {
          founderUserId: opts.founderUserId,
          founderTgUserId: opts.founderTgUserId,
          trigger,
          userMessage,
        },
      );
      opts.correlator.set(event.runId, response.invocationId);
      log("debug", "sergeant.invocation.opened", {
        runId: event.runId,
        invocationId: response.invocationId,
      });
    } catch (err) {
      // Soft-fail: audit miss is better than blocking the agent turn.
      // `agent_end` will still try to finalize using whatever invocation
      // the server can resolve from `runId` server-side (if any).
      log("error", "sergeant.invocation.open_failed", {
        runId: event.runId,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  };
}

/**
 * Builds an `agent_end` handler. Consumes the invocation id from the
 * correlator and POSTs `/invocations/finalize` with status + rollup cost.
 * When the correlator has no entry (e.g. open failed earlier) we skip —
 * the server's daily-cost roll-up is best-effort and one missing row
 * does not justify a user-facing failure.
 */
export function createAgentEndHook(
  opts: AuditHookOptions,
): AgentEndHookHandler {
  const log = opts.log ?? defaultLog;

  return async (event) => {
    if (!event.runId) {
      log("debug", "sergeant.invocation.finalize_skipped", {
        reason: "no_run_id",
      });
      return;
    }

    const invocationId = opts.correlator.consume(event.runId);
    if (invocationId === undefined) {
      log("debug", "sergeant.invocation.finalize_skipped", {
        reason: "no_open_row",
        runId: event.runId,
      });
      return;
    }

    const status = VALID_STATUS.has(event.status ?? "")
      ? (event.status as string)
      : "success";

    const body: Record<string, unknown> = {
      invocationId,
      status,
    };
    if (typeof event.costUsd === "number" && event.costUsd >= 0) {
      body["costUsd"] = event.costUsd;
    }
    if (typeof event.durationMs === "number" && event.durationMs >= 0) {
      body["durationMs"] = Math.floor(event.durationMs);
    }
    if (typeof event.iterations === "number" && event.iterations >= 0) {
      body["iterations"] = Math.floor(event.iterations);
    }
    if (typeof event.assistantResponse === "string") {
      body["assistantResponse"] = event.assistantResponse.slice(0, 16_000);
    }
    if (typeof event.errorMessage === "string") {
      body["errorMessage"] = event.errorMessage.slice(0, 2000);
    }

    try {
      await opts.http.post<unknown>("/invocations/finalize", body);
      log("debug", "sergeant.invocation.finalized", {
        runId: event.runId,
        invocationId,
        status,
      });
    } catch (err) {
      log("error", "sergeant.invocation.finalize_failed", {
        runId: event.runId,
        invocationId,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  };
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
