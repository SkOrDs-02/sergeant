/**
 * Orchestrator для `/openclaw status` slash-command-у.
 *
 * Full lifecycle handler-у (parse-input → optional audit-open → fan-out
 * 4 fetch-ів паралельно → render snapshot → optional audit-finalize →
 * reply) як pure async function, що приймає всі залежності через
 * `StatusRunnerDeps`. Це дозволяє unit-тестувати lifecycle без grammy
 * `Bot` / `Context` instance-у.
 *
 * Окремо від `handler-info-commands.ts` тримаємо щоб:
 *   1. `handler-info-commands.ts` лишався тонким shim-ом над grammy;
 *   2. усі 4 fetch-and-merge гілки + audit life-cycle покривались
 *      Vitest-ом, не лише `parseOpenclawCommand`.
 *
 * Audit-rows пишемо у `openclaw_invocations` через ту саму pair
 * endpoint-ів, що й `/alerts` / `/ritual`. Trigger завжди `dm`
 * (info-команда), розрізнення по `metadata.slashCommand = "/openclaw"`.
 *
 * Sentry breadcrumb на кожен trigger (`openclaw.status.*`). Якщо
 * `SENTRY_DSN` не виставлений — `Sentry.addBreadcrumb` no-op (див.
 * `obs/sentry.ts`).
 */

import { ALL_PERSONAS, DEFAULT_PERSONA } from "../agents/personas.js";
import {
  formatStatusSnapshot,
  OPENCLAW_HELP_TEXT,
  parseOpenclawCommand,
  type InvocationRow,
  type OpenclawSubcommand,
  type ParsedOpenclawCommand,
  type SentryIssue,
  type StatusSnapshot,
  type WorkflowRow,
} from "./status-format.js";

// ─────────────────────────────────────────────────────────────────────────
// Fetcher abstraction
// ─────────────────────────────────────────────────────────────────────────

/**
 * Сирий response shape від `/api/internal/openclaw/invocations/list`.
 * Mirrored від `listRecentInvocations()` у
 * `apps/server/src/modules/openclaw/store.ts`.
 */
export interface InvocationsListResponse {
  invocations: Array<{
    id: number;
    invoked_at: string;
    trigger: string;
    user_message: string;
    status: string;
    cost_usd: number;
    duration_ms: number;
    iterations: number;
    tone_mode: string | null;
  }>;
}

/**
 * Сирий response від `/api/internal/openclaw/n8n/list`. Mirrored від
 * `listN8nWorkflows()` у `apps/server/src/modules/openclaw/n8n.ts`.
 */
export interface N8nListResponse {
  workflows: Array<{
    id: string;
    name: string;
    active: boolean;
    tier: string;
    category: string | null;
    updatedAt: string | null;
  }>;
  notConfigured?: boolean;
}

/**
 * Сирий response від `/api/internal/openclaw/budget`. Mirrored від
 * `checkDailyBudget()` у `apps/server/src/modules/openclaw/budget.ts`.
 */
export interface BudgetResponse {
  allowed: boolean;
  spentUsd: number;
  budgetUsd: number;
  remainingUsd: number;
  reason?: string;
}

/**
 * Сирий response від `/api/internal/openclaw/metrics/sentry`. Mirrored
 * від `getSentryIssues()` у `apps/server/src/modules/openclaw/tools.ts`.
 */
export interface SentryIssuesResponse {
  notConfigured?: boolean;
  issues?: Array<{
    title: string;
    level: string;
    count: string;
    permalink: string;
  }>;
  note?: string;
}

/**
 * Fetcher abstraction. У production injection-кою стає тонкий wrapper
 * над `postJson` з handler-constants.ts; у тестах — vi.fn(). Всі 4
 * data-fetch-методи можуть падати/повертати notConfigured — orchestrator
 * фільтрує і завжди render-ить.
 */
export interface StatusFetcher {
  listInvocations(): Promise<{
    ok: boolean;
    status: number;
    data: InvocationsListResponse | null;
  }>;
  listN8nWorkflows(): Promise<{
    ok: boolean;
    status: number;
    data: N8nListResponse | null;
  }>;
  getBudget(): Promise<{
    ok: boolean;
    status: number;
    data: BudgetResponse | null;
  }>;
  getSentryIssues(): Promise<{
    ok: boolean;
    status: number;
    data: SentryIssuesResponse | null;
  }>;
  openInvocation(input: {
    founderUserId: string;
    founderTgUserId: number;
    trigger: "dm";
    userMessage: string;
    metadata: Record<string, unknown>;
  }): Promise<{ ok: boolean; status: number; invocationId: number | null }>;
  finalizeInvocation(input: {
    invocationId: number;
    status: "success" | "error";
    assistantResponse: string | null;
    errorMessage: string | null;
  }): Promise<{ ok: boolean; status: number }>;
}

/**
 * Sentry breadcrumb sink — приймає вже зрендерений breadcrumb-record.
 * У production — `Sentry.addBreadcrumb({...})`, у тестах — vi.fn().
 */
export type StatusBreadcrumbFn = (breadcrumb: {
  category: string;
  message: string;
  level: "info" | "warning" | "error";
  data?: Record<string, unknown>;
}) => void;

export interface StatusRunnerDeps {
  /** Argument-частина after `/openclaw` (тобто `c.match`). */
  rawArgument: string;
  /** Better Auth opaque user-id founder-а (з env / OpenClaw config). */
  founderUserId: string;
  /** Telegram user-id founder-а (з allowlist-у, для audit-row-и). */
  founderTgUserId: number;
  /** Telegram chat-id (для metadata-аудиту). Optional. */
  telegramChatId?: number;
  /** Injection-pointable fetcher. */
  fetcher: StatusFetcher;
  /** Injection-pointable Sentry breadcrumb sink. */
  addBreadcrumb?: StatusBreadcrumbFn;
  /** Override clock — для детерміністичних тестів. */
  now?: () => Date;
}

export interface StatusRunResult {
  /** Final reply payload (HTML), готовий до `c.reply(reply, { parse_mode: "HTML" })`. */
  reply: string;
  /** Підкоманда, яку реально виконали. */
  subcommand: OpenclawSubcommand;
  /** ID audit-row-и у `openclaw_invocations`. `null` для help/unknown. */
  invocationId: number | null;
  /** Чи зайшли у happy-path (status — завжди true, навіть якщо джерела впали). */
  ok: boolean;
}

// ─────────────────────────────────────────────────────────────────────────
// Main entry point
// ─────────────────────────────────────────────────────────────────────────

/**
 * Виконує `/openclaw <subcommand>`. Не throw-ає — будь-який збій
 * мапиться у audit-error (для status) + помічається у Sentry-breadcrumb.
 */
export async function executeOpenclawStatusCommand(
  deps: StatusRunnerDeps,
): Promise<StatusRunResult> {
  const parsed = parseOpenclawCommand(deps.rawArgument);
  const emitBreadcrumb = deps.addBreadcrumb ?? (() => undefined);
  const now = deps.now ?? (() => new Date());

  if (parsed.subcommand === "help") {
    emitBreadcrumb({
      category: "openclaw.status",
      message: "openclaw.help",
      level: "info",
      data: { rawArgument: parsed.rawArgument },
    });
    return {
      reply: OPENCLAW_HELP_TEXT,
      subcommand: "help",
      invocationId: null,
      ok: true,
    };
  }

  if (parsed.subcommand === "unknown") {
    emitBreadcrumb({
      category: "openclaw.status",
      message: "openclaw.unknown_subcommand",
      level: "warning",
      data: { rawArgument: parsed.rawArgument },
    });
    return {
      reply: `${parsed.error ?? "Невідома підкоманда."}\n\n${OPENCLAW_HELP_TEXT}`,
      subcommand: "unknown",
      invocationId: null,
      ok: false,
    };
  }

  // === status — main path ============================================
  const userMessage = `/openclaw ${parsed.rawArgument || "status"}`.trim();

  emitBreadcrumb({
    category: "openclaw.status",
    message: "openclaw.status.start",
    level: "info",
    data: {
      founderTgUserId: deps.founderTgUserId,
      telegramChatId: deps.telegramChatId ?? null,
    },
  });

  const openRes = await deps.fetcher.openInvocation({
    founderUserId: deps.founderUserId,
    founderTgUserId: deps.founderTgUserId,
    trigger: "dm",
    userMessage,
    metadata: {
      telegramChatId: deps.telegramChatId ?? null,
      slashCommand: "/openclaw",
      subcommand: "status",
    },
  });
  const invocationId = openRes.invocationId;

  const [invsRes, wfRes, budgetRes, sentryRes] = await Promise.all([
    deps.fetcher.listInvocations(),
    deps.fetcher.listN8nWorkflows(),
    deps.fetcher.getBudget(),
    deps.fetcher.getSentryIssues(),
  ]);

  const snapshot: StatusSnapshot = {
    generatedAtIso: now().toISOString(),
    activePersona: DEFAULT_PERSONA,
    allowedPersonas: ALL_PERSONAS,
    invocations: mapInvocations(invsRes),
    workflows: mapWorkflows(wfRes),
    budget: mapBudget(budgetRes),
    lastError: mapLastError(sentryRes),
  };

  const reply = formatStatusSnapshot(snapshot, now());

  if (invocationId != null) {
    await deps.fetcher.finalizeInvocation({
      invocationId,
      status: "success",
      assistantResponse: reply,
      errorMessage: null,
    });
  }

  emitBreadcrumb({
    category: "openclaw.status",
    message: "openclaw.status.success",
    level: "info",
    data: {
      replyChars: reply.length,
      invocationsCount: snapshot.invocations.data?.length ?? 0,
      workflowsCount: snapshot.workflows.data?.length ?? 0,
      budgetOk: snapshot.budget.data?.allowed ?? null,
      lastErrorPresent: snapshot.lastError.data !== null,
    },
  });

  return {
    reply,
    subcommand: "status",
    invocationId,
    ok: true,
  };
}

// ─────────────────────────────────────────────────────────────────────────
// Section mappers — convert HTTP-response shapes to snapshot sections
// ─────────────────────────────────────────────────────────────────────────

function mapInvocations(res: {
  ok: boolean;
  status: number;
  data: InvocationsListResponse | null;
}): StatusSnapshot["invocations"] {
  if (!res.ok || !res.data) {
    return { data: null, error: `HTTP ${res.status}` };
  }
  const rows: InvocationRow[] = res.data.invocations.map((r) => ({
    id: r.id,
    invokedAt: r.invoked_at,
    trigger: r.trigger,
    status: r.status,
    userMessage: r.user_message,
    durationMs: r.duration_ms,
    costUsd: r.cost_usd,
    toneMode: r.tone_mode,
  }));
  return { data: rows, error: null };
}

function mapWorkflows(res: {
  ok: boolean;
  status: number;
  data: N8nListResponse | null;
}): StatusSnapshot["workflows"] {
  if (!res.ok || !res.data) {
    return { data: null, error: `HTTP ${res.status}`, notConfigured: false };
  }
  if (res.data.notConfigured) {
    return { data: null, error: null, notConfigured: true };
  }
  const rows: WorkflowRow[] = res.data.workflows.map((w) => ({
    id: w.id,
    name: w.name,
    active: w.active,
    tier: w.tier,
  }));
  return { data: rows, error: null, notConfigured: false };
}

function mapBudget(res: {
  ok: boolean;
  status: number;
  data: BudgetResponse | null;
}): StatusSnapshot["budget"] {
  if (!res.ok || !res.data) {
    return { data: null, error: `HTTP ${res.status}` };
  }
  const { spentUsd, budgetUsd, remainingUsd, allowed } = res.data;
  return { data: { spentUsd, budgetUsd, remainingUsd, allowed }, error: null };
}

function mapLastError(res: {
  ok: boolean;
  status: number;
  data: SentryIssuesResponse | null;
}): StatusSnapshot["lastError"] {
  if (!res.ok || !res.data) {
    return { data: null, error: `HTTP ${res.status}`, notConfigured: false };
  }
  if (res.data.notConfigured) {
    return { data: null, error: null, notConfigured: true };
  }
  const issues = res.data.issues ?? [];
  if (issues.length === 0) {
    return { data: null, error: null, notConfigured: false };
  }
  const first = issues[0];
  if (!first) {
    return { data: null, error: null, notConfigured: false };
  }
  const issue: SentryIssue = {
    title: first.title,
    level: first.level,
    count: first.count,
    permalink: first.permalink,
  };
  return { data: issue, error: null, notConfigured: false };
}

export type { ParsedOpenclawCommand };
