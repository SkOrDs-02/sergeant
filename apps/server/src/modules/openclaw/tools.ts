/**
 * Server-side implementations OpenClaw tool-ів (ADR-0031 §5).
 *
 * Чому tool-implementations тут на сервері, а не у `apps/console`:
 *   1) Tool-execution потребує Postgres + filesystem-access у repo +
 *      внутрішні API. Все це є на сервері; виносити у console — duplicate
 *      DI + risk дрейф конфігурації.
 *   2) Audit-log пишеться у Postgres — ближче до сервера.
 *   3) Безпекові межі (table-allowlist, doc-path-allowlist) — централі-
 *      зовані в одному місці. Console-bot робить лише HTTP-call до
 *      `/api/internal/openclaw/*` ендпоінтів і отримує готовий output;
 *      compromised console process не може bypass-ити allowlist.
 *
 * Кожна функція тут — pure async, без HTTP-залежностей. Express-handler
 * у `routes/internal/openclaw.ts` робить thin wrap.
 */

import { promises as fs } from "node:fs";
import path from "node:path";
import type { Pool } from "pg";
import { logger } from "../../obs/logger.js";
import { env } from "../../env.js";
import {
  QUERY_APP_DB_TABLE_ALLOWLIST,
  READ_STRATEGY_DOCS_ALLOWED_PATHS,
} from "./types.js";

// ─────────────────────────────────────────────────────────────────────────
// recall_memory — wrapper над AiMemoryService з хардкодом source='cofounder'
// ─────────────────────────────────────────────────────────────────────────

import { getAiMemory } from "../ai-memory/bootstrap.js";

export interface RecallMemoryInput {
  query: string;
  topK?: number;
}

export interface RecallMemoryOutput {
  memories: Array<{
    id: number | string;
    content: string;
    score: number;
    sourceRef: string | null;
    createdAt: string;
  }>;
}

/**
 * Хардкодить `sources=['cofounder']`. Запит будь-якого іншого source-у
 * проходить через service з пустим результатом — strict isolation
 * (ADR-0031 §3).
 */
export async function recallCofounderMemory(
  founderUserId: string,
  input: RecallMemoryInput,
): Promise<RecallMemoryOutput> {
  const results = await getAiMemory().recall({
    userId: founderUserId,
    query: input.query,
    topK: input.topK,
    sources: ["cofounder"],
  });

  return {
    memories: results.map((r) => ({
      id: r.id,
      content: r.content,
      score: r.score,
      sourceRef: r.sourceRef,
      createdAt: r.createdAt.toISOString(),
    })),
  };
}

// ─────────────────────────────────────────────────────────────────────────
// read_strategy_docs — file system з prefix-allowlist
// ─────────────────────────────────────────────────────────────────────────

export interface ReadStrategyDocsInput {
  /**
   * Relative path від repo root (наприклад, `docs/strategy/openclaw.md`).
   * Path traversal (`..`) blocked-кається через `path.resolve` +
   * prefix-check.
   */
  path: string;
}

export interface ReadStrategyDocsOutput {
  path: string;
  contents: string;
  /** Розмір у bytes. */
  size: number;
}

const REPO_ROOT_ENV = process.env.OPENCLAW_REPO_ROOT;

/**
 * Resolve `repoRoot`. Default — три рівні вище від цього файлу
 * (apps/server/src/modules/openclaw/tools.ts → repo root).
 */
function resolveRepoRoot(): string {
  if (REPO_ROOT_ENV) return path.resolve(REPO_ROOT_ENV);
  // Цей файл зкомпіляється у dist/, але import.meta.url дає absolute path.
  // У dev (tsx) — теж absolute. Беремо 5 рівнів угору:
  //   apps/server/src/modules/openclaw/tools.ts → /repo
  return path.resolve(import.meta.dirname ?? __dirname, "../../../../..");
}

export async function readStrategyDoc(
  input: ReadStrategyDocsInput,
): Promise<ReadStrategyDocsOutput> {
  const repoRoot = resolveRepoRoot();
  const requested = input.path.replace(/^\/+/, "");
  const resolved = path.resolve(repoRoot, requested);

  // Prefix-allowlist: resolved-path має починатися з repoRoot/<allowed>.
  const isAllowed = READ_STRATEGY_DOCS_ALLOWED_PATHS.some((prefix) => {
    const allowedRoot = path.resolve(repoRoot, prefix);
    return (
      resolved === allowedRoot || resolved.startsWith(allowedRoot + path.sep)
    );
  });
  if (!isAllowed) {
    throw new OpenClawAllowlistError(
      `Path '${input.path}' is not in read_strategy_docs allowlist`,
    );
  }

  // Stat first — якщо це директорія, повертаємо її вміст списком (для
  // index-у). Якщо файл — повертаємо contents.
  const stat = await fs.stat(resolved);
  if (stat.isDirectory()) {
    const entries = await fs.readdir(resolved);
    return {
      path: input.path,
      contents: entries.sort().join("\n"),
      size: entries.length,
    };
  }

  const contents = await fs.readFile(resolved, "utf-8");
  return {
    path: input.path,
    contents,
    size: stat.size,
  };
}

// ─────────────────────────────────────────────────────────────────────────
// query_app_db — read-only SQL з table-allowlist
// ─────────────────────────────────────────────────────────────────────────

export interface QueryAppDbInput {
  sql: string;
  params?: ReadonlyArray<unknown>;
  /** Hard cap на rows. Default 200, max 1000. */
  limit?: number;
}

export interface QueryAppDbOutput {
  rowCount: number;
  rows: Record<string, unknown>[];
  /** Список таблиць, які пройшли allowlist-перевірку. */
  tablesUsed: string[];
}

/**
 * Detects basic write-statements (INSERT/UPDATE/DELETE/TRUNCATE/ALTER/CREATE
 * /DROP/GRANT/REVOKE/COPY). Case-insensitive. Найперший token має бути
 * SELECT або WITH (для CTEs).
 */
function isWriteSql(sql: string): boolean {
  const trimmed = sql.trim().toLowerCase();
  if (
    trimmed.startsWith("select ") ||
    trimmed.startsWith("select(") ||
    trimmed.startsWith("with ")
  ) {
    return false;
  }
  return true;
}

/**
 * Витягає таблиці зі SQL за регексом FROM/JOIN. Не справжній parser, але
 * для simple read-queries-у достатньо. Якщо tool-input не пройде через
 * цей filter, запит fail-closed-ається.
 */
export function extractSqlTables(sql: string): string[] {
  // Strip коменти й string-literals (щоб не матчити "FROM" всередині них).
  const stripped = sql
    .replace(/--[^\n]*/g, "")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/'(?:[^']|'')*'/g, "");

  const re = /\b(?:from|join)\s+(?:only\s+)?([a-zA-Z_][a-zA-Z0-9_]*)\b/gi;
  const found = new Set<string>();
  for (const match of stripped.matchAll(re)) {
    if (match[1]) found.add(match[1].toLowerCase());
  }
  return [...found];
}

export class OpenClawAllowlistError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OpenClawAllowlistError";
  }
}

export async function queryAppDb(
  pool: Pool,
  input: QueryAppDbInput,
): Promise<QueryAppDbOutput> {
  if (typeof input.sql !== "string" || !input.sql.trim()) {
    throw new OpenClawAllowlistError("query_app_db: sql is required");
  }
  if (isWriteSql(input.sql)) {
    throw new OpenClawAllowlistError(
      "query_app_db: only SELECT / WITH queries are allowed",
    );
  }

  const tables = extractSqlTables(input.sql);
  const forbidden = tables.filter((t) => !QUERY_APP_DB_TABLE_ALLOWLIST.has(t));
  if (forbidden.length > 0) {
    throw new OpenClawAllowlistError(
      `query_app_db: tables not in allowlist: ${forbidden.join(", ")}`,
    );
  }

  const limit = Math.max(1, Math.min(1000, input.limit ?? 200));
  // Загорнули у subquery щоб LIMIT був enforce-нутий навіть якщо LLM
  // забув його. Дві LIMIT-и не псують план — Postgres приймає.
  const wrapped = `SELECT * FROM (${input.sql}) AS __openclaw_q LIMIT ${limit}`;

  const result = await pool.query(
    wrapped,
    input.params ? [...input.params] : [],
  );
  return {
    rowCount: result.rowCount ?? result.rows.length,
    rows: result.rows,
    tablesUsed: tables,
  };
}

// ─────────────────────────────────────────────────────────────────────────
// read_github — GitHub REST з GITHUB_PAT
// ─────────────────────────────────────────────────────────────────────────

export interface ReadGithubInput {
  /** "owner/repo". Default — env.OPENCLAW_GITHUB_REPO. */
  repo?: string;
  /** Один з трьох взаємовиключних режимів. */
  mode: "file" | "issue" | "pr";
  /** Для mode='file'. */
  filePath?: string;
  ref?: string;
  /** Для mode='issue' або 'pr'. */
  number?: number;
}

export interface ReadGithubOutput {
  url: string;
  status: number;
  body: unknown;
}

/**
 * Тонка обгортка над GitHub REST API. Token обов'язковий (fail-closed
 * якщо не задано).
 */
export async function readGithub(
  input: ReadGithubInput,
): Promise<ReadGithubOutput> {
  const token = env.OPENCLAW_GITHUB_PAT;
  if (!token) {
    throw new Error(
      "OPENCLAW_GITHUB_PAT is not configured; read_github disabled",
    );
  }
  const repo = input.repo ?? env.OPENCLAW_GITHUB_REPO;

  let url: string;
  if (input.mode === "file") {
    if (!input.filePath) {
      throw new Error("read_github: filePath required for mode='file'");
    }
    const ref = input.ref ?? env.OPENCLAW_GITHUB_BASE_BRANCH;
    url = `https://api.github.com/repos/${repo}/contents/${encodeURI(input.filePath)}?ref=${encodeURIComponent(ref)}`;
  } else if (input.mode === "issue") {
    if (!input.number) {
      throw new Error("read_github: number required for mode='issue'");
    }
    url = `https://api.github.com/repos/${repo}/issues/${input.number}`;
  } else if (input.mode === "pr") {
    if (!input.number) {
      throw new Error("read_github: number required for mode='pr'");
    }
    url = `https://api.github.com/repos/${repo}/pulls/${input.number}`;
  } else {
    throw new Error(`read_github: unknown mode '${input.mode as string}'`);
  }

  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": "OpenClaw-Bot",
    },
  });
  const body: unknown = await res.json().catch(() => null);
  return { url, status: res.status, body };
}

// ─────────────────────────────────────────────────────────────────────────
// read_workflow_logs — n8n execution traces
// ─────────────────────────────────────────────────────────────────────────

export interface ReadWorkflowLogsInput {
  workflowId: string;
  /** ISO-string. */
  since?: string;
  limit?: number;
}

export interface ReadWorkflowLogsOutput {
  workflowId: string;
  executions: Array<{
    id: string;
    finished: boolean;
    mode: string;
    startedAt: string | null;
    stoppedAt: string | null;
    status: string | null;
  }>;
}

/**
 * Читає n8n executions через REST API. Phase 1 — прямий REST-call, без
 * caching. Phase 2 може кешувати у Redis якщо стане bottleneck-ом.
 *
 * Якщо `N8N_API_URL` / `N8N_API_KEY` не задано — повертає порожній
 * список з warning-ом (graceful degradation).
 */
export async function readWorkflowLogs(
  input: ReadWorkflowLogsInput,
): Promise<ReadWorkflowLogsOutput> {
  const baseUrl = process.env.N8N_API_URL;
  const apiKey = process.env.N8N_API_KEY;
  if (!baseUrl || !apiKey) {
    logger.warn({
      msg: "openclaw_read_workflow_logs_not_configured",
      workflowId: input.workflowId,
    });
    return { workflowId: input.workflowId, executions: [] };
  }

  const limit = Math.max(1, Math.min(50, input.limit ?? 10));
  const url = `${baseUrl.replace(/\/+$/, "")}/api/v1/executions?workflowId=${encodeURIComponent(input.workflowId)}&limit=${limit}`;

  const res = await fetch(url, {
    headers: { "X-N8N-API-KEY": apiKey, Accept: "application/json" },
  });
  if (!res.ok) {
    throw new Error(`n8n API returned ${res.status}: ${await res.text()}`);
  }
  const body = (await res.json()) as {
    data?: Array<{
      id: string;
      finished: boolean;
      mode: string;
      startedAt: string | null;
      stoppedAt: string | null;
      status?: string | null;
    }>;
  };

  return {
    workflowId: input.workflowId,
    executions: (body.data ?? []).map((e) => ({
      id: e.id,
      finished: e.finished,
      mode: e.mode,
      startedAt: e.startedAt,
      stoppedAt: e.stoppedAt,
      status: e.status ?? null,
    })),
  };
}

// ─────────────────────────────────────────────────────────────────────────
// read_telegram_topic_history — Sergeant Ops supergroup topic
// ─────────────────────────────────────────────────────────────────────────

export interface ReadTelegramTopicHistoryInput {
  /** Назва топіка з REPORTING-MATRIX.md ('digest', 'incidents', etc). */
  topic: string;
  since?: string;
  limit?: number;
}

export interface ReadTelegramTopicHistoryOutput {
  topic: string;
  messages: Array<{
    messageId: number;
    text: string;
    sentAt: string;
  }>;
  /**
   * Phase 1 stub: Telegram Bot API не дає bulk-history-API без Premium
   * MTProto user account. Поки що повертаємо порожній список + note.
   * Phase 2 wires або (a) MTProto-user-bot, або (b) `tg_topic_archive`
   * таблицю, заповнювану Sergeant_alert_bot-ом on-message.
   */
  note?: string;
}

export async function readTelegramTopicHistory(
  input: ReadTelegramTopicHistoryInput,
): Promise<ReadTelegramTopicHistoryOutput> {
  // Phase 1: stub. Реалізація — Phase 2.
  return {
    topic: input.topic,
    messages: [],
    note: "read_telegram_topic_history is not yet wired in Phase 1; returns empty list. See ADR-0031 §11 (re-evaluation triggers).",
  };
}

// ─────────────────────────────────────────────────────────────────────────
// get_stripe_metrics — billing summary (ported from agents/ops.ts)
// ─────────────────────────────────────────────────────────────────────────
//
// ADR-0032: ports legacy Sergeant Console (ADR-0027) ops/marketing tools
// into OpenClaw, behind the same `/api/internal/openclaw/*` boundary so
// allowlist + audit guarantees still apply. Tools fail-soft when their
// upstream secrets are missing (returning a `not_configured: true` flag),
// the same way `read_workflow_logs` does for n8n.

export interface GetStripeMetricsInput {
  /** Lookback window in days. Default 7, max 90. */
  days?: number;
}

export interface GetStripeMetricsOutput {
  notConfigured?: boolean;
  windowDays?: number;
  successfulCount?: number;
  failedCount?: number;
  grossAmountUah?: number;
  note?: string;
}

export async function getStripeMetrics(
  input: GetStripeMetricsInput,
): Promise<GetStripeMetricsOutput> {
  const stripeKey = process.env.STRIPE_SECRET_KEY;
  if (!stripeKey) {
    return {
      notConfigured: true,
      note: "STRIPE_SECRET_KEY is not configured on the server.",
    };
  }
  const days = Math.max(1, Math.min(90, input.days ?? 7));
  const since = Math.floor(Date.now() / 1000) - days * 86_400;

  const res = await fetch(
    `https://api.stripe.com/v1/charges?created[gte]=${since}&limit=100`,
    { headers: { Authorization: `Bearer ${stripeKey}` } },
  );
  const data = (await res.json().catch(() => ({}))) as {
    data?: Array<{ amount: number; paid: boolean }>;
  };
  const charges = data.data ?? [];
  const successful = charges.filter((c) => c.paid);
  const failed = charges.filter((c) => !c.paid);
  const grossAmountUah = successful.reduce((sum, c) => sum + c.amount, 0) / 100;

  return {
    windowDays: days,
    successfulCount: successful.length,
    failedCount: failed.length,
    grossAmountUah,
  };
}

// ─────────────────────────────────────────────────────────────────────────
// get_sentry_issues — open Sentry issues by severity (ported from agents/ops.ts)
// ─────────────────────────────────────────────────────────────────────────

export type SentryLevel = "fatal" | "error" | "warning";

export interface GetSentryIssuesInput {
  level?: SentryLevel;
  limit?: number;
}

export interface SentryIssueRecord {
  title: string;
  level: string;
  count: string;
  permalink: string;
}

export interface GetSentryIssuesOutput {
  notConfigured?: boolean;
  issues?: SentryIssueRecord[];
  note?: string;
}

export async function getSentryIssues(
  input: GetSentryIssuesInput,
): Promise<GetSentryIssuesOutput> {
  const token = process.env.SENTRY_AUTH_TOKEN;
  const org = process.env.SENTRY_ORG ?? "sergeant";
  if (!token) {
    return {
      notConfigured: true,
      note: "SENTRY_AUTH_TOKEN is not configured on the server.",
    };
  }
  const level: SentryLevel = input.level ?? "error";
  const limit = Math.max(1, Math.min(50, input.limit ?? 10));

  const res = await fetch(
    `https://sentry.io/api/0/organizations/${org}/issues/?query=is:unresolved+level:${level}&limit=${limit}`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  const body = (await res.json().catch(() => null)) as
    | SentryIssueRecord[]
    | { detail?: string }
    | null;

  if (!Array.isArray(body)) {
    return {
      issues: [],
      note: `Sentry API returned ${res.status}${
        body && "detail" in body ? `: ${body.detail}` : ""
      }`,
    };
  }
  return {
    issues: body.map((i) => ({
      title: i.title,
      level: i.level,
      count: i.count,
      permalink: i.permalink,
    })),
  };
}

// ─────────────────────────────────────────────────────────────────────────
// get_server_stats — proxy /healthz (ported from agents/ops.ts)
// ─────────────────────────────────────────────────────────────────────────

export interface GetServerStatsOutput {
  source: "/healthz";
  status: number;
  body: unknown;
}

/**
 * Proxies a `GET /healthz` against the same server process. Used by
 * OpenClaw for "is the platform alive right now?" answers.
 *
 * Why hit our own process via HTTP instead of inlining health checks:
 *   - `/healthz` already aggregates DB / Redis / queue depth in one place
 *     and is exercised by Railway's health probe; reusing it keeps the
 *     answer consistent with what infra sees.
 *   - Future Phase 2 may move `/healthz` to a sidecar or shard — keeping
 *     the OpenClaw call HTTP-shaped lets that migration happen without
 *     touching tool code.
 */
export async function getServerStats(): Promise<GetServerStatsOutput> {
  const port = process.env.PORT ?? "3000";
  const baseUrl = process.env.SERVER_INTERNAL_URL ?? `http://localhost:${port}`;
  const res = await fetch(`${baseUrl.replace(/\/+$/, "")}/healthz`, {
    headers: { Accept: "application/json" },
  });
  const body: unknown = await res.json().catch(() => null);
  return { source: "/healthz", status: res.status, body };
}

// ─────────────────────────────────────────────────────────────────────────
// get_posthog_stats — analytics summary (ported from agents/marketing.ts)
// ─────────────────────────────────────────────────────────────────────────

export interface GetPostHogStatsInput {
  /** Lookback window in days. Default 7. */
  days?: number;
}

export interface GetPostHogStatsOutput {
  notConfigured?: boolean;
  body?: unknown;
  note?: string;
}

export async function getPostHogStats(
  input: GetPostHogStatsInput,
): Promise<GetPostHogStatsOutput> {
  const apiKey = process.env.POSTHOG_API_KEY;
  const projectId = process.env.POSTHOG_PROJECT_ID;
  if (!apiKey || !projectId) {
    return {
      notConfigured: true,
      note: "POSTHOG_API_KEY or POSTHOG_PROJECT_ID is not configured.",
    };
  }
  const days = Math.max(1, Math.min(180, input.days ?? 7));
  const url =
    `https://app.posthog.com/api/projects/${projectId}/insights/trend/` +
    `?events=[{"id":"$pageview"}]&date_from=-${days}d`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${apiKey}` },
  });
  const body: unknown = await res.json().catch(() => null);
  return { body };
}

// ─────────────────────────────────────────────────────────────────────────
// get_github_releases — recent merged releases (ported from agents/marketing.ts)
// ─────────────────────────────────────────────────────────────────────────

export interface GetGithubReleasesInput {
  /** Number of releases. Default 5, max 20. */
  limit?: number;
  /** owner/repo. Defaults to env.OPENCLAW_GITHUB_REPO. */
  repo?: string;
}

export interface GetGithubReleasesOutput {
  releases: Array<{
    tagName: string;
    name: string;
    publishedAt: string | null;
    bodyExcerpt: string;
  }>;
  note?: string;
}

export async function getGithubReleases(
  input: GetGithubReleasesInput,
): Promise<GetGithubReleasesOutput> {
  const limit = Math.max(1, Math.min(20, input.limit ?? 5));
  const repo = input.repo ?? env.OPENCLAW_GITHUB_REPO;
  // GitHub allows unauthenticated access for public repo releases (60 RPH);
  // PAT bumps the rate to 5000 RPH and is required for private repos.
  const token = env.OPENCLAW_GITHUB_PAT;

  const res = await fetch(
    `https://api.github.com/repos/${repo}/releases?per_page=${limit}`,
    {
      headers: {
        Accept: "application/vnd.github+json",
        "User-Agent": "OpenClaw-Bot",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
    },
  );
  const body = (await res.json().catch(() => null)) as
    | Array<{
        name: string | null;
        tag_name: string;
        published_at: string | null;
        body: string | null;
      }>
    | { message?: string }
    | null;

  if (!Array.isArray(body)) {
    return {
      releases: [],
      note: `GitHub API returned ${res.status}${
        body && "message" in body ? `: ${body.message}` : ""
      }`,
    };
  }
  return {
    releases: body.map((r) => ({
      tagName: r.tag_name,
      name: r.name ?? r.tag_name,
      publishedAt: r.published_at,
      bodyExcerpt: (r.body ?? "").slice(0, 500),
    })),
  };
}

// ─────────────────────────────────────────────────────────────────────────
// record_decision — Postgres INSERT + GitHub PR (best-effort)
// ─────────────────────────────────────────────────────────────────────────

import {
  insertDecision,
  attachDecisionPrUrl,
  type RecordDecisionInput,
} from "./store.js";

export interface RecordDecisionResult {
  decisionId: number;
  prUrl: string | null;
  prError?: string;
}

/**
 * INSERT у `openclaw_decisions` + open PR (best-effort). Якщо GitHub PAT
 * не задано — `prUrl=null` і `prError` пояснює причину. Caller-у
 * (audit-trail у `openclaw_invocations`) показує deferred-state і founder
 * може повторити вручну у Phase 2.
 *
 * Slug для filename:
 *   `<YYYY-MM-DD>-<slug-from-topic>.md`
 * де slug — lowercase + non-alnum → `-` + truncate-ується до 50 chars.
 */
export async function recordDecision(
  pool: Pool,
  input: RecordDecisionInput,
): Promise<RecordDecisionResult> {
  const decisionId = await insertDecision(pool, input);

  const token = env.OPENCLAW_GITHUB_PAT;
  if (!token) {
    return {
      decisionId,
      prUrl: null,
      prError: "OPENCLAW_GITHUB_PAT not configured; PR not opened",
    };
  }

  try {
    const prUrl = await openDecisionPr(token, {
      decisionId,
      topic: input.topic,
      context: input.context,
      decision: input.decision,
      rationale: input.rationale,
      alternatives: input.alternatives,
    });
    await attachDecisionPrUrl(pool, decisionId, prUrl);
    return { decisionId, prUrl };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    logger.warn({
      msg: "openclaw_record_decision_pr_failed",
      decisionId,
      error: message,
    });
    return { decisionId, prUrl: null, prError: message };
  }
}

function decisionSlug(topic: string): string {
  return (
    topic
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 50) || "decision"
  );
}

function decisionMarkdown(input: {
  decisionId: number;
  topic: string;
  context: string;
  decision: string;
  rationale: string;
  alternatives?: string;
}): string {
  const date = new Date().toISOString().slice(0, 10);
  return [
    `# ${input.topic}`,
    "",
    `**Date:** ${date}`,
    `**Decision ID (Postgres):** ${input.decisionId}`,
    `**Recorded by:** OpenClaw (ADR-0031)`,
    "",
    `## Context`,
    "",
    input.context,
    "",
    `## Decision`,
    "",
    input.decision,
    "",
    `## Rationale`,
    "",
    input.rationale,
    "",
    ...(input.alternatives
      ? ["## Alternatives considered", "", input.alternatives, ""]
      : []),
  ].join("\n");
}

async function openDecisionPr(
  token: string,
  input: {
    decisionId: number;
    topic: string;
    context: string;
    decision: string;
    rationale: string;
    alternatives?: string;
  },
): Promise<string> {
  const repo = env.OPENCLAW_GITHUB_REPO;
  const baseBranch = env.OPENCLAW_GITHUB_BASE_BRANCH;
  const date = new Date().toISOString().slice(0, 10);
  const slug = decisionSlug(input.topic);
  const branch = `openclaw/decision-${input.decisionId}-${slug}`;
  const filePath = `docs/decisions/${date}-${slug}.md`;
  const markdown = decisionMarkdown(input);

  const headers = {
    Authorization: `Bearer ${token}`,
    Accept: "application/vnd.github+json",
    "Content-Type": "application/json",
    "X-GitHub-Api-Version": "2022-11-28",
    "User-Agent": "OpenClaw-Bot",
  };

  // 1) Get base SHA.
  const refRes = await fetch(
    `https://api.github.com/repos/${repo}/git/ref/heads/${baseBranch}`,
    { headers },
  );
  if (!refRes.ok) {
    throw new Error(`Failed to read base ref: HTTP ${refRes.status}`);
  }
  const refBody = (await refRes.json()) as { object?: { sha: string } };
  const baseSha = refBody.object?.sha;
  if (!baseSha) throw new Error("Base ref has no sha");

  // 2) Create branch.
  const createRefRes = await fetch(
    `https://api.github.com/repos/${repo}/git/refs`,
    {
      method: "POST",
      headers,
      body: JSON.stringify({ ref: `refs/heads/${branch}`, sha: baseSha }),
    },
  );
  if (!createRefRes.ok && createRefRes.status !== 422) {
    throw new Error(`Failed to create branch: HTTP ${createRefRes.status}`);
  }

  // 3) Create file on branch (Contents API). Якщо існує — не перезаписуємо
  // (PUT з sha вимагав би GET спочатку; для нового decision-у file точно
  // ще не існує бо filename має decisionId).
  const putRes = await fetch(
    `https://api.github.com/repos/${repo}/contents/${encodeURI(filePath)}`,
    {
      method: "PUT",
      headers,
      body: JSON.stringify({
        message: `chore(openclaw): record decision #${input.decisionId} — ${input.topic}`,
        content: Buffer.from(markdown, "utf-8").toString("base64"),
        branch,
      }),
    },
  );
  if (!putRes.ok) {
    throw new Error(`Failed to create file: HTTP ${putRes.status}`);
  }

  // 4) Open PR.
  const prRes = await fetch(`https://api.github.com/repos/${repo}/pulls`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      title: `chore(openclaw): decision #${input.decisionId} — ${input.topic}`,
      head: branch,
      base: baseBranch,
      body: [
        markdown,
        "",
        "---",
        "",
        `_PR opened automatically by OpenClaw. Postgres row: \`openclaw_decisions.id=${input.decisionId}\`._`,
        `_Per ADR-0031 §3, OpenClaw never auto-merges; founder reviews and merges._`,
      ].join("\n"),
      maintainer_can_modify: true,
    }),
  });
  if (!prRes.ok) {
    throw new Error(`Failed to open PR: HTTP ${prRes.status}`);
  }
  const prBody = (await prRes.json()) as { html_url?: string };
  if (!prBody.html_url) throw new Error("PR response missing html_url");
  return prBody.html_url;
}
