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
import { asyncHandler } from "../../../http/index.js";
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
} from "../../../modules/openclaw/index.js";
import { recordTopicMessage } from "../../../modules/topic-archive/index.js";
import { asAllowlistFailure } from "./helpers.js";
import {
  CommitStrategyDocBody,
  CreateGithubIssueBody,
  MuteAlertBody,
  PauseWorkflowBody,
  PostToTopicBody,
  WriteAuditListBody,
  WriteAuditLogBody,
} from "./schemas.js";

export function registerWriteRoutes(r: Router, pool: Pool): void {
  // ---- write/strategy-doc → commit_to_strategy_doc ----
  r.post(
    "/api/internal/openclaw/write/strategy-doc",
    asyncHandler(async (req, res) => {
      const parsed = parseBody(CommitStrategyDocBody, req);
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
    }),
  );

  // ---- write/github-issue → create_github_issue ----
  r.post(
    "/api/internal/openclaw/write/github-issue",
    asyncHandler(async (req, res) => {
      const parsed = parseBody(CreateGithubIssueBody, req);
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
    }),
  );

  // ---- write/post-to-topic → post_to_topic ----
  r.post(
    "/api/internal/openclaw/write/post-to-topic",
    asyncHandler(async (req, res) => {
      const parsed = parseBody(PostToTopicBody, req);
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
        }
        res.json(result);
      } catch (err) {
        if (err instanceof OpenClawWriteAllowlistError) {
          return asAllowlistFailure(res, err);
        }
        throw err;
      }
    }),
  );

  // ---- write/pause-workflow → pause_workflow ----
  r.post(
    "/api/internal/openclaw/write/pause-workflow",
    asyncHandler(async (req, res) => {
      const parsed = parseBody(PauseWorkflowBody, req);
      const result = await pauseWorkflow({
        workflowId: parsed.workflowId,
        reason: parsed.reason,
      });
      res.json(result);
    }),
  );

  // ---- write/mute-alert → mute_alert ----
  r.post(
    "/api/internal/openclaw/write/mute-alert",
    asyncHandler(async (req, res) => {
      const parsed = parseBody(MuteAlertBody, req);
      const result = await muteSentryAlert({
        issueId: parsed.issueId,
        untilIso: parsed.untilIso,
      });
      res.json(result);
    }),
  );

  // ---- ADR-0037 (Phase 4.5): write-audit log ----
  //
  // One row per Approve / Reject / Executed transition. Pairing
  // `approved` + `executed` per `approval_id` reconstructs lifecycle
  // latency and exposes "approved but never executed" failures.

  // ---- write-audit/log ----
  r.post(
    "/api/internal/openclaw/write-audit/log",
    asyncHandler(async (req, res) => {
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
    }),
  );

  // ---- write-audit/list ----
  r.post(
    "/api/internal/openclaw/write-audit/list",
    asyncHandler(async (req, res) => {
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
    }),
  );

  // Sanity touch — keep `POST_TO_TOPIC_ALLOWLIST` import live (it's also used
  // for documentation in the OpenAPI exporter, kept here for tree-shake).
  void POST_TO_TOPIC_ALLOWLIST;
}
