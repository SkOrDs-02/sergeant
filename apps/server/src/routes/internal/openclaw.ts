/**
 * `/api/internal/openclaw/*` — internal HTTP API для OpenClaw bot
 * (tools/openclaw DM-handler).
 *
 * Архітектура (ADR-0031 §5):
 *   tools/openclaw (DM bot)     ──HTTP──▶  apps/server /api/internal/openclaw/*
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
 * Чому tool execution тут, а не у `tools/openclaw`:
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
import { env } from "../../env.js";
import { asyncHandler } from "../../http/index.js";
import { parseBody } from "../../http/validate.js";
import { logger } from "../../obs/logger.js";
import {
  cancelForget,
  confirmForget,
  forgetById,
  forgetByTopic,
  forgetSince,
  previewForget,
  ForgetRateLimitError,
  ForgetTokenError,
} from "../../modules/ai-memory/forget.js";
import {
  buildAiCostSummary,
  MAX_TREND_DAYS,
  buildPerfSnapshot,
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
  assertOpenClawRepoAllowed,
  OpenClawSchemaError,
  OpenClawNotFoundError,
  // ADR-0032: ops/marketing tools ported from Sergeant Console agents.
  getStripeMetrics,
  getSentryIssues,
  getServerStats,
  getPostHogStats,
  getGithubReleases,
  // PR-26: morning briefing template assembly (no-LLM hardcoded sections).
  assembleMorningBriefing,
  // O3 (Phase 2.B): Friday weekly + monthly OKR rituals.
  assembleWeeklyReview,
  assembleMonthlyOkrReview,
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
  // PR-C1c (Phase 1): n8n delegation surface + refresh_business_snapshot.
  listN8nWorkflows,
  describeN8nWorkflow,
  triggerN8nWorkflow,
  activateN8nWorkflow,
  refreshBusinessSnapshot,
  N8nAllowlistError,
  // PR-Stage4c: Layer 1 cheap-router (Haiku JSON classifier).
  classifyMessage,
  // PR-C1b: code-understanding tools.
  githubSearch,
  githubTree,
  githubDiff,
  githubPrs,
  // PR-C1b: SEO env-stub tools.
  seoGscQuery,
  seoPsiAudit,
  seoSerpLookup,
  // PR /mute (Phase 5b): founder DM mute-state CRUD + guard.
  setFounderMute,
  clearFounderMute,
  getFounderMute,
  isFounderMuted,
  // PR /whois (debug): /openclaw whois aggregator.
  lookupWhois,
  // PR-C1b: reminder store + FSM helpers.
  setReminder,
  listDueReminders,
  markReminderSent,
  markReminderFailed,
  markReminderCancelled,
  listFounderReminders,
  ReminderValidationError,
} from "../../modules/openclaw/index.js";
import { createTelegramBotClient } from "../../modules/telegram/index.js";
import { recordTopicMessage } from "../../modules/topic-archive/index.js";
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

// ─── /forget slash-команда (PR-23) ───────────────────────────────────────
// Single endpoint, mode-dispatched. Зміна mode — без routing reshuffle.
const ForgetBody = z
  .object({
    founderUserId: z.string().min(1),
    founderTgUserId: z.number().int(),
    rawCommand: z.string().min(1).max(500),
  })
  .and(
    z.discriminatedUnion("mode", [
      z.object({
        mode: z.literal("byId"),
        memoryId: z.number().int().positive(),
      }),
      z.object({
        mode: z.literal("byTopic"),
        topic: z.string().min(1).max(200),
      }),
      z.object({
        mode: z.literal("since"),
        sinceDate: z
          .string()
          .regex(
            /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}(:\d{2})?(\.\d+)?(Z|[+-]\d{2}:\d{2})?)?$/,
            "sinceDate must be ISO8601 (YYYY-MM-DD or full timestamp)",
          ),
      }),
      z.object({
        mode: z.literal("previewQuery"),
        query: z.string().min(1).max(2000),
        topK: z.number().int().min(1).max(20).optional(),
      }),
    ]),
  );

const ForgetConfirmBody = z
  .object({
    founderUserId: z.string().min(1),
    founderTgUserId: z.number().int(),
    rawCommand: z.string().min(1).max(500),
    token: z.string().uuid(),
  })
  .strict();

const ForgetCancelBody = z
  .object({
    founderUserId: z.string().min(1),
    token: z.string().uuid(),
  })
  .strict();

const StrategyBody = z.object({
  path: z.string().min(1).max(500),
});

// `/ai_cost <days>` — optional trend-window. Порожнє body беремо як
// legacy `/ai_cost` (без trend); `trendDays: 1..30` — включає
// Anthropic per-day series. Object loose-mode — forward-compat для
// майбутніх параметрів (e.g. provider filter).
const AiCostSummaryBody = z
  .object({
    trendDays: z.number().int().min(1).max(MAX_TREND_DAYS).optional(),
  })
  .strict();

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

// PR-Stage4c: classify body. `systemPrompt` опційний — plugin шле його
// тільки якщо завантажив prompt з `cheapRouterSystemPromptPath` (canonical
// file у `ops/openclaw/cheap-router.system.md`); інакше route використовує
// embedded fallback з `modules/openclaw/classify.ts`. Max length підібрана
// з запасом: реальні DM-и < 1000 символів, prompt < 4 кБ.
const ClassifyBody = z
  .object({
    userMessage: z.string().min(1).max(8000),
    systemPrompt: z.string().min(1).max(8000).optional(),
  })
  .strict();

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

// PR /mute (Phase 5b): founder DM "do not disturb" mute schemas.
// `mutedUntil` приймається ISO 8601 (`2026-05-13T22:00:00Z`); null/omit
// ≡ "/mute off". `reason` — необов'язковий free-text label.
const MuteSetBody = z.object({
  founderUserId: z.string().min(1),
  mutedUntilIso: z.string().datetime({ offset: true }).nullable().optional(),
  reason: z.string().min(1).max(200).nullable().optional(),
});
const MuteFounderBody = z.object({
  founderUserId: z.string().min(1),
});

// PR /whois (debug): `/openclaw whois <tg_user_id|@username>` body.
// Хоч один з `tgUserId` / `username` має бути присутній — Zod refine
// гарантує це на boundary, щоб не пускати у `lookupWhois` пустий
// lookup. `founderTgUserId` обов'язковий для `isFounder` check-у
// (caller дістає з env).
const WhoisLookupBody = z
  .object({
    founderUserId: z.string().min(1).max(128),
    founderTgUserId: z.number().int().min(1),
    tgUserId: z.number().int().min(1).optional(),
    username: z
      .string()
      .min(1)
      .max(64)
      .regex(/^@?[A-Za-z0-9_]{3,64}$/)
      .optional(),
    windowDays: z.number().int().min(1).max(30).optional(),
    topToolsLimit: z.number().int().min(1).max(20).optional(),
  })
  .strict()
  .refine((d) => d.tgUserId !== undefined || d.username !== undefined, {
    message: "tgUserId or username is required",
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

// PR-26: morning briefing payload — всі поля optional, бо консумер (cron
// dispatcher / manual probe) може приймати дефолти.
// O1 / Phase 2.A: додано `includeProposals` (default true) — вимикає
// LLM-call для proposals-секції коли caller хоче чистий 5-секційний
// briefing без витрат токенів (наприклад, retry після Anthropic outage).
const MorningBriefingBody = z
  .object({
    windowDays: z.number().int().min(1).max(30).optional(),
    githubRepo: z.string().min(3).max(140).optional(),
    sentryLimit: z.number().int().min(1).max(20).optional(),
    prLimit: z.number().int().min(1).max(30).optional(),
    includeProposals: z.boolean().optional(),
    /**
     * PR /mute (Phase 5b): якщо передано, server додає `mute` блок у
     * response (`{ muted, mutedUntilIso }`) — n8n WF-25 читає його і
     * short-circuit-ує `sendMessage` коли `muted=true`. Briefing markdown
     * рендериться завжди (cost-free аудит для post-mortem на `mute`-period).
     */
    founderUserId: z.string().min(1).max(128).optional(),
  })
  .strict();

// O3 (Phase 2.B): Friday weekly review payload — всі поля optional.
// Консумер — n8n WF-28 (`0 18 * * FRI` Europe/Kyiv) → DM founder.
const WeeklyReviewBody = z
  .object({
    windowDays: z.number().int().min(1).max(30).optional(),
    staleDays: z.number().int().min(1).max(60).optional(),
    githubRepo: z.string().min(3).max(140).optional(),
    sentryLimit: z.number().int().min(1).max(20).optional(),
    prLimit: z.number().int().min(1).max(30).optional(),
  })
  .strict();

// O3 (Phase 2.B): Monthly OKR review payload — всі поля optional.
// Консумер — n8n WF-27 (`0 9 1 * *` Europe/Kyiv) → DM founder. Hardcoded
// interim OKR-список — fallback (PR-34 strategic_goals DB-table merged,
// follow-up може замінити константу на DB-query).
const MonthlyOkrReviewBody = z
  .object({
    githubRepo: z.string().min(3).max(140).optional(),
    prLimit: z.number().int().min(1).max(30).optional(),
    staleDays: z.number().int().min(1).max(120).optional(),
    sentryLevel: z.enum(["fatal", "error", "warning"]).optional(),
  })
  .strict();

// ADR-0036 (Phase 4): write-tool body schemas. The console invokes these
// endpoints ONLY after the founder explicitly approved the corresponding
// write-tool call via inline-keyboard in Telegram. Validation is intentionally
// strict — we'd rather 400-fail than silently relax invariants.

const CommitStrategyDocBody = z.object({
  path: z.string().min(1).max(500),
  content: z.string().min(1).max(80_000),
  message: z.string().min(1).max(200),
  repo: z.string().optional(),
});

const CreateGithubIssueBody = z.object({
  title: z.string().min(1).max(200),
  body: z.string().min(1).max(20_000),
  labels: z.array(z.string().min(1).max(50)).max(10).optional(),
  repo: z.string().optional(),
});

const PostToTopicBody = z.object({
  topic: z.string().min(1),
  text: z.string().min(1).max(4000),
});

const PauseWorkflowBody = z.object({
  workflowId: z.string().min(1).max(100),
  reason: z.string().max(1000).optional(),
});

const MuteAlertBody = z.object({
  issueId: z.string().min(1).max(200),
  untilIso: z.string().datetime({ offset: true }).optional(),
});

// ADR-0037 (Phase 4.5): write-audit log endpoints. Console writes a row
// per approve/reject/executed transition; the same id pairs `approved` +
// `executed` so latency is reconstructable.

const WRITE_AUDIT_ACTIONS = ["approved", "executed", "rejected"] as const;

const WriteAuditLogBody = z
  .object({
    approvalId: z.string().min(1).max(64),
    tool: z.string().min(1).max(100),
    founderUserId: z.string().min(1),
    founderTgUserId: z.number().int(),
    invocationId: z.number().int().positive().optional().nullable(),
    action: z.enum(WRITE_AUDIT_ACTIONS),
    input: z.record(z.string(), z.unknown()).optional(),
    httpStatus: z.number().int().min(0).max(599).optional().nullable(),
    ok: z.boolean().optional().nullable(),
    responseExcerpt: z.string().max(8_192).optional().nullable(),
    persona: z.string().min(1).max(50).optional().nullable(),
    metadata: z.record(z.string(), z.unknown()).optional(),
  })
  .strict();

// PR-C1c: n8n delegation bodies. Workflow IDs are opaque 16-char base62
// strings (e.g. `OhDtiheODIp5nNLa`); we cap at 64 to leave headroom for
// future variants without becoming a Zod-only validation cliff.

const N8N_TIER_VALUES = ["A", "B", "C", "D"] as const;

const N8nListBody = z
  .object({
    tiers: z.array(z.enum(N8N_TIER_VALUES)).max(4).optional(),
    limit: z.number().int().min(1).max(250).optional(),
  })
  .strict();

const N8nWorkflowIdBody = z
  .object({
    workflowId: z.string().min(1).max(64),
  })
  .strict();

const N8nActivateBody = z
  .object({
    workflowId: z.string().min(1).max(64),
    active: z.boolean(),
  })
  .strict();

const SnapshotRefreshBody = z
  .object({
    workflowIds: z.array(z.string().min(1).max(64)).max(50).optional(),
  })
  .strict();

const WriteAuditListBody = z
  .object({
    founderUserId: z.string().min(1),
    limit: z.number().int().min(1).max(100).optional(),
    tool: z.string().min(1).max(100).optional(),
    action: z.enum(WRITE_AUDIT_ACTIONS).optional(),
    persona: z.string().min(1).max(50).optional(),
    /**
     * Lower-bound on `recorded_at` (inclusive, ISO-8601 with offset). Driven
     * by the `/audit since=<dur>` slash-command — console computes
     * `Date.now() - dur` and forwards as ISO. Server parses with the
     * standard `Date` ctor (rejects NaN as 400).
     */
    recordedAfterIso: z.string().datetime({ offset: true }).optional(),
  })
  .strict();

// ─── PR-C1b: code-understanding tools ──────────────────────────────────

const GithubSearchBody = z
  .object({
    scope: z.enum(["code", "issues", "prs"]).optional(),
    query: z.string().min(1).max(500),
    repo: z.string().min(1).max(200).optional(),
    perPage: z.number().int().min(1).max(30).optional(),
    page: z.number().int().min(1).max(10).optional(),
  })
  .strict();

const GithubTreeBody = z
  .object({
    ref: z.string().min(1).max(200).optional(),
    repo: z.string().min(1).max(200).optional(),
    recursive: z.boolean().optional(),
  })
  .strict();

const GithubDiffBody = z
  .object({
    base: z.string().min(1).max(200),
    head: z.string().min(1).max(200),
    repo: z.string().min(1).max(200).optional(),
  })
  .strict();

const GithubPrsBody = z
  .object({
    repo: z.string().min(1).max(200).optional(),
    state: z.enum(["open", "closed", "all"]).optional(),
    author: z.string().min(1).max(100).optional(),
    head: z.string().min(1).max(200).optional(),
    base: z.string().min(1).max(200).optional(),
    sort: z
      .enum(["created", "updated", "popularity", "long-running"])
      .optional(),
    direction: z.enum(["asc", "desc"]).optional(),
    perPage: z.number().int().min(1).max(30).optional(),
    page: z.number().int().min(1).max(100).optional(),
  })
  .strict();

// ─── PR-C1b: SEO env-stub tools ────────────────────────────────────────

const SeoGscQueryBody = z
  .object({
    days: z.number().int().min(1).max(90).optional(),
    dimension: z.enum(["query", "page", "country", "device"]).optional(),
    siteUrl: z.string().min(1).max(500).optional(),
    rowLimit: z.number().int().min(1).max(100).optional(),
  })
  .strict();

const SeoPsiAuditBody = z
  .object({
    url: z.string().url().max(2000),
    strategy: z.enum(["mobile", "desktop"]).optional(),
  })
  .strict();

const SeoSerpLookupBody = z
  .object({
    query: z.string().min(1).max(500),
    hl: z.string().min(2).max(10).optional(),
    gl: z.string().min(2).max(10).optional(),
    num: z.number().int().min(1).max(20).optional(),
  })
  .strict();

// ─── PR-C1b: reminders ─────────────────────────────────────────────────

const SetReminderBody = z
  .object({
    founderUserId: z.string().min(1),
    reminderText: z.string().min(1).max(4000),
    /** Local-Tz-aware ISO with offset (`2026-05-15T09:00+03:00`). */
    dueAtIso: z.string().datetime({ offset: true }),
    persona: z.string().min(1).max(50).optional(),
    topic: z.string().min(1).max(100).nullable().optional(),
    channel: z.enum(["telegram", "whatsapp"]).optional(),
    sourceInvocationId: z.number().int().positive().nullable().optional(),
    metadata: z.record(z.string(), z.unknown()).optional(),
  })
  .strict();

const ListDueRemindersBody = z
  .object({
    limit: z.number().int().min(1).max(200).optional(),
    /** Test-only override; production passes nothing → defaults to `NOW()`. */
    nowIso: z.string().datetime({ offset: true }).optional(),
  })
  .strict();

const ReminderMarkBody = z
  .object({
    reminderId: z.number().int().positive(),
    /**
     * Optional reason for `failed` transitions. Stored under
     * `metadata.failure_reason`.
     */
    reason: z.string().max(500).optional(),
    /**
     * Required for `cancelled` — verifies the caller owns the reminder.
     */
    founderUserId: z.string().min(1).optional(),
  })
  .strict();

const RemindersListBody = z
  .object({
    founderUserId: z.string().min(1),
    statuses: z
      .array(z.enum(["pending", "sent", "cancelled", "failed"]))
      .max(4)
      .optional(),
    limit: z.number().int().min(1).max(200).optional(),
  })
  .strict();

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

function asN8nAllowlistFailure(
  res: import("express").Response,
  err: N8nAllowlistError,
): void {
  res.status(400).json({
    error: "allowlist_fail",
    op: err.op,
    workflowId: err.workflowId,
    tier: err.tier,
    message: err.message,
  });
}

function asNotFound(res: import("express").Response, err: unknown): void {
  const message = err instanceof Error ? err.message : String(err);
  res.status(404).json({ error: "not_found", message });
}

function asSchemaFailure(res: import("express").Response, err: unknown): void {
  const message = err instanceof Error ? err.message : String(err);
  res.status(400).json({ error: "schema_error", message });
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
      const parsed = parseBody(RecallBody, req);
      const result = await recallCofounderMemory(parsed.founderUserId, {
        query: parsed.query,
        topK: parsed.topK,
      });
      res.json(result);
    }),
  );

  // ---- forget_memory (PR-23 / /forget slash) ----
  // Single mode-dispatch endpoint:
  //   byId        → soft-delete one row by ai_memories.id
  //   byTopic     → soft-delete all rows for founder × topic
  //   since       → soft-delete all rows created on/after date
  //   previewQuery → semantic search, return token+preview (no delete)
  // Rate-limited: 3 deletes/hour/founder. previewQuery NOT rate-limited.
  r.post(
    "/api/internal/openclaw/forget",
    asyncHandler(async (req, res) => {
      const parsed = parseBody(ForgetBody, req);
      const body = parsed;
      try {
        if (body.mode === "byId") {
          const result = await forgetById(pool, {
            founderUserId: body.founderUserId,
            founderTgUserId: body.founderTgUserId,
            rawCommand: body.rawCommand,
            memoryId: body.memoryId,
          });
          res.json(result);
          return;
        }
        if (body.mode === "byTopic") {
          const result = await forgetByTopic(pool, {
            founderUserId: body.founderUserId,
            founderTgUserId: body.founderTgUserId,
            rawCommand: body.rawCommand,
            topic: body.topic,
          });
          res.json(result);
          return;
        }
        if (body.mode === "since") {
          const result = await forgetSince(pool, {
            founderUserId: body.founderUserId,
            founderTgUserId: body.founderTgUserId,
            rawCommand: body.rawCommand,
            sinceDate: body.sinceDate,
          });
          res.json(result);
          return;
        }
        // previewQuery
        const result = await previewForget({
          founderUserId: body.founderUserId,
          founderTgUserId: body.founderTgUserId,
          rawCommand: body.rawCommand,
          query: body.query,
          topK: body.topK,
        });
        res.json(result);
      } catch (err) {
        if (err instanceof ForgetRateLimitError) {
          res.status(429).json({
            error: "rate_limited",
            message: err.message,
            retryAfterSec: err.retryAfterSec,
          });
          return;
        }
        throw err;
      }
    }),
  );

  // ---- forget_memory_confirm (PR-23 / preview confirm) ----
  r.post(
    "/api/internal/openclaw/forget/confirm",
    asyncHandler(async (req, res) => {
      const parsed = parseBody(ForgetConfirmBody, req);
      try {
        const result = await confirmForget(pool, {
          founderUserId: parsed.founderUserId,
          founderTgUserId: parsed.founderTgUserId,
          rawCommand: parsed.rawCommand,
          token: parsed.token,
        });
        res.json(result);
      } catch (err) {
        if (err instanceof ForgetRateLimitError) {
          res.status(429).json({
            error: "rate_limited",
            message: err.message,
            retryAfterSec: err.retryAfterSec,
          });
          return;
        }
        if (err instanceof ForgetTokenError) {
          res.status(410).json({
            error: "token_invalid",
            reason: err.reason,
            message: err.message,
          });
          return;
        }
        throw err;
      }
    }),
  );

  // ---- forget_memory_cancel (PR-23 / preview cancel) ----
  r.post(
    "/api/internal/openclaw/forget/cancel",
    asyncHandler(async (req, res) => {
      const parsed = parseBody(ForgetCancelBody, req);
      const cancelled = cancelForget(parsed.token, parsed.founderUserId);
      res.json({ cancelled });
    }),
  );

  // ---- read_strategy_docs ----
  r.post(
    "/api/internal/openclaw/strategy",
    asyncHandler(async (req, res) => {
      const parsed = parseBody(StrategyBody, req);
      try {
        const result = await readStrategyDoc({ path: parsed.path });
        res.json(result);
      } catch (err) {
        if (err instanceof OpenClawAllowlistError) {
          return asAllowlistFailure(res, err);
        }
        if (err instanceof OpenClawNotFoundError) {
          return asNotFound(res, err);
        }
        throw err;
      }
    }),
  );

  // ---- query_app_db ----
  r.post(
    "/api/internal/openclaw/query",
    asyncHandler(async (req, res) => {
      const parsed = parseBody(QueryBody, req);
      try {
        const result = await queryAppDb(pool, {
          sql: parsed.sql,
          params: parsed.params,
          limit: parsed.limit,
        });
        res.json(result);
      } catch (err) {
        if (err instanceof OpenClawAllowlistError) {
          return asAllowlistFailure(res, err);
        }
        if (err instanceof OpenClawSchemaError) {
          return asSchemaFailure(res, err);
        }
        throw err;
      }
    }),
  );

  // ---- read_github ----
  r.post(
    "/api/internal/openclaw/github",
    asyncHandler(async (req, res) => {
      const parsed = parseBody(GithubBody, req);
      try {
        const result = await readGithub({
          repo: parsed.repo,
          mode: parsed.mode,
          filePath: parsed.filePath,
          ref: parsed.ref,
          number: parsed.number,
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
      const parsed = parseBody(WorkflowBody, req);
      try {
        const result = await readWorkflowLogs(parsed);
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
      const parsed = parseBody(TelegramBody, req);
      const result = await readTelegramTopicHistory(pool, parsed);
      res.json(result);
    }),
  );

  // ---- record_decision ----
  r.post(
    "/api/internal/openclaw/decision",
    asyncHandler(async (req, res) => {
      const parsed = parseBody(DecisionBody, req);
      const result = await recordDecision(pool, parsed);
      res.json(result);
    }),
  );

  // ---- decisions: list ----
  r.post(
    "/api/internal/openclaw/decisions/list",
    asyncHandler(async (req, res) => {
      const parsed = parseBody(ListBody, req);
      const result = await listRecentDecisions(
        pool,
        parsed.founderUserId,
        parsed.limit ?? 20,
      );
      res.json({ decisions: result });
    }),
  );

  // ---- classify (Stage 4c — Layer 1 Haiku JSON classifier) ----
  // Один короткий Haiku-call (~$0.0002) повертає `{ class, shortcut?, persona?,
  // params?, chat_response? }`. Plugin (`hooks/cheap-router.ts`) маршрутизує:
  // routine_* → Layer 0 shortcut, chat → reply verbatim, thinking → Layer 2.
  // 503 якщо ANTHROPIC_API_KEY відсутній (deploy-config bug, не runtime);
  // 502 якщо Haiku фейлить — caller fail-closes до Layer 2 (env env_invoked).
  r.post(
    "/api/internal/openclaw/classify",
    asyncHandler(async (req, res) => {
      const apiKey = env.ANTHROPIC_API_KEY;
      if (!apiKey) {
        // Не світимо назву env-змінної клієнту: вона потрапляє у formatApiError
        // і показується юзеру дослівно. Дискримінатор для frontend — `code`.
        res.status(503).json({
          error: "AI-помічник тимчасово недоступний. Спробуй пізніше.",
          code: "ANTHROPIC_KEY_MISSING",
        });
        return;
      }
      const parsed = parseBody(ClassifyBody, req);
      try {
        const classification = await classifyMessage(
          {
            userMessage: parsed.userMessage,
            ...(parsed.systemPrompt
              ? { systemPrompt: parsed.systemPrompt }
              : {}),
          },
          apiKey,
        );
        res.json(classification);
      } catch {
        // Не leak-аємо Anthropic error message клієнту — plugin
        // лише знає, що classifier недоступний, і escalates до Layer 2.
        res.status(502).json({ error: "classify_upstream_error" });
      }
    }),
  );

  // ---- budget: pre-call check ----
  r.post(
    "/api/internal/openclaw/budget",
    asyncHandler(async (req, res) => {
      const parsed = parseBody(BudgetBody, req);
      const result = await checkDailyBudget(
        pool,
        parsed.founderUserId,
        parsed.tzName,
      );
      res.json(result);
    }),
  );

  // ---- ai-cost-summary (`/ai_cost` slash-command backend) ----
  //
  // Realtime AI-spend rollup for founder DM. Sources:
  //   - Anthropic per-day/-week/-month — `ai_usage_daily` ledger
  //     (PR-12 #2567) у Europe/Kyiv-добу.
  //   - Voyage cumulative + top-3 endpoints — in-process Prom-counter
  //     `ai_cost_estimate_usd_total` (since process restart).
  //   - Budget envelopes — `ANTHROPIC_MONTHLY_BUDGET_USD` /
  //     `VOYAGE_MONTHLY_BUDGET_USD` env-vars (PR-13 #2590).
  //
  // Body: optional `{ trendDays?: 1..30 }` — включає per-day Anthropic
  // trend-block (для `/ai_cost <N>` UI). Без trendDays — legacy shape
  // (today/week/month).
  r.post(
    "/api/internal/openclaw/ai-cost-summary",
    asyncHandler(async (req, res) => {
      const parsed = parseBody(AiCostSummaryBody, req);
      const summary = await buildAiCostSummary({
        pool,
        budget: {
          anthropicMonthlyBudgetUsd: env.ANTHROPIC_MONTHLY_BUDGET_USD,
          voyageMonthlyBudgetUsd: env.VOYAGE_MONTHLY_BUDGET_USD,
        },
        ...(parsed.trendDays !== undefined
          ? { trendDays: parsed.trendDays }
          : {}),
      });
      res.json(summary);
    }),
  );

  // ---- perf-snapshot (`/perf` slash-command backend) ----
  //
  // Server-side performance TLDR для founder DM (продовжує
  // observability-cluster: `/ai_cost` PR-26 #2706, `/alerts history`
  // #2715, `/openclaw status` #2709).
  //
  // Sources — in-process prom-client register:
  //   - HTTP latency p50/p95/p99 from `http_request_duration_ms`
  //     histogram, top-N routes by call count.
  //   - AI latency p95 from `ai_request_duration_ms` histogram
  //     (per-provider — anthropic / voyage / etc).
  //   - DB pool gauges (`db_pool_total/idle/waiting`).
  //   - AI memory queue depth gauge (`ai_memory_ingest_queue_depth`).
  //   - Top error routes from `http_errors_total`.
  //
  // Все cumulative since-process-restart (не 5min-rate — для того
  // потрібна Prometheus-сторона). Formatter рендерить `uptime` секцію
  // явно щоб founder-а не вводити в оману.
  //
  // Body порожній — endpoint без аргументів, founder-bound через
  // internal-API-bearer guard.
  r.post(
    "/api/internal/openclaw/perf-snapshot",
    asyncHandler(async (_req, res) => {
      const snapshot = await buildPerfSnapshot();
      res.json(snapshot);
    }),
  );

  // ---- invocations: open ----
  r.post(
    "/api/internal/openclaw/invocations/open",
    asyncHandler(async (req, res) => {
      const parsed = parseBody(OpenInvocationBody, req);
      const id = await openInvocation(pool, parsed);
      res.json({ invocationId: id });
    }),
  );

  // ---- invocations: finalize ----
  r.post(
    "/api/internal/openclaw/invocations/finalize",
    asyncHandler(async (req, res) => {
      const parsed = parseBody(FinalizeInvocationBody, req);
      await finalizeInvocation(pool, {
        invocationId: parsed.invocationId,
        status: parsed.status as OpenClawStatus,
        assistantResponse: parsed.assistantResponse,
        toolCalls: parsed.toolCalls as OpenClawToolCall[] | undefined,
        costUsd: parsed.costUsd,
        durationMs: parsed.durationMs,
        iterations: parsed.iterations,
        errorMessage: parsed.errorMessage,
        toneMode: parsed.toneMode as OpenClawToneMode | null | undefined,
        metadataPatch: parsed.metadataPatch,
      });
      res.json({ ok: true });
    }),
  );

  // ---- get_stripe_metrics (ADR-0032) ----
  r.post(
    "/api/internal/openclaw/metrics/stripe",
    asyncHandler(async (req, res) => {
      const parsed = parseBody(StripeMetricsBody, req);
      const result = await getStripeMetrics({ days: parsed.days });
      res.json(result);
    }),
  );

  // ---- get_sentry_issues (ADR-0032) ----
  r.post(
    "/api/internal/openclaw/metrics/sentry",
    asyncHandler(async (req, res) => {
      const parsed = parseBody(SentryIssuesBody, req);
      const result = await getSentryIssues({
        level: parsed.level,
        limit: parsed.limit,
      });
      res.json(result);
    }),
  );

  // ---- get_server_stats (ADR-0032) ----
  r.post(
    "/api/internal/openclaw/metrics/server",
    asyncHandler(async (req, res) => {
      parseBody(ServerStatsBody, req);
      const result = await getServerStats();
      res.json(result);
    }),
  );

  // ---- get_posthog_stats (ADR-0032) ----
  r.post(
    "/api/internal/openclaw/metrics/posthog",
    asyncHandler(async (req, res) => {
      const parsed = parseBody(PostHogStatsBody, req);
      const result = await getPostHogStats({ days: parsed.days });
      res.json(result);
    }),
  );

  // ---- get_github_releases (ADR-0032) ----
  r.post(
    "/api/internal/openclaw/github/releases",
    asyncHandler(async (req, res) => {
      const parsed = parseBody(GithubReleasesBody, req);
      const result = await getGithubReleases({
        limit: parsed.limit,
        repo: parsed.repo,
      });
      res.json(result);
    }),
  );

  // ---- morning briefing assembler (PR-26, no LLM) ----
  //
  // POST /api/internal/openclaw/briefing/morning → { markdown, data }.
  // Caller-и:
  //   - OpenClaw morning-cron (ops/openclaw/provision-cron.mjs) — замінює
  //     placeholder-payload своїм запитом + пушить markdown у founder-DM.
  //   - Manual probe з /digest day shortcut (future wiring).
  // Жодних side-ефектів — endpoint лиш збирає + рендерить. Fail-soft на
  // кожну джерельну функцію (див. builder.ts → mapXxx-секції).
  r.post(
    "/api/internal/openclaw/briefing/morning",
    asyncHandler(async (req, res) => {
      const parsed = parseBody(MorningBriefingBody, req);
      const input: Parameters<typeof assembleMorningBriefing>[0] = {};
      if (parsed.windowDays !== undefined) input.windowDays = parsed.windowDays;
      if (parsed.githubRepo !== undefined) input.githubRepo = parsed.githubRepo;
      if (parsed.sentryLimit !== undefined)
        input.sentryLimit = parsed.sentryLimit;
      if (parsed.prLimit !== undefined) input.prLimit = parsed.prLimit;
      if (parsed.includeProposals !== undefined)
        input.includeProposals = parsed.includeProposals;
      const result = await assembleMorningBriefing(input);
      // PR /mute (Phase 5b): augment response з mute-state коли caller
      // передав founderUserId. n8n WF-25 cron консумер читає `mute.muted`
      // і short-circuit-ує `sendMessage`. Briefing markdown усе одно
      // зберігається (cost-free аудит).
      if (parsed.founderUserId) {
        const mute = await isFounderMuted(pool, {
          founderUserId: parsed.founderUserId,
        });
        res.json({ ...result, mute });
        return;
      }
      res.json(result);
    }),
  );

  // ---- O3 (Phase 2.B): Friday weekly review ritual ----
  //
  // POST /api/internal/openclaw/ritual/weekly → { markdown, data }.
  // Викликає n8n WF-26 (cron `0 18 * * FRI Europe/Kyiv`) — після
  // отримання markdown WF постить його у founder-DM. Fail-soft: будь-яка
  // джерельна subsystem (GitHub / Stripe / PostHog / Sentry / LLM) недо-
  // ступна → секція з `notConfigured` або `note`, але endpoint все одно
  // повертає 200 з частковими даними. LLM narrative — через `LLMProvider`
  // абстракцію (PR-23) з StubProvider fallback (PR-25 паттерн).
  r.post(
    "/api/internal/openclaw/ritual/weekly",
    asyncHandler(async (req, res) => {
      const parsed = parseBody(WeeklyReviewBody, req);
      const input: Parameters<typeof assembleWeeklyReview>[0] = {};
      if (parsed.windowDays !== undefined) input.windowDays = parsed.windowDays;
      if (parsed.staleDays !== undefined) input.staleDays = parsed.staleDays;
      if (parsed.githubRepo !== undefined) input.githubRepo = parsed.githubRepo;
      if (parsed.sentryLimit !== undefined)
        input.sentryLimit = parsed.sentryLimit;
      if (parsed.prLimit !== undefined) input.prLimit = parsed.prLimit;
      const result = await assembleWeeklyReview(input);
      res.json(result);
    }),
  );

  // ---- O3 (Phase 2.B): Monthly OKR review ritual ----
  //
  // POST /api/internal/openclaw/ritual/monthly → { markdown, data }.
  // Викликає n8n WF-27 (cron `0 9 1 * *` Europe/Kyiv) — 1-го числа місяця
  // о 09:00 Kyiv. OKR-список читається з `INTERIM_OKRS` (hardcoded, поки
  // PR-34 strategic_goals DB-table не merged). Wins/risks збираються з
  // GitHub + Sentry. Narrative — LLM з template fallback.
  r.post(
    "/api/internal/openclaw/ritual/monthly",
    asyncHandler(async (req, res) => {
      const parsed = parseBody(MonthlyOkrReviewBody, req);
      const input: Parameters<typeof assembleMonthlyOkrReview>[0] = {};
      if (parsed.githubRepo !== undefined) input.githubRepo = parsed.githubRepo;
      if (parsed.prLimit !== undefined) input.prLimit = parsed.prLimit;
      if (parsed.staleDays !== undefined) input.staleDays = parsed.staleDays;
      if (parsed.sentryLevel !== undefined)
        input.sentryLevel = parsed.sentryLevel;
      const result = await assembleMonthlyOkrReview(input);
      res.json(result);
    }),
  );

  // ---- ADR-0036 (Phase 4): write-tools ----
  //
  // Side-effecting operations. Console approves with the founder via
  // inline-keyboard before invoking these. Each endpoint performs exactly
  // ONE upstream call; on missing credentials they return
  // `{ status: 'not_configured' }` so the audit-log captures the attempt
  // without throwing 5xx.

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

  // ─────────────────────────────────────────────────────────────────────
  // PR-C1c (Phase 1): n8n delegation surface
  // ─────────────────────────────────────────────────────────────────────

  // ---- n8n: list workflows ----
  r.post(
    "/api/internal/openclaw/n8n/list",
    asyncHandler(async (req, res) => {
      const parsed = parseBody(N8nListBody, req);
      const result = await listN8nWorkflows({
        tiers: parsed.tiers,
        limit: parsed.limit,
      });
      res.json(result);
    }),
  );

  // ---- n8n: describe a single workflow ----
  r.post(
    "/api/internal/openclaw/n8n/describe",
    asyncHandler(async (req, res) => {
      const parsed = parseBody(N8nWorkflowIdBody, req);
      const result = await describeN8nWorkflow({
        workflowId: parsed.workflowId,
      });
      res.json(result);
    }),
  );

  // ---- n8n: trigger (Tier A auto / Tier C gated; Tier B/D + unknown refused) ----
  r.post(
    "/api/internal/openclaw/n8n/trigger",
    asyncHandler(async (req, res) => {
      const parsed = parseBody(N8nWorkflowIdBody, req);
      try {
        const result = await triggerN8nWorkflow({
          workflowId: parsed.workflowId,
        });
        res.json(result);
      } catch (err) {
        if (err instanceof N8nAllowlistError) {
          return asN8nAllowlistFailure(res, err);
        }
        throw err;
      }
    }),
  );

  // ---- n8n: activate / deactivate (Tier A/C only; Tier B/D + unknown refused) ----
  r.post(
    "/api/internal/openclaw/n8n/activate",
    asyncHandler(async (req, res) => {
      const parsed = parseBody(N8nActivateBody, req);
      try {
        const result = await activateN8nWorkflow({
          workflowId: parsed.workflowId,
          active: parsed.active,
        });
        res.json(result);
      } catch (err) {
        if (err instanceof N8nAllowlistError) {
          return asN8nAllowlistFailure(res, err);
        }
        throw err;
      }
    }),
  );

  // ---- snapshot/refresh: fires every Tier A workflow in parallel ----
  r.post(
    "/api/internal/openclaw/snapshot/refresh",
    asyncHandler(async (req, res) => {
      const parsed = parseBody(SnapshotRefreshBody, req);
      const result = await refreshBusinessSnapshot({
        workflowIds: parsed.workflowIds,
      });
      res.json(result);
    }),
  );

  // ---- invocations: list (observability) ----
  r.post(
    "/api/internal/openclaw/invocations/list",
    asyncHandler(async (req, res) => {
      const parsed = parseBody(ListBody, req);
      const result = await listRecentInvocations(
        pool,
        parsed.founderUserId,
        parsed.limit ?? 50,
      );
      res.json({ invocations: result });
    }),
  );

  // ─── PR /mute (Phase 5b): founder DM "do not disturb" ─────────────────
  //
  // Чотири endpoints: `set`, `clear`, `status`, `check`. Slash `/mute`
  // (handler — `tools/openclaw/.../handler-info-commands.ts`) обертає
  // duration → ISO timestamp → POST /mute/set; `/mute off` → /mute/clear;
  // `/mute status` → /mute/status. `/mute/check` — read-only guard для
  // outbound channels (alerts shipper, briefing endpoint, ranok-cron).
  //
  // Critical-override: цей endpoint НЕ перевіряє severity — повертає
  // raw state. Caller (alerts shipper) сам приймає рішення про bypass
  // на P0 alerts. Це дозволяє кожному channel-у мати свій override-
  // criterion без перевантаженого guard-API.

  // ---- mute/set ----
  r.post(
    "/api/internal/openclaw/mute/set",
    asyncHandler(async (req, res) => {
      const parsed = parseBody(MuteSetBody, req);
      const mutedUntil = parsed.mutedUntilIso
        ? new Date(parsed.mutedUntilIso)
        : null;
      const state = await setFounderMute(pool, {
        founderUserId: parsed.founderUserId,
        mutedUntil,
        reason: parsed.reason ?? null,
      });
      res.json(state);
    }),
  );

  // ---- mute/clear ("/mute off") ----
  r.post(
    "/api/internal/openclaw/mute/clear",
    asyncHandler(async (req, res) => {
      const parsed = parseBody(MuteFounderBody, req);
      const state = await clearFounderMute(pool, {
        founderUserId: parsed.founderUserId,
      });
      res.json(state);
    }),
  );

  // ---- mute/status ("/mute status" reply payload) ----
  r.post(
    "/api/internal/openclaw/mute/status",
    asyncHandler(async (req, res) => {
      const parsed = parseBody(MuteFounderBody, req);
      const state = await getFounderMute(pool, {
        founderUserId: parsed.founderUserId,
      });
      res.json({ state });
    }),
  );

  // ---- mute/check (runtime guard for outbound channels) ----
  r.post(
    "/api/internal/openclaw/mute/check",
    asyncHandler(async (req, res) => {
      const parsed = parseBody(MuteFounderBody, req);
      const result = await isFounderMuted(pool, {
        founderUserId: parsed.founderUserId,
      });
      res.json(result);
    }),
  );

  // ---- whois ("/openclaw whois <tg_id|@username>" payload) ----
  //
  // Read-only aggregator. Telegram resolution через
  // `SERGEANT_ALERT_BOT_TOKEN` (той самий бот, що read-telegram-topic
  // -history-у). Якщо токен пустий — `telegramClient: null`, resolution
  // skip-ується (consumer бачить `telegramError.code = "api_error"`
  // тільки коли є client + getChat fail). Cache layer навмисно
  // відсутній — invocations rollup має бути fresh для debug-у.
  r.post(
    "/api/internal/openclaw/whois",
    asyncHandler(async (req, res) => {
      const parsed = parseBody(WhoisLookupBody, req);
      const token = env.SERGEANT_ALERT_BOT_TOKEN;
      const telegramClient = token ? createTelegramBotClient({ token }) : null;
      const result = await lookupWhois(pool, {
        founderUserId: parsed.founderUserId,
        founderTgUserId: parsed.founderTgUserId,
        ...(parsed.tgUserId !== undefined ? { tgUserId: parsed.tgUserId } : {}),
        ...(parsed.username !== undefined ? { username: parsed.username } : {}),
        ...(parsed.windowDays !== undefined
          ? { windowDays: parsed.windowDays }
          : {}),
        ...(parsed.topToolsLimit !== undefined
          ? { topToolsLimit: parsed.topToolsLimit }
          : {}),
        telegramClient,
      });
      res.json(result);
    }),
  );

  // ─── PR-C1b: code-understanding read tools ────────────────────────────

  // ---- github_search ----
  r.post(
    "/api/internal/openclaw/github/search",
    asyncHandler(async (req, res) => {
      const parsed = parseBody(GithubSearchBody, req);
      try {
        const result = await githubSearch(parsed);
        res.json(result);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        res.status(400).json({ error: "github_error", message });
      }
    }),
  );

  // ---- github_tree ----
  r.post(
    "/api/internal/openclaw/github/tree",
    asyncHandler(async (req, res) => {
      const parsed = parseBody(GithubTreeBody, req);
      try {
        const result = await githubTree(parsed);
        res.json(result);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        res.status(400).json({ error: "github_error", message });
      }
    }),
  );

  // ---- github_diff ----
  r.post(
    "/api/internal/openclaw/github/diff",
    asyncHandler(async (req, res) => {
      const parsed = parseBody(GithubDiffBody, req);
      try {
        const result = await githubDiff(parsed);
        res.json(result);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        res.status(400).json({ error: "github_error", message });
      }
    }),
  );

  // ---- github_prs ----
  r.post(
    "/api/internal/openclaw/github/prs",
    asyncHandler(async (req, res) => {
      const parsed = parseBody(GithubPrsBody, req);
      try {
        const result = await githubPrs(parsed);
        res.json(result);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        res.status(400).json({ error: "github_error", message });
      }
    }),
  );

  // ─── PR-C1b: SEO env-stub tools ─────────────────────────────────────

  // ---- seo_gsc_query ----
  r.post(
    "/api/internal/openclaw/seo/gsc",
    asyncHandler(async (req, res) => {
      const parsed = parseBody(SeoGscQueryBody, req);
      try {
        const result = await seoGscQuery(parsed);
        res.json(result);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        res.status(400).json({ error: "seo_error", message });
      }
    }),
  );

  // ---- seo_psi_audit ----
  r.post(
    "/api/internal/openclaw/seo/lighthouse",
    asyncHandler(async (req, res) => {
      const parsed = parseBody(SeoPsiAuditBody, req);
      try {
        const result = await seoPsiAudit(parsed);
        res.json(result);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        res.status(400).json({ error: "seo_error", message });
      }
    }),
  );

  // ---- seo_serp_lookup ----
  r.post(
    "/api/internal/openclaw/seo/serp",
    asyncHandler(async (req, res) => {
      const parsed = parseBody(SeoSerpLookupBody, req);
      try {
        const result = await seoSerpLookup(parsed);
        res.json(result);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        res.status(400).json({ error: "seo_error", message });
      }
    }),
  );

  // ─── PR-C1b: reminders ──────────────────────────────────────────────

  // ---- reminders/set ----
  r.post(
    "/api/internal/openclaw/reminders/set",
    asyncHandler(async (req, res) => {
      const parsed = parseBody(SetReminderBody, req);
      try {
        const reminder = await setReminder(pool, parsed);
        res.json({ reminder });
      } catch (err) {
        if (err instanceof ReminderValidationError) {
          return asSchemaFailure(res, err);
        }
        throw err;
      }
    }),
  );

  // ---- reminders/list-due ----
  r.post(
    "/api/internal/openclaw/reminders/list-due",
    asyncHandler(async (req, res) => {
      const parsed = parseBody(ListDueRemindersBody, req);
      const opts: { limit?: number; nowIso?: string } = {};
      if (parsed.limit !== undefined) opts.limit = parsed.limit;
      if (parsed.nowIso !== undefined) opts.nowIso = parsed.nowIso;
      const reminders = await listDueReminders(pool, opts);
      res.json({ reminders });
    }),
  );

  // ---- reminders/mark-sent (used by cron-poller after delivery) ----
  r.post(
    "/api/internal/openclaw/reminders/mark-sent",
    asyncHandler(async (req, res) => {
      const parsed = parseBody(ReminderMarkBody, req);
      const reminder = await markReminderSent(pool, parsed.reminderId);
      if (!reminder) {
        return asNotFound(
          res,
          new Error(`reminder ${parsed.reminderId} not in 'pending' state`),
        );
      }
      res.json({ reminder });
    }),
  );

  // ---- reminders/mark-failed (used after attempts exhausted) ----
  r.post(
    "/api/internal/openclaw/reminders/mark-failed",
    asyncHandler(async (req, res) => {
      const parsed = parseBody(ReminderMarkBody, req);
      const reminder = await markReminderFailed(
        pool,
        parsed.reminderId,
        parsed.reason,
      );
      if (!reminder) {
        return asNotFound(
          res,
          new Error(`reminder ${parsed.reminderId} not in 'pending' state`),
        );
      }
      res.json({ reminder });
    }),
  );

  // ---- reminders/cancel (founder-initiated) ----
  r.post(
    "/api/internal/openclaw/reminders/cancel",
    asyncHandler(async (req, res) => {
      const parsed = parseBody(ReminderMarkBody, req);
      const founderUserId = parsed.founderUserId;
      if (!founderUserId) {
        return asSchemaFailure(
          res,
          new Error("reminders/cancel: founderUserId required"),
        );
      }
      const reminder = await markReminderCancelled(
        pool,
        parsed.reminderId,
        founderUserId,
      );
      if (!reminder) {
        return asNotFound(
          res,
          new Error(
            `reminder ${parsed.reminderId} not cancellable (not pending or not owned)`,
          ),
        );
      }
      res.json({ reminder });
    }),
  );

  // ---- reminders/list (founder-scoped) ----
  r.post(
    "/api/internal/openclaw/reminders/list",
    asyncHandler(async (req, res) => {
      const parsed = parseBody(RemindersListBody, req);
      const reminders = await listFounderReminders(pool, {
        founderUserId: parsed.founderUserId,
        statuses: parsed.statuses,
        ...(parsed.limit !== undefined ? { limit: parsed.limit } : {}),
      });
      res.json({ reminders });
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
