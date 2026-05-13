/**
 * Inline-keyboard callback handler for the OpenClaw bot.
 *
 * Split out of `handler-commands.ts` (PR-36 follow-up). Owns the single
 * `bot.on("callback_query:data")` listener — three branches:
 *
 * 1. **Persona quick-row** (`PERSONA_CALLBACK_PREFIX`) — turns a tap on
 *    a persona button into a synthetic `/persona` slash-command.
 * 2. **Help keyboard** (`oc:cmd:*`) — same idea for the help-menu
 *    shortcuts.
 * 3. **Approval card** (ADR-0036 Phase 4) — approve / reject pending
 *    write-tool invocations. Fail-closed: only the founder can resolve;
 *    expired/unknown ids return a friendly "expired" callback answer
 *    rather than executing. ADR-0037 (Phase 4.5) adds the paired audit
 *    rows (`approved`/`rejected` and the `executed` follow-up).
 */

import { isFounderAllowed } from "./security.js";
import { escapeTelegramMarkdownV2, splitTelegramMessage } from "../security.js";
import type { HandlerContext } from "./handler-context.js";
import {
  PERSONA_CALLBACK_PREFIX,
  WRITE_TOOL_LABEL,
  parseApprovalCallback,
} from "./handler-constants.js";

export function registerCallbackHandlers(ctx: HandlerContext): void {
  const {
    bot,
    approvalStore,
    executeApprovedWriteTool,
    logWriteAudit,
    isAllowedDmContext,
  } = ctx;

  // ADR-0036 (Phase 4): inline-keyboard callback handler — approves
  // or rejects a pending write-tool. Fail-closed: only the founder
  // may resolve approvals; expired / unknown ids return a friendly
  // "expired" answer-callback rather than executing.
  bot.on("callback_query:data", async (c) => {
    const data = c.callbackQuery.data;

    // O7: persona quick-row + help keyboard callbacks
    if (data.startsWith(PERSONA_CALLBACK_PREFIX)) {
      if (!isAllowedDmContext(c)) {
        await c.answerCallbackQuery({
          text: "Access denied.",
          show_alert: true,
        });
        return;
      }
      const persona = data.slice(PERSONA_CALLBACK_PREFIX.length);
      await c.answerCallbackQuery();
      await c.reply(`/${persona}`);
      return;
    }
    if (data.startsWith("oc:cmd:")) {
      if (!isAllowedDmContext(c)) {
        await c.answerCallbackQuery({
          text: "Access denied.",
          show_alert: true,
        });
        return;
      }
      const cmd = data.slice("oc:cmd:".length);
      await c.answerCallbackQuery();
      await c.reply(`/${cmd}`);
      return;
    }

    const parsed = parseApprovalCallback(data);
    if (!parsed) {
      // Not ours — answer empty so the spinner stops, but otherwise
      // ignore (other features may add their own callbacks later).
      await c.answerCallbackQuery();
      return;
    }

    if (!isFounderAllowed(c.from?.id, process.env)) {
      await c.answerCallbackQuery({
        text: "Access denied.",
        show_alert: true,
      });
      return;
    }

    const record = approvalStore.get(parsed.id);
    if (!record) {
      await c.answerCallbackQuery({
        text: "Approval expired or unknown. Спробуй ще раз.",
        show_alert: true,
      });
      try {
        await c.editMessageReplyMarkup({});
      } catch {
        // Old card may already be edited / removed; not fatal.
      }
      return;
    }

    if (parsed.kind === "reject") {
      approvalStore.markRejected(parsed.id);
      await c.answerCallbackQuery({ text: "Rejected." });
      try {
        await c.editMessageReplyMarkup({});
      } catch {
        // Card may have been edited concurrently — best-effort UI cleanup.
      }
      const note = `❌ Rejected: ${WRITE_TOOL_LABEL[record.tool]} (id ${record.id}).`;
      await c.reply(note);
      console.log("[openclaw] write-tool rejected", {
        tool: record.tool,
        id: record.id,
        founderTgUserId: c.from?.id,
        invocationId: record.invocationId,
      });
      // ADR-0037 (Phase 4.5): persist the rejection so post-mortems
      // survive a console restart. Fire-and-forget, fail-soft.
      void logWriteAudit({
        approvalId: record.id,
        tool: record.tool,
        founderUserId: record.founderUserId,
        founderTgUserId: record.founderTgUserId,
        invocationId: record.invocationId ?? null,
        action: "rejected",
        input: record.input,
        persona: record.persona ?? null,
      });
      return;
    }

    // Approve path — mark first so a double-click can't double-execute,
    // then call the write endpoint.
    approvalStore.markExecuted(parsed.id);
    await c.answerCallbackQuery({ text: "Executing…" });
    try {
      await c.editMessageReplyMarkup({});
    } catch {
      // Best-effort; we still post the result below.
    }

    // ADR-0037 (Phase 4.5): write `approved` row BEFORE the HTTP call.
    // Pairing this with the later `executed` row by `approval_id` lets
    // us measure approve-to-executed latency AND detect "approved but
    // never executed" failures (executor crashed mid-flight).
    void logWriteAudit({
      approvalId: record.id,
      tool: record.tool,
      founderUserId: record.founderUserId,
      founderTgUserId: record.founderTgUserId,
      invocationId: record.invocationId ?? null,
      action: "approved",
      input: record.input,
      persona: record.persona ?? null,
    });

    const result = await executeApprovedWriteTool(record);
    const headline = result.ok
      ? `✅ Executed: ${WRITE_TOOL_LABEL[record.tool]}`
      : `⚠️ Failed: ${WRITE_TOOL_LABEL[record.tool]} (HTTP ${result.status})`;
    const safe = escapeTelegramMarkdownV2(
      [headline, "", "```", result.bodyText.slice(0, 3500), "```"].join("\n"),
    );
    for (const chunk of splitTelegramMessage(safe)) {
      await c.reply(chunk, { parse_mode: "MarkdownV2" });
    }
    console.log("[openclaw] write-tool executed", {
      tool: record.tool,
      id: record.id,
      ok: result.ok,
      status: result.status,
      founderTgUserId: c.from?.id,
      invocationId: record.invocationId,
    });
    // ADR-0037 (Phase 4.5): pair-row to the `approved` above. Carries
    // upstream HTTP status + truncated response excerpt so post-mortems
    // see exactly what the API returned.
    void logWriteAudit({
      approvalId: record.id,
      tool: record.tool,
      founderUserId: record.founderUserId,
      founderTgUserId: record.founderTgUserId,
      invocationId: record.invocationId ?? null,
      action: "executed",
      input: record.input,
      httpStatus: result.status,
      ok: result.ok,
      responseExcerpt: result.bodyText,
      persona: record.persona ?? null,
    });
  });
}
