/**
 * `create_github_issue` write-tool — Phase 0.5 PoC's only write-tool.
 *
 * Цей файл — _єдина точка_ де PoC прогоняє всі три approval variant-и.
 * Каркас:
 *
 *   factory(opts) → {
 *     tool: ToolDefinition (з/без `requiresConfirmation`),
 *     toolCallPreHook: HookHandler<"tool_call_pre"> | null,
 *     toolCallPostHook: HookHandler<"tool_call_post">,
 *   }
 *
 * `index.ts` тоді робить:
 *
 *   api.registerTool(parts.tool);
 *   if (parts.toolCallPreHook) api.registerHook("tool_call_pre", parts.toolCallPreHook);
 *   api.registerHook("tool_call_post", parts.toolCallPostHook);
 *
 * Це дає чисте тестування кожного variant-у незалежно.
 *
 * Контракт із server (`apps/server/src/routes/internal/openclaw.ts` →
 * `commitToStrategyDoc` / `createGithubIssue` family):
 *   POST /api/internal/openclaw/write/create-github-issue
 *     {
 *       founderUserId: string,
 *       title: string,
 *       body: string,
 *       labels?: string[],
 *       repoSlug?: string  // default sergeant-monorepo
 *     }
 *   →
 *     {
 *       url: string,
 *       number: number,
 *       title: string
 *     }
 */

import { z } from "zod";
import type { OpenClawHttpClient } from "./../http-client.js";
import { OpenClawHttpError } from "./../http-client.js";
import type {
  ToolDefinition,
  HookHandler,
  PluginApi,
  ToolResult,
} from "./../sdk-types.js";
import {
  type ApprovalVariant,
  type ApprovalDecision,
  buildApprovalKeyboard,
  decodeApprovalCallback,
  renderApprovalPrompt,
  shouldRunCustomApprovalGate,
  shouldUseNativeRequiresConfirmation,
} from "./approval-variants.js";

export const CreateGithubIssueParamsSchema = z.object({
  title: z.string().min(1).max(256),
  body: z.string().min(1).max(8000),
  labels: z.array(z.string().min(1).max(64)).max(10).optional(),
  repoSlug: z
    .string()
    .regex(/^[\w.-]+\/[\w.-]+$/, "repoSlug must be 'owner/repo' format")
    .optional(),
});

export type CreateGithubIssueParams = z.infer<
  typeof CreateGithubIssueParamsSchema
>;

interface CreateGithubIssueResponse {
  url: string;
  number: number;
  title: string;
}

export interface CreateGithubIssueOptions {
  http: OpenClawHttpClient;
  founderUserId: string;
  variant: ApprovalVariant;
  /** Injected SDK services — for messaging (Variant B). */
  messaging?: PluginApi["services"]["messaging"];
  /** Callback wait timeout (Variant B). */
  approvalCallbackTimeoutMs: number;
  /** Optional injected clock for tests (latency tracking). */
  now?: () => number;
  /**
   * Optional sink for audit records (Variant C + B post-decision audit).
   * Phase 4 (PR-D) wires this до `openclaw_write_audit` write через
   * /audit/write endpoint.
   */
  recordAudit?: (record: {
    invocationId: string;
    toolName: string;
    decision: ApprovalDecision;
    params: Record<string, unknown>;
    variant: ApprovalVariant;
  }) => Promise<void>;
  /** Logger from SDK (default no-op). */
  log?: (
    level: "debug" | "info" | "warn" | "error",
    message: string,
    fields?: Record<string, unknown>,
  ) => void;
}

export interface CreateGithubIssueParts {
  tool: ToolDefinition<CreateGithubIssueParams>;
  toolCallPreHook: HookHandler<"tool_call_pre"> | null;
  toolCallPostHook: HookHandler<"tool_call_post">;
}

const TOOL_NAME = "create_github_issue";
const TOOL_DESCRIPTION = `Create a GitHub issue в Sergeant repo (default
'Skords-01/sergeant'). WRITE TOOL — gated behind founder approval. Returns
issue number and URL on success. Use for: bug reports surfaced in
conversation, todo-items the founder asks to track outside Telegram.`;

export function createCreateGithubIssueTool(
  opts: CreateGithubIssueOptions,
): CreateGithubIssueParts {
  const log = opts.log ?? (() => undefined);
  const now = opts.now ?? Date.now;
  // Variant B holding pen — keyed by invocationId so tool_call_pre can
  // pass approval verdict to execute(). Map cleared after consumption.
  const approvalState = new Map<string, ApprovalDecision>();

  const tool: ToolDefinition<CreateGithubIssueParams> = {
    name: TOOL_NAME,
    description: TOOL_DESCRIPTION,
    parameters: CreateGithubIssueParamsSchema,
    optional: true,
    ...(shouldUseNativeRequiresConfirmation(opts.variant)
      ? { requiresConfirmation: true }
      : {}),
    execute: async (invocationId, params) => {
      // Variant B: tool_call_pre may have set rejection/timeout state.
      if (shouldRunCustomApprovalGate(opts.variant)) {
        const decision = approvalState.get(invocationId);
        approvalState.delete(invocationId);
        if (!decision) {
          // Defensive: tool_call_pre має завжди bootstrap-ити стан, але
          // якщо щось пішло не так — fail-closed.
          return rejectedResult(
            "approval state missing — internal error",
            opts.variant,
          );
        }
        if (decision.status !== "approved") {
          log("warn", "openclaw.write.rejected_by_user", {
            invocationId,
            decision,
          });
          return rejectedResult(decision.reason, opts.variant, decision);
        }
      }

      // Variant A / C: SDK handled approval; plugin just executes.
      try {
        const response = await opts.http.post<CreateGithubIssueResponse>(
          "/write/create-github-issue",
          {
            founderUserId: opts.founderUserId,
            title: params.title,
            body: params.body,
            labels: params.labels,
            repoSlug: params.repoSlug,
          },
        );
        return {
          content: [
            {
              type: "text",
              text: `✅ created issue #${response.number}: ${response.title}\n${response.url}`,
            },
            {
              type: "structured",
              data: {
                url: response.url,
                number: response.number,
                title: response.title,
              },
            },
          ],
        };
      } catch (err) {
        return formatExecutionError(err);
      }
    },
  };

  const toolCallPreHook: HookHandler<"tool_call_pre"> | null =
    shouldRunCustomApprovalGate(opts.variant)
      ? async (ctx) => {
          if (ctx.toolName !== TOOL_NAME) return { ok: true };
          if (!opts.messaging) {
            return {
              ok: false,
              reason: "Messaging service unavailable for approval flow",
              status: "approval_rejected",
            };
          }

          const start = now();
          const promptText = renderApprovalPrompt(TOOL_NAME, ctx.params);
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
              if (opts.recordAudit) {
                await opts.recordAudit({
                  invocationId: ctx.invocationId,
                  toolName: TOOL_NAME,
                  decision,
                  params: ctx.params,
                  variant: opts.variant,
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
            if (opts.recordAudit) {
              await opts.recordAudit({
                invocationId: ctx.invocationId,
                toolName: TOOL_NAME,
                decision,
                params: ctx.params,
                variant: opts.variant,
              });
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
            if (opts.recordAudit) {
              await opts.recordAudit({
                invocationId: ctx.invocationId,
                toolName: TOOL_NAME,
                decision,
                params: ctx.params,
                variant: opts.variant,
              });
            }
            return {
              ok: false,
              reason: decision.reason,
              status: "approval_rejected",
            };
          }
        }
      : null;

  // tool_call_post — for Variant C (native approval + plugin audit) and
  // Variant A (audit-only); both записують post-execution outcome.
  const toolCallPostHook: HookHandler<"tool_call_post"> = async (ctx) => {
    if (ctx.toolName !== TOOL_NAME) return { ok: true };
    if (opts.variant === "B") {
      // Variant B уже записав audit у tool_call_pre; не дублюємо.
      return { ok: true };
    }
    if (opts.recordAudit) {
      const okStatus = ctx.result.ok;
      const decision: ApprovalDecision = okStatus
        ? {
            status: "approved",
            reason: "SDK-native approval + execute success",
            latencyMs: ctx.durationMs,
          }
        : {
            status: "rejected",
            reason: ctx.result.error ?? "execute failed",
            latencyMs: ctx.durationMs,
          };
      await opts.recordAudit({
        invocationId: ctx.invocationId,
        toolName: TOOL_NAME,
        decision,
        params: ctx.params,
        variant: opts.variant,
      });
    }
    return { ok: true };
  };

  return { tool, toolCallPreHook, toolCallPostHook };
}

function rejectedResult(
  reason: string,
  variant: ApprovalVariant,
  decision?: ApprovalDecision,
): ToolResult {
  return {
    content: [
      {
        type: "text",
        text: `❌ create_github_issue rejected (variant ${variant}): ${reason}`,
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

function formatExecutionError(err: unknown): ToolResult {
  if (err instanceof OpenClawHttpError) {
    return {
      content: [
        {
          type: "text",
          text: `create_github_issue failed: HTTP ${err.status} (${err.responseText.slice(
            0,
            200,
          )})`,
        },
      ],
    };
  }
  const message = err instanceof Error ? err.message : "unknown error";
  return {
    content: [{ type: "text", text: `create_github_issue failed: ${message}` }],
  };
}
