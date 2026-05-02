/**
 * `/api/internal/openclaw/*` — internal HTTP API для OpenClaw bot
 * (apps/console DM-handler).
 *
 * Архітектура (ADR-0031 §5):
 *   apps/console (DM bot)     ──HTTP──▶  apps/server /api/internal/openclaw/*
 *                                          ├─ recall      (recall_memory)
 *                                          ├─ strategy    (read_strategy_docs)
 *                                          ├─ query       (query_app_db)
 *                                          ├─ github      (read_github)
 *                                          ├─ workflow    (read_workflow_logs)
 *                                          ├─ telegram    (read_telegram_topic_history)
 *                                          ├─ decision    (record_decision)
 *                                          ├─ budget      (checkDailyBudget pre-call)
 *                                          ├─ invocations/open
 *                                          └─ invocations/finalize
 *
 * Чому tool execution тут, а не у `apps/console`:
 *   - Single-process pgvector / Postgres connection pool.
 *   - Allowlist-enforcement в одному місці (compromised console process
 *     не може bypass-ити).
 *   - Audit-log writes до БД ближче.
 *
 * Auth: bearer-token guard у `routes/internal/index.ts` (`INTERNAL_API_KEY`).
 */

import { Router } from "express";
import type { Pool } from "pg";
import { z } from "zod";
import { asyncHandler } from "../../http/index.js";
import { validateBody } from "../../http/validate.js";
import { logger } from "../../obs/logger.js";
import {
  checkDailyBudget,
  finalizeInvocation,
  listRecentDecisions,
  listRecentInvocations,
  openInvocation,
  queryAppDb,
  readGithub,
  readStrategyDoc,
  readTelegramTopicHistory,
  readWorkflowLogs,
  recallCofounderMemory,
  recordDecision,
  OpenClawAllowlistError,
  // ADR-0032: ops/marketing tools ported from Sergeant Console agents.
  getStripeMetrics,
  getSentryIssues,
  getServerStats,
  getPostHogStats,
  getGithubReleases,
} from "../../modules/openclaw/index.js";
import type {
  OpenClawStatus,
  OpenClawToneMode,
  OpenClawToolCall,
  OpenClawTrigger,
} from "../../modules/openclaw/types.js";

// ─────────────────────────────────────────────────────────────────────────
// Zod schemas
// ─────────────────────────────────────────────────────────────────────────

const TRIGGER_VALUES = [
  "dm",
  "morning_ritual",
  "weekly_review",
  "monthly_okr",
] as const;

const STATUS_VALUES = [
  "success",
  "error",
  "budget_exceeded",
  "iteration_cap",
  "allowlist_fail",
  "dm_only_violation",
] as const;

const ToolCallSchema = z.object({
  tool: z.string().min(1),
  input: z.record(z.string(), z.unknown()),
  output_chars: z.number().int().nonnegative(),
  output_preview: z.string(),
  status: z.enum(["ok", "error"]),
  error: z.string().optional(),
  duration_ms: z.number().int().nonnegative(),
});

const RecallBody = z.object({
  founderUserId: z.string().min(1),
  query: z.string().min(1).max(2000),
  topK: z.number().int().min(1).max(50).optional(),
});

const StrategyBody = z.object({
  path: z.string().min(1).max(500),
});

const QueryBody = z.object({
  sql: z.string().min(1).max(8000),
  params: z.array(z.unknown()).optional(),
  limit: z.number().int().min(1).max(1000).optional(),
});

const GithubBody = z.object({
  repo: z.string().optional(),
  mode: z.enum(["file", "issue", "pr"]),
  filePath: z.string().optional(),
  ref: z.string().optional(),
  number: z.number().int().positive().optional(),
});

const WorkflowBody = z.object({
  workflowId: z.string().min(1),
  since: z.string().optional(),
  limit: z.number().int().min(1).max(50).optional(),
});

const TelegramBody = z.object({
  topic: z.string().min(1),
  since: z.string().optional(),
  limit: z.number().int().min(1).max(100).optional(),
});

const DecisionBody = z.object({
  founderUserId: z.string().min(1),
  topic: z.string().min(1).max(200),
  context: z.string().min(1).max(8000),
  decision: z.string().min(1).max(4000),
  rationale: z.string().min(1).max(8000),
  alternatives: z.string().max(8000).optional(),
  invocationId: z.number().int().positive().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

const BudgetBody = z.object({
  founderUserId: z.string().min(1),
  tzName: z.string().optional(),
});

const OpenInvocationBody = z.object({
  founderUserId: z.string().min(1),
  founderTgUserId: z.number().int(),
  trigger: z.enum(TRIGGER_VALUES),
  userMessage: z.string().min(1).max(8000),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

const FinalizeInvocationBody = z.object({
  invocationId: z.number().int().positive(),
  status: z.enum(STATUS_VALUES),
  assistantResponse: z.string().nullable().optional(),
  toolCalls: z.array(ToolCallSchema).optional(),
  costUsd: z.number().nonnegative().optional(),
  durationMs: z.number().int().nonnegative().optional(),
  iterations: z.number().int().nonnegative().optional(),
  errorMessage: z.string().nullable().optional(),
  toneMode: z.enum(["diplomatic", "direct"]).nullable().optional(),
  metadataPatch: z.record(z.string(), z.unknown()).optional(),
});

const ListBody = z.object({
  founderUserId: z.string().min(1),
  limit: z.number().int().min(1).max(100).optional(),
});

// ADR-0032: ports of Sergeant Console (ADR-0027) ops/marketing tool I/O
// schemas. Validation is intentionally loose — the upstream APIs (Stripe,
// Sentry, PostHog, GitHub) define richer responses than we need; we keep
// only fields LLM and the slash-command formatters consume.

const StripeMetricsBody = z.object({
  days: z.number().int().min(1).max(90).optional(),
});

const SentryIssuesBody = z.object({
  level: z.enum(["fatal", "error", "warning"]).optional(),
  limit: z.number().int().min(1).max(50).optional(),
});

const PostHogStatsBody = z.object({
  days: z.number().int().min(1).max(180).optional(),
});

const GithubReleasesBody = z.object({
  limit: z.number().int().min(1).max(20).optional(),
  repo: z.string().optional(),
});

const ServerStatsBody = z.object({}).strict();

// ─────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────

function asAllowlistFailure(
  res: import("express").Response,
  err: unknown,
): void {
  const message = err instanceof Error ? err.message : String(err);
  res.status(400).json({ error: "allowlist_fail", message });
}

// ─────────────────────────────────────────────────────────────────────────
// Router factory
// ─────────────────────────────────────────────────────────────────────────

export function createOpenClawInternalRouter({ pool }: { pool: Pool }): Router {
  const r = Router();

  // ---- recall_memory ----
  r.post(
    "/api/internal/openclaw/recall",
    asyncHandler(async (req, res) => {
      const parsed = validateBody(RecallBody, req, res);
      if (!parsed.ok) return;
      const result = await recallCofounderMemory(parsed.data.founderUserId, {
        query: parsed.data.query,
        topK: parsed.data.topK,
      });
      res.json(result);
    }),
  );

  // ---- read_strategy_docs ----
  r.post(
    "/api/internal/openclaw/strategy",
    asyncHandler(async (req, res) => {
      const parsed = validateBody(StrategyBody, req, res);
      if (!parsed.ok) return;
      try {
        const result = await readStrategyDoc({ path: parsed.data.path });
        res.json(result);
      } catch (err) {
        if (err instanceof OpenClawAllowlistError) {
          return asAllowlistFailure(res, err);
        }
        throw err;
      }
    }),
  );

  // ---- query_app_db ----
  r.post(
    "/api/internal/openclaw/query",
    asyncHandler(async (req, res) => {
      const parsed = validateBody(QueryBody, req, res);
      if (!parsed.ok) return;
      try {
        const result = await queryAppDb(pool, {
          sql: parsed.data.sql,
          params: parsed.data.params,
          limit: parsed.data.limit,
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

  // ---- read_github ----
  r.post(
    "/api/internal/openclaw/github",
    asyncHandler(async (req, res) => {
      const parsed = validateBody(GithubBody, req, res);
      if (!parsed.ok) return;
      try {
        const result = await readGithub({
          repo: parsed.data.repo,
          mode: parsed.data.mode,
          filePath: parsed.data.filePath,
          ref: parsed.data.ref,
          number: parsed.data.number,
        });
        res.json(result);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        res.status(400).json({ error: "github_error", message });
      }
    }),
  );

  // ---- read_workflow_logs ----
  r.post(
    "/api/internal/openclaw/workflow",
    asyncHandler(async (req, res) => {
      const parsed = validateBody(WorkflowBody, req, res);
      if (!parsed.ok) return;
      try {
        const result = await readWorkflowLogs(parsed.data);
        res.json(result);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        res.status(400).json({ error: "workflow_error", message });
      }
    }),
  );

  // ---- read_telegram_topic_history ----
  r.post(
    "/api/internal/openclaw/telegram",
    asyncHandler(async (req, res) => {
      const parsed = validateBody(TelegramBody, req, res);
      if (!parsed.ok) return;
      const result = await readTelegramTopicHistory(parsed.data);
      res.json(result);
    }),
  );

  // ---- record_decision ----
  r.post(
    "/api/internal/openclaw/decision",
    asyncHandler(async (req, res) => {
      const parsed = validateBody(DecisionBody, req, res);
      if (!parsed.ok) return;
      const result = await recordDecision(pool, parsed.data);
      res.json(result);
    }),
  );

  // ---- decisions: list ----
  r.post(
    "/api/internal/openclaw/decisions/list",
    asyncHandler(async (req, res) => {
      const parsed = validateBody(ListBody, req, res);
      if (!parsed.ok) return;
      const result = await listRecentDecisions(
        pool,
        parsed.data.founderUserId,
        parsed.data.limit ?? 20,
      );
      res.json({ decisions: result });
    }),
  );

  // ---- budget: pre-call check ----
  r.post(
    "/api/internal/openclaw/budget",
    asyncHandler(async (req, res) => {
      const parsed = validateBody(BudgetBody, req, res);
      if (!parsed.ok) return;
      const result = await checkDailyBudget(
        pool,
        parsed.data.founderUserId,
        parsed.data.tzName,
      );
      res.json(result);
    }),
  );

  // ---- invocations: open ----
  r.post(
    "/api/internal/openclaw/invocations/open",
    asyncHandler(async (req, res) => {
      const parsed = validateBody(OpenInvocationBody, req, res);
      if (!parsed.ok) return;
      const id = await openInvocation(pool, parsed.data);
      res.json({ invocationId: id });
    }),
  );

  // ---- invocations: finalize ----
  r.post(
    "/api/internal/openclaw/invocations/finalize",
    asyncHandler(async (req, res) => {
      const parsed = validateBody(FinalizeInvocationBody, req, res);
      if (!parsed.ok) return;
      await finalizeInvocation(pool, {
        invocationId: parsed.data.invocationId,
        status: parsed.data.status as OpenClawStatus,
        assistantResponse: parsed.data.assistantResponse,
        toolCalls: parsed.data.toolCalls as OpenClawToolCall[] | undefined,
        costUsd: parsed.data.costUsd,
        durationMs: parsed.data.durationMs,
        iterations: parsed.data.iterations,
        errorMessage: parsed.data.errorMessage,
        toneMode: parsed.data.toneMode as OpenClawToneMode | null | undefined,
        metadataPatch: parsed.data.metadataPatch,
      });
      res.json({ ok: true });
    }),
  );

  // ---- get_stripe_metrics (ADR-0032) ----
  r.post(
    "/api/internal/openclaw/metrics/stripe",
    asyncHandler(async (req, res) => {
      const parsed = validateBody(StripeMetricsBody, req, res);
      if (!parsed.ok) return;
      const result = await getStripeMetrics({ days: parsed.data.days });
      res.json(result);
    }),
  );

  // ---- get_sentry_issues (ADR-0032) ----
  r.post(
    "/api/internal/openclaw/metrics/sentry",
    asyncHandler(async (req, res) => {
      const parsed = validateBody(SentryIssuesBody, req, res);
      if (!parsed.ok) return;
      const result = await getSentryIssues({
        level: parsed.data.level,
        limit: parsed.data.limit,
      });
      res.json(result);
    }),
  );

  // ---- get_server_stats (ADR-0032) ----
  r.post(
    "/api/internal/openclaw/metrics/server",
    asyncHandler(async (req, res) => {
      const parsed = validateBody(ServerStatsBody, req, res);
      if (!parsed.ok) return;
      const result = await getServerStats();
      res.json(result);
    }),
  );

  // ---- get_posthog_stats (ADR-0032) ----
  r.post(
    "/api/internal/openclaw/metrics/posthog",
    asyncHandler(async (req, res) => {
      const parsed = validateBody(PostHogStatsBody, req, res);
      if (!parsed.ok) return;
      const result = await getPostHogStats({ days: parsed.data.days });
      res.json(result);
    }),
  );

  // ---- get_github_releases (ADR-0032) ----
  r.post(
    "/api/internal/openclaw/github/releases",
    asyncHandler(async (req, res) => {
      const parsed = validateBody(GithubReleasesBody, req, res);
      if (!parsed.ok) return;
      const result = await getGithubReleases({
        limit: parsed.data.limit,
        repo: parsed.data.repo,
      });
      res.json(result);
    }),
  );

  // ---- invocations: list (observability) ----
  r.post(
    "/api/internal/openclaw/invocations/list",
    asyncHandler(async (req, res) => {
      const parsed = validateBody(ListBody, req, res);
      if (!parsed.ok) return;
      const result = await listRecentInvocations(
        pool,
        parsed.data.founderUserId,
        parsed.data.limit ?? 50,
      );
      res.json({ invocations: result });
    }),
  );

  // Logging trace для debug-у — щоб у логах було видно openclaw subroutes.
  // Не вище middleware щоб не дублювати лог-події з error-handler-а.
  r.use("/api/internal/openclaw", (req, _res, next) => {
    logger.debug({
      msg: "openclaw_internal_request",
      path: req.path,
      method: req.method,
    });
    next();
  });

  // Запобіжно: явний типаж для unused імпортів `OpenClawTrigger` (інакше
  // ts-unused-expressions фейлить). Експортуємо тип через index.ts.
  void ({} as OpenClawTrigger);

  return r;
}
