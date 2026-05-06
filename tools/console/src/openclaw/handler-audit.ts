/**
 * Approval / write-audit helpers split out of `handler.ts` (PR-36).
 *
 * Three responsibilities:
 *   1) `createAuditLogger` — fire-and-forget POST to
 *      `/api/internal/openclaw/write-audit/log` (ADR-0037 Phase 4.5).
 *      Fail-soft: a 5xx must NOT block the user-visible feedback;
 *      we only `console.warn` on failure so Railway logs surface
 *      persistence problems.
 *   2) `postApprovalCard` — render an inline-keyboard card summarising
 *      a pending write-tool approval (ADR-0036 Phase 4). Pure function
 *      of `(ctx, record)` — no external state captured.
 *   3) `createWriteToolExecutor` — POST to the resolved
 *      `/api/internal/openclaw/write/*` route after Approve. Returns
 *      raw response so the caller can show the founder a PR URL or an
 *      error excerpt.
 */

import { InlineKeyboard, type Context } from "grammy";
import { writeToolRoute } from "../agents/openclaw.js";
import type { ApprovalRecord } from "./approval-store.js";
import { escapeTelegramMarkdownV2 } from "../security.js";
import {
  APPROVAL_APPROVE,
  APPROVAL_REJECT,
  RESPONSE_EXCERPT_MAX_BYTES,
  WRITE_TOOL_LABEL,
  postJson,
  summariseWriteInput,
  type WriteAuditLogBody,
} from "./handler-constants.js";

/**
 * Build a fire-and-forget `logWriteAudit` bound to one server URL +
 * API key. Closure intentional — we want one logger per process so
 * unit tests can swap fetch implementations without leaking state.
 */
export function createAuditLogger(
  serverUrl: string,
  internalApiKey: string,
): (body: WriteAuditLogBody) => Promise<void> {
  return async function logWriteAudit(body: WriteAuditLogBody): Promise<void> {
    const truncatedExcerpt =
      body.responseExcerpt == null
        ? body.responseExcerpt
        : body.responseExcerpt.length > RESPONSE_EXCERPT_MAX_BYTES
          ? body.responseExcerpt.slice(0, RESPONSE_EXCERPT_MAX_BYTES)
          : body.responseExcerpt;
    try {
      const r = await postJson<{ ok: boolean; id?: number }>(
        `${serverUrl}/api/internal/openclaw/write-audit/log`,
        internalApiKey,
        { ...body, responseExcerpt: truncatedExcerpt },
      );
      if (!r.ok) {
        console.warn("[openclaw] write-audit log failed", {
          status: r.status,
          tool: body.tool,
          action: body.action,
          approvalId: body.approvalId,
        });
      }
    } catch (err) {
      console.warn("[openclaw] write-audit log error", {
        error: err instanceof Error ? err.message : String(err),
        tool: body.tool,
        action: body.action,
        approvalId: body.approvalId,
      });
    }
  };
}

/**
 * ADR-0036 (Phase 4): post an inline-keyboard card summarising a
 * pending write-tool approval. Card shows tool label + summary; two
 * buttons (Approve / Reject) carry the approval-id in callback_data.
 *
 * Telegram strips MarkdownV2 tags from button text — only the body
 * uses MarkdownV2. We escape carefully to keep the inline `path` /
 * `topic` chunks readable while staying valid.
 */
export async function postApprovalCard(
  ctx: Context,
  record: ApprovalRecord,
): Promise<void> {
  const label = WRITE_TOOL_LABEL[record.tool];
  const summary = summariseWriteInput(record);
  const body = [
    `*${label}*`,
    "",
    summary,
    "",
    `_id: \`${record.id}\` · expires in 10 min_`,
  ].join("\n");

  const keyboard = new InlineKeyboard()
    .text("✅ Approve", `${APPROVAL_APPROVE}${record.id}`)
    .text("✋ Reject", `${APPROVAL_REJECT}${record.id}`);

  const safe = escapeTelegramMarkdownV2(body);
  await ctx.reply(safe, {
    parse_mode: "MarkdownV2",
    reply_markup: keyboard,
  });
}

/**
 * Execute an approved write-tool. Resolves the route via the shared
 * registry on the agent module and posts to the corresponding
 * `/api/internal/openclaw/write/*` endpoint. Returns the raw response
 * body (string) which the caller surfaces to the founder so that PR
 * URLs / error messages are visible.
 */
export function createWriteToolExecutor(
  serverUrl: string,
  internalApiKey: string,
): (
  record: ApprovalRecord,
) => Promise<{ ok: boolean; status: number; bodyText: string }> {
  return async function executeApprovedWriteTool(record) {
    const route = writeToolRoute(record.tool);
    if (!route) {
      return {
        ok: false,
        status: 0,
        bodyText: `Unknown write-tool route for ${record.tool}.`,
      };
    }
    try {
      const res = await fetch(`${serverUrl}${route}`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${internalApiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(record.input),
      });
      const bodyText = await res.text();
      return { ok: res.ok, status: res.status, bodyText };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return { ok: false, status: 0, bodyText: `Network error: ${message}` };
    }
  };
}
