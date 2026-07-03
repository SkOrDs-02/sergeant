/**
 * Zod body-схеми для `/api/internal/openclaw/*` (див. `../openclaw.ts`).
 *
 * G1-декомпозиція (tech-debt-assessment-2026-07-01 § Група 1, п.6):
 * схеми перенесено з `routes/internal/openclaw.ts` без жодних змін
 * валідації — pure move-refactor. PAT-чутлива поверхня (Hard Rule #20):
 * не послаблюй схеми без review.
 */

import { z } from "zod";
import { MAX_TREND_DAYS } from "../../../modules/openclaw/index.js";

export const TRIGGER_VALUES = [
  "dm",
  "morning_ritual",
  "weekly_review",
  "monthly_okr",
] as const;

export const STATUS_VALUES = [
  "success",
  "error",
  "budget_exceeded",
  "iteration_cap",
  "allowlist_fail",
  "dm_only_violation",
] as const;

export const ToolCallSchema = z.object({
  tool: z.string().min(1),
  input: z.record(z.string(), z.unknown()),
  output_chars: z.number().int().nonnegative(),
  output_preview: z.string(),
  status: z.enum(["ok", "error"]),
  error: z.string().optional(),
  duration_ms: z.number().int().nonnegative(),
});

export const RecallBody = z.object({
  founderUserId: z.string().min(1),
  query: z.string().min(1).max(2000),
  topK: z.number().int().min(1).max(50).optional(),
});

// ─── /forget slash-команда (PR-23) ───────────────────────────────────────
// Single endpoint, mode-dispatched. Зміна mode — без routing reshuffle.
export const ForgetBody = z
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

export const ForgetConfirmBody = z
  .object({
    founderUserId: z.string().min(1),
    founderTgUserId: z.number().int(),
    rawCommand: z.string().min(1).max(500),
    token: z.string().uuid(),
  })
  .strict();

export const ForgetCancelBody = z
  .object({
    founderUserId: z.string().min(1),
    token: z.string().uuid(),
  })
  .strict();

export const StrategyBody = z.object({
  path: z.string().min(1).max(500),
});

// `/ai_cost <days>` — optional trend-window. Порожнє body беремо як
// legacy `/ai_cost` (без trend); `trendDays: 1..30` — включає
// Anthropic per-day series. Object loose-mode — forward-compat для
// майбутніх параметрів (e.g. provider filter).
export const AiCostSummaryBody = z
  .object({
    trendDays: z.number().int().min(1).max(MAX_TREND_DAYS).optional(),
  })
  .strict();

export const QueryBody = z.object({
  sql: z.string().min(1).max(8000),
  params: z.array(z.unknown()).optional(),
  limit: z.number().int().min(1).max(1000).optional(),
});

export const GithubBody = z.object({
  repo: z.string().optional(),
  mode: z.enum(["file", "issue", "pr"]),
  filePath: z.string().optional(),
  ref: z.string().optional(),
  number: z.number().int().positive().optional(),
});

export const WorkflowBody = z.object({
  workflowId: z.string().min(1),
  since: z.string().optional(),
  limit: z.number().int().min(1).max(50).optional(),
});

export const TelegramBody = z.object({
  topic: z.string().min(1),
  since: z.string().optional(),
  limit: z.number().int().min(1).max(100).optional(),
});

export const DecisionBody = z.object({
  founderUserId: z.string().min(1),
  topic: z.string().min(1).max(200),
  context: z.string().min(1).max(8000),
  decision: z.string().min(1).max(4000),
  rationale: z.string().min(1).max(8000),
  alternatives: z.string().max(8000).optional(),
  invocationId: z.number().int().positive().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export const BudgetBody = z.object({
  founderUserId: z.string().min(1),
  tzName: z.string().optional(),
});

// PR-Stage4c: classify body. `systemPrompt` опційний — plugin шле його
// тільки якщо завантажив prompt з `cheapRouterSystemPromptPath` (canonical
// file у `ops/openclaw/cheap-router.system.md`); інакше route використовує
// embedded fallback з `modules/openclaw/classify.ts`. Max length підібрана
// з запасом: реальні DM-и < 1000 символів, prompt < 4 кБ.
export const ClassifyBody = z
  .object({
    userMessage: z.string().min(1).max(8000),
    systemPrompt: z.string().min(1).max(8000).optional(),
  })
  .strict();

export const OpenInvocationBody = z.object({
  founderUserId: z.string().min(1),
  founderTgUserId: z.number().int(),
  trigger: z.enum(TRIGGER_VALUES),
  userMessage: z.string().min(1).max(8000),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export const FinalizeInvocationBody = z.object({
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

export const ListBody = z.object({
  founderUserId: z.string().min(1),
  limit: z.number().int().min(1).max(100).optional(),
});

// PR /mute (Phase 5b): founder DM "do not disturb" mute schemas.
// `mutedUntil` приймається ISO 8601 (`2026-05-13T22:00:00Z`); null/omit
// ≡ "/mute off". `reason` — необов'язковий free-text label.
export const MuteSetBody = z.object({
  founderUserId: z.string().min(1),
  mutedUntilIso: z.string().datetime({ offset: true }).nullable().optional(),
  reason: z.string().min(1).max(200).nullable().optional(),
});
export const MuteFounderBody = z.object({
  founderUserId: z.string().min(1),
});

// PR /whois (debug): `/openclaw whois <tg_user_id|@username>` body.
// Хоч один з `tgUserId` / `username` має бути присутній — Zod refine
// гарантує це на boundary, щоб не пускати у `lookupWhois` пустий
// lookup. `founderTgUserId` обов'язковий для `isFounder` check-у
// (caller дістає з env).
export const WhoisLookupBody = z
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

export const StripeMetricsBody = z.object({
  days: z.number().int().min(1).max(90).optional(),
});

export const SentryIssuesBody = z.object({
  level: z.enum(["fatal", "error", "warning"]).optional(),
  limit: z.number().int().min(1).max(50).optional(),
});

export const PostHogStatsBody = z.object({
  days: z.number().int().min(1).max(180).optional(),
});

export const GithubReleasesBody = z.object({
  limit: z.number().int().min(1).max(20).optional(),
  repo: z.string().optional(),
});

export const ServerStatsBody = z.object({}).strict();

// PR-26: morning briefing payload — всі поля optional, бо консумер (cron
// dispatcher / manual probe) може приймати дефолти.
// O1 / Phase 2.A: додано `includeProposals` (default true) — вимикає
// LLM-call для proposals-секції коли caller хоче чистий 5-секційний
// briefing без витрат токенів (наприклад, retry після Anthropic outage).
export const MorningBriefingBody = z
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
export const WeeklyReviewBody = z
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
export const MonthlyOkrReviewBody = z
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

export const CommitStrategyDocBody = z.object({
  path: z.string().min(1).max(500),
  content: z.string().min(1).max(80_000),
  message: z.string().min(1).max(200),
  repo: z.string().optional(),
});

export const CreateGithubIssueBody = z.object({
  title: z.string().min(1).max(200),
  body: z.string().min(1).max(20_000),
  labels: z.array(z.string().min(1).max(50)).max(10).optional(),
  repo: z.string().optional(),
});

export const PostToTopicBody = z.object({
  topic: z.string().min(1),
  text: z.string().min(1).max(4000),
});

export const PauseWorkflowBody = z.object({
  workflowId: z.string().min(1).max(100),
  reason: z.string().max(1000).optional(),
});

export const MuteAlertBody = z.object({
  issueId: z.string().min(1).max(200),
  untilIso: z.string().datetime({ offset: true }).optional(),
});

// ADR-0037 (Phase 4.5): write-audit log endpoints. Console writes a row
// per approve/reject/executed transition; the same id pairs `approved` +
// `executed` so latency is reconstructable.

export const WRITE_AUDIT_ACTIONS = [
  "approved",
  "executed",
  "rejected",
] as const;

export const WriteAuditLogBody = z
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

export const N8N_TIER_VALUES = ["A", "B", "C", "D"] as const;

export const N8nListBody = z
  .object({
    tiers: z.array(z.enum(N8N_TIER_VALUES)).max(4).optional(),
    limit: z.number().int().min(1).max(250).optional(),
  })
  .strict();

export const N8nWorkflowIdBody = z
  .object({
    workflowId: z.string().min(1).max(64),
  })
  .strict();

export const N8nActivateBody = z
  .object({
    workflowId: z.string().min(1).max(64),
    active: z.boolean(),
  })
  .strict();

export const SnapshotRefreshBody = z
  .object({
    workflowIds: z.array(z.string().min(1).max(64)).max(50).optional(),
  })
  .strict();

export const WriteAuditListBody = z
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

export const GithubSearchBody = z
  .object({
    scope: z.enum(["code", "issues", "prs"]).optional(),
    query: z.string().min(1).max(500),
    repo: z.string().min(1).max(200).optional(),
    perPage: z.number().int().min(1).max(30).optional(),
    page: z.number().int().min(1).max(10).optional(),
  })
  .strict();

export const GithubTreeBody = z
  .object({
    ref: z.string().min(1).max(200).optional(),
    repo: z.string().min(1).max(200).optional(),
    recursive: z.boolean().optional(),
  })
  .strict();

export const GithubDiffBody = z
  .object({
    base: z.string().min(1).max(200),
    head: z.string().min(1).max(200),
    repo: z.string().min(1).max(200).optional(),
  })
  .strict();

export const GithubPrsBody = z
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

export const SeoGscQueryBody = z
  .object({
    days: z.number().int().min(1).max(90).optional(),
    dimension: z.enum(["query", "page", "country", "device"]).optional(),
    siteUrl: z.string().min(1).max(500).optional(),
    rowLimit: z.number().int().min(1).max(100).optional(),
  })
  .strict();

export const SeoPsiAuditBody = z
  .object({
    url: z.string().url().max(2000),
    strategy: z.enum(["mobile", "desktop"]).optional(),
  })
  .strict();

export const SeoSerpLookupBody = z
  .object({
    query: z.string().min(1).max(500),
    hl: z.string().min(2).max(10).optional(),
    gl: z.string().min(2).max(10).optional(),
    num: z.number().int().min(1).max(20).optional(),
  })
  .strict();

// ─── PR-C1b: reminders ─────────────────────────────────────────────────

export const SetReminderBody = z
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

export const ListDueRemindersBody = z
  .object({
    limit: z.number().int().min(1).max(200).optional(),
    /** Test-only override; production passes nothing → defaults to `NOW()`. */
    nowIso: z.string().datetime({ offset: true }).optional(),
  })
  .strict();

export const ReminderMarkBody = z
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

export const RemindersListBody = z
  .object({
    founderUserId: z.string().min(1),
    statuses: z
      .array(z.enum(["pending", "sent", "cancelled", "failed"]))
      .max(4)
      .optional(),
    limit: z.number().int().min(1).max(200).optional(),
  })
  .strict();
