/**
 * Invocation lifecycle helpers (`agent_turn_start` + `agent_turn_end` hooks).
 *
 * Phase 0.5 PoC валідує:
 *   1. invocation_id з server-а корелює з OpenClaw `agent_run_id`
 *      — agent_turn_start виклик `/invocations/open` повертає id, plugin
 *      зберігає це у in-memory map; agent_turn_end забирає його за
 *      agent_run_id-ом.
 *   2. agent_turn_end робить `/invocations/finalize` з cost rollup і
 *      status з SDK ctx-у (success/error/budget_exceeded/iteration_cap).
 *
 * Pure logic + injected HTTP client → unit-тести без mocking fetch.
 */

import type { OpenClawHttpClient } from "./http-client.js";
import type {
  HookHandler,
  AgentTurnStartContext,
  AgentTurnEndContext,
} from "./sdk-types.js";

export interface OpenInvocationRequest {
  founderUserId: string;
  trigger: string;
  userMessage: string;
  agentRunId: string;
  /** Optional pre-allocated invocation id. */
  hintedInvocationId?: string;
}

export interface OpenInvocationResponse {
  /**
   * Database id (BIGINT серіалізований у число — Hard Rule #1).
   * Plugin зберігає його у in-memory map, key=agentRunId.
   */
  invocationId: number;
}

export interface FinalizeInvocationRequest {
  invocationId: number;
  status:
    | "success"
    | "error"
    | "rejected"
    | "budget_exceeded"
    | "iteration_cap"
    | "allowlist_fail"
    | "approval_rejected"
    | "dm_only_violation";
  costUsd: number;
  durationMs: number;
  iterations: number;
  assistantResponse?: string;
  errorMessage?: string;
}

export interface FinalizeInvocationResponse {
  ok: true;
}

/**
 * Map from `agent_run_id` (OpenClaw runtime identifier) to server-side
 * `invocation_id` (DB row). agent_turn_start populates it; agent_turn_end
 * consumes + clears it. Uses Map (not WeakMap) so we can iterate for
 * leak diagnostics in tests.
 *
 * Кожен plugin instance має свою копію — сейф у multi-instance setup
 * (один OpenClaw процес держить один plugin instance, один Map).
 */
export class InvocationCorrelator {
  private readonly map = new Map<string, number>();

  set(agentRunId: string, invocationId: number): void {
    this.map.set(agentRunId, invocationId);
  }

  consume(agentRunId: string): number | undefined {
    const id = this.map.get(agentRunId);
    if (id !== undefined) this.map.delete(agentRunId);
    return id;
  }

  size(): number {
    return this.map.size;
  }

  /** Clear all entries. Test helper. */
  clear(): void {
    this.map.clear();
  }
}

export interface AuditHooksOptions {
  http: OpenClawHttpClient;
  founderUserId: string;
  correlator: InvocationCorrelator;
  log?: (
    level: "debug" | "info" | "warn" | "error",
    message: string,
    fields?: Record<string, unknown>,
  ) => void;
}

/**
 * Builds an `agent_turn_start` handler that opens an invocation row and
 * caches the resulting id keyed by agent_run_id.
 */
export function createAgentTurnStartHook(
  opts: AuditHooksOptions,
): HookHandler<"agent_turn_start"> {
  return async (ctx: AgentTurnStartContext) => {
    const log = opts.log ?? (() => undefined);
    try {
      const response = await opts.http.post<OpenInvocationResponse>(
        "/invocations/open",
        {
          founderUserId: opts.founderUserId,
          trigger: ctx.trigger,
          userMessage: ctx.userMessage,
          agentRunId: ctx.agentRunId,
        } satisfies OpenInvocationRequest,
      );
      opts.correlator.set(ctx.agentRunId, response.invocationId);
      log("debug", "openclaw.invocation.opened", {
        agentRunId: ctx.agentRunId,
        invocationId: response.invocationId,
      });
      return { ok: true };
    } catch (err) {
      // Soft-fail: не блокуємо invoke на audit-error. Status reflectиться
      // у agent_turn_end, де ми вже знаємо real outcome.
      log("error", "openclaw.invocation.open_failed", {
        agentRunId: ctx.agentRunId,
        error: err instanceof Error ? err.message : String(err),
      });
      return { ok: true };
    }
  };
}

/**
 * Builds an `agent_turn_end` handler that finalizes the cached invocation
 * (rollup cost + status) and clears the correlator entry.
 *
 * ВАЖЛИВО: при невдалому agent_turn_start (correlator.consume → undefined)
 * hook все одно намагається finalize за `agentRunId`-ом — server fall-back
 * шукає invocation з matching agent_run_id у останній годині. Це гарантує,
 * що жодна invocation не залишиться без status, навіть якщо open впав.
 */
export function createAgentTurnEndHook(
  opts: AuditHooksOptions,
): HookHandler<"agent_turn_end"> {
  return async (ctx: AgentTurnEndContext) => {
    const log = opts.log ?? (() => undefined);
    const invocationId = opts.correlator.consume(ctx.agentRunId);

    try {
      const body: FinalizeInvocationRequest & { agentRunId?: string } = {
        invocationId: invocationId ?? -1,
        status: ctx.status,
        costUsd: ctx.costUsd,
        durationMs: ctx.durationMs,
        iterations: ctx.iterations,
      };
      if (ctx.assistantResponse !== null) {
        body.assistantResponse = ctx.assistantResponse;
      }
      // Якщо ми не знайшли invocation у correlator — server може його
      // зматчити по agent_run_id-у; передаємо явно.
      if (invocationId === undefined) {
        body.agentRunId = ctx.agentRunId;
      }
      await opts.http.post<FinalizeInvocationResponse>(
        "/invocations/finalize",
        body,
      );
      log("debug", "openclaw.invocation.finalized", {
        agentRunId: ctx.agentRunId,
        invocationId,
        status: ctx.status,
        costUsd: ctx.costUsd,
      });
      return { ok: true };
    } catch (err) {
      log("error", "openclaw.invocation.finalize_failed", {
        agentRunId: ctx.agentRunId,
        invocationId,
        error: err instanceof Error ? err.message : String(err),
      });
      // Soft-fail аналогічно: не блокуємо завершення turn-у на audit-error.
      return { ok: true };
    }
  };
}
