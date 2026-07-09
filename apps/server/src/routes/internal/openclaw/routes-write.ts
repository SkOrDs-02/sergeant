/**
 * OpenClaw internal sub-router: ADR-0036 (Phase 4) write-tools +
 * ADR-0037 (Phase 4.5) persistent write-audit log.
 * Split from `routes/internal/openclaw.ts` (Hard Rule #18).
 *
 * Side-effecting operations. Console approves with the founder via
 * inline-keyboard before invoking these. Each endpoint performs exactly
 * ONE upstream call; on missing credentials they return
 * `{ status: 'not_configured' }` so the audit-log captures the attempt
 * without throwing 5xx.
 */

import type { Router } from "express";
import type { Pool } from "pg";
import { env } from "../../../env.js";
import { parseBody } from "../../../http/validate.js";
import {
  OpenClawAllowlistError,
  assertOpenClawRepoAllowed,
  // ADR-0036 (Phase 4): write-tools — invoked only after console-side approval.
  commitToStrategyDoc,
  createGithubIssue,
  postToTopic,
  pauseWorkflow,
  muteSentryAlert,
  OpenClawWriteAllowlistError,
  POST_TO_TOPIC_ALLOWLIST,
  // ADR-0037 (Phase 4.5): persistent write-audit log helpers.
  recordWriteAudit,
  listRecentWriteAudits,
  // ADR-0036 Phase 4 hardening: single-use approval nonce.
  newNonceId,
  signApprovalNonce,
  hashWriteArgs,
  issueApprovalNonce,
} from "../../../modules/openclaw/index.js";
import { recordTopicMessage } from "../../../modules/topic-archive/index.js";
import { logger } from "../../../obs/logger.js";
import { asAllowlistFailure } from "./helpers.js";
import { enforceWriteApproval } from "./approval-nonce-guard.js";
import {
  CommitStrategyDocBody,
  CreateGithubIssueBody,
  MintApprovalNonceBody,
  MuteAlertBody,
  PauseWorkflowBody,
  PostToTopicBody,
  WriteAuditListBody,
  WriteAuditLogBody,
} from "./schemas.js";

export function registerWriteRoutes(r: Router, pool: Pool): void {
  // Thin wrapper over `enforceWriteApproval` so each write route stays a
  // one-liner: `if (!(await approved(req, res, "<tool>", parsed))) return;`.
  // Returns `true` to proceed, `false` when a 401 was already written.
  const approved = (
    req: Parameters<typeof enforceWriteApproval>[0]["req"],
    res: Parameters<typeof enforceWriteApproval>[0]["res"],
    tool: string,
    writeArgs: unknown,
  ): Promise<boolean> =>
    enforceWriteApproval({ pool, req, res, tool, writeArgs });

  // ---- approval-nonce → mint a single-use, tool+args-bound approval nonce ----
  //
  // ADR-0036 Phase 4 hardening. The console (separate repo, tools/openclaw)
  // calls this at the moment it renders the founder's Approve keyboard,
  // passing the exact tool + args it will replay on the `/write/*` call. The
  // returned nonce is HMAC-signed over {jti, tool, argsHash, exp} and
  // recorded in `openclaw_approval_nonce` so it can only be spent once.
  //
  // Feature-gated on OPENCLAW_APPROVAL_NONCE_SECRET: when unset we return
  // `not_configured` (200) so the console degrades gracefully during the
  // staged rollout — mirrors the `not_configured` posture of the write
  // endpoints themselves.
  r.post("/api/internal/openclaw/approval-nonce", async (req, res) => {
    const parsed = parseBody(MintApprovalNonceBody, req);
    const secret = env.OPENCLAW_APPROVAL_NONCE_SECRET;
    if (!secret) {
      res.json({ status: "not_configured" });
      return;
    }
    const jti = newNonceId();
    const argsHash = hashWriteArgs(parsed.tool, parsed.args);
    const expSec =
      Math.floor(Date.now() / 1000) + env.OPENCLAW_APPROVAL_NONCE_TTL_SEC;
    const nonce = signApprovalNonce(secret, {
      jti,
      tool: parsed.tool,
      argsHash,
      exp: expSec,
    });
    const expiresAt = new Date(expSec * 1000);
    await issueApprovalNonce(pool, {
      jti,
      tool: parsed.tool,
      argsHash,
      expiresAt,
    });
    res.json({
      status: "issued",
      nonce,
      jti,
      expiresAt: expiresAt.toISOString(),
    });
  });

  // ---- write/strategy-doc → commit_to_strategy_doc ----
  r.post("/api/internal/openclaw/write/strategy-doc", async (req, res) => {
    const parsed = parseBody(CommitStrategyDocBody, req);
    if (!(await approved(req, res, "commit_to_strategy_doc", parsed))) return;
    try {
      // T2 audit #3 — enforce the repo allowlist at the request
      // boundary so an LLM-supplied `repo` is rejected with 400
      // BEFORE we mint a GitHub App installation token. The same
      // assert runs again inside `commitToStrategyDoc` as a defense
      // in depth, so direct internal callers can't bypass it.
      assertOpenClawRepoAllowed(parsed.repo);
      const result = await commitToStrategyDoc({
        path: parsed.path,
        content: parsed.content,
        message: parsed.message,
        repo: parsed.repo,
      });
      res.json(result);
    } catch (err) {
      if (
        err instanceof OpenClawWriteAllowlistError ||
        err instanceof OpenClawAllowlistError
      ) {
        return asAllowlistFailure(res, err);
      }
      throw err;
    }
  });

  // ---- write/github-issue → create_github_issue ----
  r.post("/api/internal/openclaw/write/github-issue", async (req, res) => {
    const parsed = parseBody(CreateGithubIssueBody, req);
    if (!(await approved(req, res, "create_github_issue", parsed))) return;
    try {
      // T2 audit #3 — see write/strategy-doc for rationale.
      assertOpenClawRepoAllowed(parsed.repo);
      const result = await createGithubIssue({
        title: parsed.title,
        body: parsed.body,
        labels: parsed.labels,
        repo: parsed.repo,
      });
      res.json(result);
    } catch (err) {
      if (err instanceof OpenClawAllowlistError) {
        return asAllowlistFailure(res, err);
      }
      throw err;
    }
  });

  // ---- write/post-to-topic → post_to_topic ----
  r.post("/api/internal/openclaw/write/post-to-topic", async (req, res) => {
    const parsed = parseBody(PostToTopicBody, req);
    if (!(await approved(req, res, "post_to_topic", parsed))) return;
    try {
      const result = await postToTopic({
        topic: parsed.topic,
        text: parsed.text,
      });
      // Mirror successful posts into `tg_topic_archive` so
      // `read_telegram_topic_history` can surface them later
      // (OpenClaw roadmap Phase 3 / Pain P8). We skip the
      // `not_configured` and `error` paths — there was no actual
      // post, so the archive must not pretend otherwise.
      if (result.status === "posted") {
        // Дзеркалення в архів — best-effort. Telegram-повідомлення ВЖЕ
        // відправлене (`postToTopic` повернув `posted`) — це неідемпотентний
        // side-effect. Якщо `recordTopicMessage` кине (DB-збій), НЕ можна
        // повертати 5xx: caller ретрайне і запостить ДУБЛЬ у Telegram. Тому
        // логуємо помилку архіву й усе одно віддаємо успішний результат посту.
        // Це НЕ "defensive try/catch навколо неможливого" (Hard Rule) — DB-запис
        // реально може впасти, і саме тут ковтати помилку правильно, бо
        // попередня дія вже незворотно відбулася. Не "чистити" цей catch.
        try {
          await recordTopicMessage(pool, {
            topic: parsed.topic,
            text: parsed.text,
            source: "post_to_topic",
            messageId: result.messageId ?? null,
            // No stable dedupe key — manual posts can repeat verbatim
            // (e.g. two daily heads-ups). Partial UNIQUE index treats
            // NULL as distinct so we never collide.
            dedupeKey: null,
            metadata:
              result.messageId != null ? { messageId: result.messageId } : {},
          });
        } catch (archiveErr) {
          logger.error({
            msg: "post_to_topic_archive_persist_failed",
            topic: parsed.topic,
            messageId: result.messageId ?? null,
            err:
              archiveErr instanceof Error
                ? archiveErr.message
                : String(archiveErr),
          });
        }
      }
      res.json(result);
    } catch (err) {
      if (err instanceof OpenClawWriteAllowlistError) {
        return asAllowlistFailure(res, err);
      }
      throw err;
    }
  });

  // ---- write/pause-workflow → pause_workflow ----
  r.post("/api/internal/openclaw/write/pause-workflow", async (req, res) => {
    const parsed = parseBody(PauseWorkflowBody, req);
    if (!(await approved(req, res, "pause_workflow", parsed))) return;
    const result = await pauseWorkflow({
      workflowId: parsed.workflowId,
      reason: parsed.reason,
    });
    res.json(result);
  });

  // ---- write/mute-alert → mute_alert ----
  r.post("/api/internal/openclaw/write/mute-alert", async (req, res) => {
    const parsed = parseBody(MuteAlertBody, req);
    if (!(await approved(req, res, "mute_alert", parsed))) return;
    const result = await muteSentryAlert({
      issueId: parsed.issueId,
      untilIso: parsed.untilIso,
    });
    res.json(result);
  });

  // ---- ADR-0037 (Phase 4.5): write-audit log ----
  //
  // One row per Approve / Reject / Executed transition. Pairing
  // `approved` + `executed` per `approval_id` reconstructs lifecycle
  // latency and exposes "approved but never executed" failures.

  // ---- write-audit/log ----
  r.post("/api/internal/openclaw/write-audit/log", async (req, res) => {
    const parsed = parseBody(WriteAuditLogBody, req);
    const id = await recordWriteAudit(pool, {
      approvalId: parsed.approvalId,
      tool: parsed.tool,
      founderUserId: parsed.founderUserId,
      founderTgUserId: parsed.founderTgUserId,
      invocationId: parsed.invocationId ?? null,
      action: parsed.action,
      input: parsed.input,
      httpStatus: parsed.httpStatus ?? null,
      ok: parsed.ok ?? null,
      responseExcerpt: parsed.responseExcerpt ?? null,
      persona: parsed.persona ?? null,
      metadata: parsed.metadata,
    });
    res.json({ ok: true, id });
  });

  // ---- write-audit/list ----
  r.post("/api/internal/openclaw/write-audit/list", async (req, res) => {
    const parsed = parseBody(WriteAuditListBody, req);
    // Zod's `.datetime({ offset: true })` validator already rejects any
    // non-ISO input with 400 above, so `new Date(...)` is safe to call
    // unguarded here. Coerce inline to keep this branch shallow.
    const audits = await listRecentWriteAudits(pool, {
      founderUserId: parsed.founderUserId,
      limit: parsed.limit,
      tool: parsed.tool,
      action: parsed.action,
      persona: parsed.persona,
      recordedAfter: parsed.recordedAfterIso
        ? new Date(parsed.recordedAfterIso)
        : undefined,
    });
    res.json({ audits });
  });

  // Sanity touch — keep `POST_TO_TOPIC_ALLOWLIST` import live (it's also used
  // for documentation in the OpenAPI exporter, kept here for tree-shake).
  void POST_TO_TOPIC_ALLOWLIST;
}
