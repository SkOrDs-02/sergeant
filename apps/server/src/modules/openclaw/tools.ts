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
