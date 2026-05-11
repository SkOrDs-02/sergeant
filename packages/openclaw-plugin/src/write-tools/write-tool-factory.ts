/**
 * Shared factory for Variant-B write-tools.
 *
 * Extracts the approval-gate / audit pattern from `create-github-issue.ts`
 * into a generic builder. Each concrete write-tool supplies:
 *   - name, description, parameter schema
 *   - an `execute(http, params)` async fn that calls the server endpoint
 *
 * The factory wires:
 *   1. `tool_call_pre` (Variant B) — messaging + inline-keyboard prompt
 *   2. `execute` wrapper — consumes approval state, calls server, formats
 *   3. `tool_call_post` (Variant A/C) — SDK-native audit
 *   4. write-audit recording via `/write-audit/log`
 */

import type { ZodTypeAny } from "zod";
import type { OpenClawHttpClient } from "../http-client.js";
import { OpenClawHttpError } from "../http-client.js";
import type {
  ToolDefinition,
  HookHandler,
  MessagingService,
  ToolResult,
} from "../sdk-types.js";
import {
  type ApprovalVariant,
  type ApprovalDecision,
  buildApprovalKeyboard,
  decodeApprovalCallback,
  renderApprovalPrompt,
  shouldRunCustomApprovalGate,
  shouldUseNativeRequiresConfirmation,
} from "./approval-variants.js";

// ─── Audit recording ────────────────────────────────────────────────────

export interface WriteAuditRecord {
  approvalId: string;
  tool: string;
  founderUserId: string;
  invocationId?: string | undefined;
  action: "approved" | "rejected" | "executed";
  input?: Record<string, unknown> | undefined;
  httpStatus?: number | undefined;
  ok?: boolean | undefined;
  responseExcerpt?: string | undefined;
  variant: ApprovalVariant;
}

export type WriteAuditSink = (record: WriteAuditRecord) => Promise<void>;

/**
 * Default audit sink — posts to `/write-audit/log` on the Sergeant server.
 */
export function createHttpAuditSink(
  http: OpenClawHttpClient,
  founderTgUserId: number,
): WriteAuditSink {
  return async (record) => {
    await http.post("/write-audit/log", {
      approvalId: record.approvalId,
      tool: record.tool,
      founderUserId: record.founderUserId,
      founderTgUserId,
      invocationId:
        record.invocationId != null ? Number(record.invocationId) : null,
      action: record.action,
      input: record.input,
      httpStatus: record.httpStatus ?? null,
      ok: record.ok ?? null,
      responseExcerpt: record.responseExcerpt ?? null,
      metadata: { variant: record.variant },
    });
  };
}

// ─── Write-tool factory ─────────────────────────────────────────────────

export interface WriteToolSpec<TParams, TResponse> {
  name: string;
  description: string;
  parameters: ZodTypeAny;
  /** Server endpoint path (relative to /api/internal/openclaw/). */
  endpoint: string;
  /** Build the POST body from validated params + founderUserId. */
  buildBody: (
    params: TParams,
    founderUserId: string,
  ) => Record<string, unknown>;
  /** Format a successful server response into tool result text. */
  formatSuccess: (response: TResponse) => ToolResult;
}

export interface WriteToolFactoryOptions {
  http: OpenClawHttpClient;
  founderUserId: string;
  variant: ApprovalVariant;
  messaging?: MessagingService;
  approvalCallbackTimeoutMs: number;
  auditSink?: WriteAuditSink;
  now?: () => number;
  log?: (
    level: "debug" | "info" | "warn" | "error",
    message: string,
    fields?: Record<string, unknown>,
  ) => void;
}

export interface WriteToolParts<TParams> {
  tool: ToolDefinition<TParams>;
  toolCallPreHook: HookHandler<"tool_call_pre"> | null;
  toolCallPostHook: HookHandler<"tool_call_post">;
}

export function createWriteTool<TParams, TResponse>(
  spec: WriteToolSpec<TParams, TResponse>,
  opts: WriteToolFactoryOptions,
): WriteToolParts<TParams> {
  const log = opts.log ?? (() => undefined);
  const now = opts.now ?? Date.now;
  const approvalState = new Map<string, ApprovalDecision>();

  const tool: ToolDefinition<TParams> = {
    name: spec.name,
    description: spec.description,
    parameters: spec.parameters,
    optional: true,
    ...(shouldUseNativeRequiresConfirmation(opts.variant)
      ? { requiresConfirmation: true }
      : {}),
    execute: async (invocationId, params) => {
      if (shouldRunCustomApprovalGate(opts.variant)) {
        const decision = approvalState.get(invocationId);
        approvalState.delete(invocationId);
        if (!decision) {
          return rejectedResult(
            spec.name,
            "approval state missing — internal error",
            opts.variant,
          );
        }
        if (decision.status !== "approved") {
          return rejectedResult(
            spec.name,
            decision.reason,
            opts.variant,
            decision,
          );
        }
      }

      try {
        const body = spec.buildBody(params, opts.founderUserId);
        const response = await opts.http.post<TResponse>(spec.endpoint, body);

        if (opts.auditSink) {
          await opts
            .auditSink({
              approvalId: invocationId,
              tool: spec.name,
              founderUserId: opts.founderUserId,
              invocationId,
              action: "executed",
              input: body,
              httpStatus: 200,
              ok: true,
              responseExcerpt: JSON.stringify(response).slice(0, 500),
              variant: opts.variant,
            })
            .catch((err) => {
              log("warn", "openclaw.write_audit.executed_record_failed", {
                tool: spec.name,
                error: err instanceof Error ? err.message : String(err),
              });
            });
        }

        return spec.formatSuccess(response);
      } catch (err) {
        if (opts.auditSink) {
          const httpStatus =
            err instanceof OpenClawHttpError ? err.status : undefined;
          await opts
            .auditSink({
              approvalId: invocationId,
              tool: spec.name,
              founderUserId: opts.founderUserId,
              invocationId,
              action: "executed",
              httpStatus,
              ok: false,
              responseExcerpt:
                err instanceof Error ? err.message.slice(0, 500) : undefined,
              variant: opts.variant,
            })
            .catch(() => undefined);
        }
        return formatExecutionError(spec.name, err);
      }
    },
  };

  const toolCallPreHook: HookHandler<"tool_call_pre"> | null =
    shouldRunCustomApprovalGate(opts.variant)
      ? async (ctx) => {
          if (ctx.toolName !== spec.name) return { ok: true };
          if (!opts.messaging) {
            return {
              ok: false,
              reason: "Messaging service unavailable for approval flow",
              status: "approval_rejected",
            };
          }

          const start = now();
          const promptText = renderApprovalPrompt(spec.name, ctx.params);
          const keyboard = buildApprovalKeyboard(ctx.invocationId);

          try {
            const sent = await opts.messaging.send(promptText, {
              replyMarkup: keyboard,
            });
            const callback = await opts.messaging.waitForCallback(
              sent.messageId,
              { timeoutMs: opts.approvalCallbackTimeoutMs },
            );
            const decoded = decodeApprovalCallback(callback.callbackData);

            const latencyMs = Math.max(0, now() - start);
            if (decoded.status === "approved") {
              const decision: ApprovalDecision = {
                status: "approved",
                reason: "user clicked Approve",
                latencyMs,
              };
              approvalState.set(ctx.invocationId, decision);
              if (opts.auditSink) {
                await opts
                  .auditSink({
                    approvalId: ctx.invocationId,
                    tool: spec.name,
                    founderUserId: opts.founderUserId,
                    invocationId: ctx.invocationId,
                    action: "approved",
                    input: ctx.params,
                    variant: opts.variant,
                  })
                  .catch((err) => {
                    log("warn", "openclaw.write_audit.approval_record_failed", {
                      tool: spec.name,
                      error: err instanceof Error ? err.message : String(err),
                    });
                  });
              }
              return { ok: true };
            }

            const decision: ApprovalDecision = {
              status: decoded.status === "rejected" ? "rejected" : "timeout",
              reason:
                decoded.status === "rejected"
                  ? "user clicked Reject"
                  : "approval callback malformed",
              latencyMs,
            };
            approvalState.set(ctx.invocationId, decision);
            if (opts.auditSink) {
              await opts
                .auditSink({
                  approvalId: ctx.invocationId,
                  tool: spec.name,
                  founderUserId: opts.founderUserId,
                  invocationId: ctx.invocationId,
                  action: "rejected",
                  input: ctx.params,
                  variant: opts.variant,
                })
                .catch(() => undefined);
            }
            return {
              ok: false,
              reason: `Approval ${decision.status}`,
              status: "approval_rejected",
            };
          } catch (err) {
            const latencyMs = Math.max(0, now() - start);
            const decision: ApprovalDecision = {
              status: "timeout",
              reason:
                err instanceof Error
                  ? `approval flow error: ${err.message}`
                  : "approval flow error",
              latencyMs,
            };
            approvalState.set(ctx.invocationId, decision);
            if (opts.auditSink) {
              await opts
                .auditSink({
                  approvalId: ctx.invocationId,
                  tool: spec.name,
                  founderUserId: opts.founderUserId,
                  invocationId: ctx.invocationId,
                  action: "rejected",
                  input: ctx.params,
                  variant: opts.variant,
                })
                .catch(() => undefined);
            }
            return {
              ok: false,
              reason: decision.reason,
              status: "approval_rejected",
            };
          }
        }
      : null;

  const toolCallPostHook: HookHandler<"tool_call_post"> = async (ctx) => {
    if (ctx.toolName !== spec.name) return { ok: true };
    if (opts.variant === "B") return { ok: true };
    if (opts.auditSink) {
      const okStatus = ctx.result.ok;
      const decision: ApprovalDecision = okStatus
        ? {
            status: "approved",
            reason: "SDK-native approval + execute success",
            latencyMs: ctx.durationMs,
          }
        : {
            status: "rejected",
            reason: ctx.result.ok
              ? "execute failed"
              : (ctx.result as { ok: false; error: string }).error,
            latencyMs: ctx.durationMs,
          };
      await opts
        .auditSink({
          approvalId: ctx.invocationId,
          tool: spec.name,
          founderUserId: opts.founderUserId,
          invocationId: ctx.invocationId,
          action: okStatus ? "executed" : "rejected",
          variant: opts.variant,
        })
        .catch(() => undefined);
      void decision;
    }
    return { ok: true };
  };

  return { tool, toolCallPreHook, toolCallPostHook };
}

// ─── Shared helpers ─────────────────────────────────────────────────────

function rejectedResult(
  toolName: string,
  reason: string,
  variant: ApprovalVariant,
  decision?: ApprovalDecision,
): ToolResult {
  return {
    content: [
      {
        type: "text",
        text: `❌ ${toolName} rejected (variant ${variant}): ${reason}`,
      },
      ...(decision
        ? [
            {
              type: "structured" as const,
              data: { decision, variant },
            },
          ]
        : []),
    ],
    rejected: true,
  };
}

function formatExecutionError(toolName: string, err: unknown): ToolResult {
  if (err instanceof OpenClawHttpError) {
    return {
      content: [
        {
          type: "text",
          text: `${toolName} failed: HTTP ${err.status} (${err.responseText.slice(0, 200)})`,
        },
      ],
    };
  }
  const message = err instanceof Error ? err.message : "unknown error";
  return {
    content: [{ type: "text", text: `${toolName} failed: ${message}` }],
  };
}
