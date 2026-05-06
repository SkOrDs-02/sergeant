/**
 * `runAgentTurn` factory split out of `handler.ts` (PR-36).
 *
 * Single agent turn for both free-form DM messages and slash-command
 * shortcuts (`/status`, `/metrics`, `/ops <q>`, …). Owns the audit-log
 * lifecycle (open → finalize) plus per-turn budget gate. The agent
 * loop itself lives in `tools/console/src/agents/openclaw.ts` —
 * we just wire deps and surface the reply.
 *
 * Boundary semantics (fail-closed):
 *   - 1) `invocation_id` opened up-front so even budget-exceeded /
 *        per-call-cap rejections leave an audit row.
 *   - 2) Budget pre-check is a separate HTTP probe; caller can skip
 *        it for council sub-turns where the outer command already
 *        verified headroom.
 *   - 3) Errors finalize with status `error` or `per_call_cap_exceeded`
 *        so the operator can distinguish API faults from policy gates.
 *   - 4) `silent: true` skips the chat reply but STILL drains the
 *        approval queue — a specialist persona's write-action must
 *        still be approvable by the founder.
 */

import type Anthropic from "@anthropic-ai/sdk";
import type { Context } from "grammy";
import {
  runOpenClawAgent,
  type OpenClawAgentDeps,
} from "../agents/openclaw.js";
import type { OpenClawPersona } from "../agents/personas.js";
import { PerCallCapExceededError } from "./policy.js";
import {
  ApprovalStore,
  PendingApprovalsCollector,
  type ApprovalRecord,
} from "./approval-store.js";
import { escapeTelegramMarkdownV2, splitTelegramMessage } from "../security.js";
import { parseFounderTgUserId } from "./security.js";
import type { OpenClawSessionStore } from "./session.js";
import {
  postJson,
  type BudgetResponse,
  type OpenInvocationResponse,
} from "./handler-constants.js";

export interface AgentTurnDeps {
  anthropic: Anthropic;
  serverUrl: string;
  internalApiKey: string;
  founderUserId: string;
  maxIterations: number;
  sessions: OpenClawSessionStore;
  approvalStore: ApprovalStore;
  postApprovalCard: (ctx: Context, record: ApprovalRecord) => Promise<void>;
}

export interface RunAgentTurnOptions {
  /** Skip auto-reply to chat (caller will batch-reply or aggregate). */
  silent?: boolean;
  /** Override iteration cap (default — config.maxIterations). */
  maxIterationsOverride?: number;
  /** Pre-checked budget; skip the second HTTP probe. */
  skipBudgetCheck?: boolean;
  /** Tag in audit-log metadata to mark council sub-turns. */
  metadataExtras?: Record<string, unknown>;
}

export type AgentTurnTrigger =
  | "dm"
  | "morning_ritual"
  | "weekly_review"
  | "monthly_okr";

export type AgentTurnRunner = (
  ctx: Context,
  userMessage: string,
  trigger: AgentTurnTrigger,
  persona?: OpenClawPersona,
  options?: RunAgentTurnOptions,
) => Promise<{ reply: string; ok: boolean }>;

/**
 * Build a `runAgentTurn` bound to one set of deps. Closure-style so
 * stateful values (sessions, approvalStore) are captured exactly once
 * per process and tests can construct an independent runner.
 */
export function createAgentTurnRunner(deps: AgentTurnDeps): AgentTurnRunner {
  const {
    anthropic,
    serverUrl,
    internalApiKey,
    founderUserId,
    maxIterations,
    sessions,
    approvalStore,
    postApprovalCard,
  } = deps;

  const baseDeps: OpenClawAgentDeps = {
    serverUrl,
    internalApiKey,
    founderUserId,
  };

  return async function runAgentTurn(
    ctx,
    userMessage,
    trigger,
    persona,
    options,
  ) {
    const userId = ctx.from?.id;
    const founderTgUserId = parseFounderTgUserId(
      process.env["OPENCLAW_FOUNDER_TG_USER_ID"],
    );
    if (!userId || !founderTgUserId) {
      await ctx.reply("OpenClaw not configured (missing founder TG id).");
      return { reply: "", ok: false };
    }

    // 1) Open invocation row у audit-log (status=success, потім finalize-имо).
    const openRes = await postJson<OpenInvocationResponse>(
      `${serverUrl}/api/internal/openclaw/invocations/open`,
      internalApiKey,
      {
        founderUserId,
        founderTgUserId,
        trigger,
        userMessage,
        metadata: {
          telegramChatId: ctx.chat?.id,
          persona: persona ?? "cofounder",
          ...(options?.metadataExtras ?? {}),
        },
      },
    );
    const invocationId = openRes.data?.invocationId;

    // 2) Budget pre-check (skipped — caller уже перевірив, як у council mode).
    if (!options?.skipBudgetCheck) {
      const budget = await postJson<BudgetResponse>(
        `${serverUrl}/api/internal/openclaw/budget`,
        internalApiKey,
        { founderUserId },
      );
      if (!budget.ok || !budget.data?.allowed) {
        const spent = budget.data?.spentUsd ?? 0;
        const cap = budget.data?.budgetUsd ?? 0;
        await ctx.reply(
          `OpenClaw quota exceeded for today ($${spent.toFixed(2)} / $${cap.toFixed(2)}). Спробуй завтра.`,
        );
        if (invocationId) {
          await postJson(
            `${serverUrl}/api/internal/openclaw/invocations/finalize`,
            internalApiKey,
            {
              invocationId,
              status: "budget_exceeded",
              assistantResponse: null,
              errorMessage: "daily budget exceeded",
            },
          );
        }
        return { reply: "", ok: false };
      }
    }

    // 3) Run agent loop.
    if (!options?.silent) await ctx.replyWithChatAction("typing");
    const startedAt = Date.now();

    // ADR-0036 (Phase 4): per-turn collector. The agent executor pushes
    // approval-records into this whenever the LLM emits a write-tool
    // call. After the turn finishes we drain it and post inline-keyboard
    // buttons.
    const pendingCollector = new PendingApprovalsCollector();

    try {
      const {
        reply,
        toneMode,
        persona: personaUsed,
      } = await runOpenClawAgent({
        client: anthropic,
        userMessage,
        founderHandle: ctx.from?.username
          ? `@${ctx.from.username}`
          : `id:${userId}`,
        trigger,
        maxIterations: options?.maxIterationsOverride ?? maxIterations,
        persona,
        deps: {
          ...baseDeps,
          founderTgUserId,
          invocationId,
          approvalStore,
          pendingCollector,
        },
      });
      const durationMs = Date.now() - startedAt;
      sessions.recordTurn(userId, {
        lastInvocationId: invocationId,
        lastToneMode: toneMode,
      });

      if (!options?.silent) {
        const safe = escapeTelegramMarkdownV2(reply);
        for (const chunk of splitTelegramMessage(safe)) {
          await ctx.reply(chunk, { parse_mode: "MarkdownV2" });
        }
      }

      // ADR-0036 (Phase 4): drain queued approvals and post inline-
      // keyboard cards. We do this AFTER the narrative reply so the
      // founder sees both the LLM's reasoning and the proposed action.
      // We drain even when silent=true (council sub-turns): if a
      // specialist persona proposed a write-action, founder still needs
      // to be able to approve/reject it.
      const queued = pendingCollector.drain();
      for (const record of queued) {
        await postApprovalCard(ctx, record);
      }

      if (invocationId) {
        // Phase 1 не парсить cost з Anthropic-response (run-agent-loop не
        // повертає usage). Залишаємо 0 — Phase 2 wires precise accounting
        // через intercept-у `runAgentLoop` або custom client wrapper.
        await postJson(
          `${serverUrl}/api/internal/openclaw/invocations/finalize`,
          internalApiKey,
          {
            invocationId,
            status: "success",
            assistantResponse: reply,
            durationMs,
            toneMode,
            metadata: { persona: personaUsed },
          },
        );
      }
      return { reply, ok: true };
    } catch (err) {
      const durationMs = Date.now() - startedAt;
      const message = err instanceof Error ? err.message : String(err);
      // M18: per-call USD cap. Surface the structured rejection
      // (projected vs cap) so the operator sees *why* the call was
      // refused without us spending tokens. The metric is already
      // incremented inside `runOpenClawAgent`; here we just emit a
      // distinct telemetry status and a founder-readable reply.
      const isPerCallCap = err instanceof PerCallCapExceededError;
      console.error("OpenClaw agent error:", message);
      if (!options?.silent) {
        if (isPerCallCap) {
          const projected = err.projectedUsd.toFixed(4);
          const cap = err.capUsd.toFixed(2);
          await ctx.reply(
            `Запит відхилено: проєктна вартість виклику $${projected} перевищує per-call cap $${cap} (model=${err.model}, max_tokens=${err.maxTokens}). Зменши scope або підніми OPENCLAW_MAX_PER_CALL_USD.`,
          );
        } else {
          await ctx.reply("Помилка під час обробки. Спробуй ще раз.");
        }
      }
      if (invocationId) {
        await postJson(
          `${serverUrl}/api/internal/openclaw/invocations/finalize`,
          internalApiKey,
          {
            invocationId,
            status: isPerCallCap ? "per_call_cap_exceeded" : "error",
            errorMessage: message,
            durationMs,
          },
        );
      }
      return { reply: "", ok: false };
    }
  };
}
