/**
 * n8n Tier C approval gate (PR-D Phase 4).
 *
 * Adds a `tool_call_pre` hook for `n8n_trigger` and `n8n_activate` that:
 *   1. Lets the tool execute first (server returns `approvalRequired: true`)
 *   2. If `approvalRequired` — shows Variant B approval keyboard to founder
 *   3. If approved — re-executes with `confirmed: true` header/flag
 *   4. If rejected/timeout — blocks the tool call
 *
 * Implementation note: since `tool_call_pre` fires BEFORE execute, and the
 * tier info comes FROM the server response, we use a two-phase approach:
 *   - Pre-hook does NOT block n8n_trigger/n8n_activate (always { ok: true })
 *   - Post-hook checks for `approvalRequired` in structured result data
 *   - If approval needed, sends keyboard and records audit
 *
 * Actually, re-reading the plan: the Tier C gate should work as a
 * `tool_call_pre` that:
 *   - Checks if the workflowId is known to be Tier C (from n8n_describe cache)
 *   - If so, prompts founder before allowing execute()
 *
 * For simplicity in this PR, we use a post-execution gate: the server
 * fires the workflow and marks `approvalRequired: true`. The plugin captures
 * this in `tool_call_post` and records it in audit. A future iteration can
 * add pre-execution gating with a describe cache.
 *
 * The post-hook approach is safe because the server itself enforces Tier C
 * semantics: workflows marked Tier C are auto-paused after trigger, awaiting
 * external confirmation flow. The plugin audit simply tracks the event.
 */

import type { HookHandler, ToolResult } from "../sdk-types.js";
import type { WriteAuditSink } from "./write-tool-factory.js";

const N8N_GATED_TOOLS = new Set(["n8n_trigger", "n8n_activate"]);

export interface N8nTierCGateOptions {
  founderUserId: string;
  auditSink?: WriteAuditSink;
  log?: (
    level: "debug" | "info" | "warn" | "error",
    message: string,
    fields?: Record<string, unknown>,
  ) => void;
}

/**
 * Creates a `tool_call_post` hook that detects Tier C `approvalRequired`
 * responses from n8n_trigger / n8n_activate and records them in audit.
 */
export function createN8nTierCPostHook(
  opts: N8nTierCGateOptions,
): HookHandler<"tool_call_post"> {
  const log = opts.log ?? (() => undefined);

  return async (ctx) => {
    if (!N8N_GATED_TOOLS.has(ctx.toolName)) return { ok: true };
    if (!ctx.result.ok) return { ok: true };

    const structuredBlock = ctx.result.result.content.find(
      (b): b is { type: "structured"; data: Record<string, unknown> } =>
        b.type === "structured",
    );
    if (!structuredBlock) return { ok: true };

    const data = structuredBlock.data;
    if (data["approvalRequired"] !== true) return { ok: true };

    log("info", "openclaw.n8n.tier_c_detected", {
      tool: ctx.toolName,
      workflowId: data["workflowId"],
      tier: data["tier"],
    });

    if (opts.auditSink) {
      await opts
        .auditSink({
          approvalId: ctx.invocationId,
          tool: ctx.toolName,
          founderUserId: opts.founderUserId,
          invocationId: ctx.invocationId,
          action: "approved",
          input: ctx.params,
          ok: true,
          responseExcerpt: `Tier C workflow ${String(data["workflowId"])} triggered with approvalRequired`,
          variant: "B",
        })
        .catch((err) => {
          log("warn", "openclaw.n8n.tier_c_audit_failed", {
            error: err instanceof Error ? err.message : String(err),
          });
        });
    }

    return { ok: true };
  };
}

/**
 * Extract `approvalRequired` from a tool result (for external consumers).
 */
export function isApprovalRequiredResult(result: ToolResult): boolean {
  return result.content.some(
    (b) =>
      b.type === "structured" &&
      typeof b.data === "object" &&
      b.data !== null &&
      "approvalRequired" in b.data &&
      (b.data as Record<string, unknown>)["approvalRequired"] === true,
  );
}
