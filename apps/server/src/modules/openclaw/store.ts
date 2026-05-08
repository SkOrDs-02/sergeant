/**
 * DB-операції для OpenClaw v0 (ADR-0031).
 *
 * Усі функції — pure helpers навколо `pg.Pool`. Жодного caching, жодних
 * singletons. Caller приносить свій `Pool` (DI-friendly + тестується).
 *
 * Чому `pool: Pool` а не `query: Querier`: invocation lifecycle —
 * INSERT-update флоу (open → finalize → optionally update_decision_pr_url).
 * Транзакції тут не потрібні: кожен запис атомарний на рівні row-у, і ми
 * не бачимо консистентного стану-між-row-ами, який вимагав би atomicity.
 */

import type { Pool } from "pg";
import type {
  OpenClawDecisionRecord,
  OpenClawInvocationRecord,
  OpenClawStatus,
  OpenClawToneMode,
  OpenClawToolCall,
  OpenClawTrigger,
  OpenClawWriteAuditAction,
  OpenClawWriteAuditRecord,
} from "./types.js";

// ─────────────────────────────────────────────────────────────────────────
// Invocations
// ─────────────────────────────────────────────────────────────────────────

export interface OpenInvocationInput {
  founderUserId: string;
  founderTgUserId: number;
  trigger: OpenClawTrigger;
  userMessage: string;
  metadata?: Record<string, unknown> | undefined;
}

/**
 * Створює row у `openclaw_invocations` зі status='success' і нульовими
 * cost/duration. Caller потім викликає `finalizeInvocation` коли agent loop
 * заверш-ує. Якщо caller fail-closed-нув ще до AI-call-у (allowlist /
 * dm_only / budget), він викликає `finalizeInvocation` з відповідним
 * status-ом і assistant_response=null.
 *
 * Повертає id новоствореної row-и.
 */
export async function openInvocation(
  pool: Pool,
  input: OpenInvocationInput,
): Promise<number> {
  const result = await pool.query<{ id: string }>(
    `INSERT INTO openclaw_invocations (
       founder_user_id, founder_tg_user_id, trigger, user_message, metadata
     )
     VALUES ($1, $2, $3, $4, $5::jsonb)
     RETURNING id`,
    [
      input.founderUserId,
      input.founderTgUserId,
      input.trigger,
      input.userMessage,
      JSON.stringify(input.metadata ?? {}),
    ],
  );
  // BIGINT → string у pg-driver default; coerce-ять до number для зручного
  // використання у app-коді. Hard-rule #1 (BIGINT serialization safety):
  // у Phase 1 у нас точно <2^53 invocations.
  const row = result.rows[0];
  if (!row) throw new Error("openInvocation: INSERT RETURNING returned no rows");
  return Number(row.id);
}

export interface FinalizeInvocationInput {
  invocationId: number;
  status: OpenClawStatus;
  assistantResponse?: string | null | undefined;
  toolCalls?: OpenClawToolCall[] | undefined;
  costUsd?: number | undefined;
  durationMs?: number | undefined;
  iterations?: number | undefined;
  errorMessage?: string | null | undefined;
  toneMode?: OpenClawToneMode | null | undefined;
  metadataPatch?: Record<string, unknown> | undefined;
}

/**
 * Фіналізує invocation: оновлює status, assistant_response, tool_calls,
 * cost_usd, duration_ms, iterations, error_message, tone_mode.
 *
 * Якщо `metadataPatch` заданий — мерджить його у поточний metadata через
 * `jsonb || $patch` (override-ить overlapping ключі).
 */
export async function finalizeInvocation(
  pool: Pool,
  input: FinalizeInvocationInput,
): Promise<void> {
  await pool.query(
    `UPDATE openclaw_invocations
       SET status              = $2,
           assistant_response  = $3,
           tool_calls          = $4::jsonb,
           cost_usd            = $5,
           duration_ms         = $6,
           iterations          = $7,
           error_message       = $8,
           tone_mode           = $9,
           metadata            = metadata || $10::jsonb
     WHERE id = $1`,
    [
      input.invocationId,
      input.status,
      input.assistantResponse ?? null,
      JSON.stringify(input.toolCalls ?? []),
      input.costUsd ?? 0,
      input.durationMs ?? 0,
      input.iterations ?? 0,
      input.errorMessage ?? null,
      input.toneMode ?? null,
      JSON.stringify(input.metadataPatch ?? {}),
    ],
  );
}

/**
 * Сума cost_usd за календарний день у TZ founder-а. Використовується
 * pre-call check-ом у `budget.ts`.
 *
 * `tzOffsetIso`: рядок типу `"Europe/Kyiv"` — передаємо в SQL як
 * `AT TIME ZONE`. Якщо TZ невалідний — Postgres кидає error;
 * caller responsible за санітизацію (env-зчитанням default-у).
 */
export async function getDailyCostUsd(
  pool: Pool,
  founderUserId: string,
  tzName: string,
): Promise<number> {
  const result = await pool.query<{ total: string }>(
    `SELECT COALESCE(SUM(cost_usd), 0)::text AS total
       FROM openclaw_invocations
      WHERE founder_user_id = $1
        AND (invoked_at AT TIME ZONE $2)::date
            = (NOW() AT TIME ZONE $2)::date`,
    [founderUserId, tzName],
  );
  // NUMERIC(10,4) → string default у pg-driver; parseFloat безпечний бо
  // dollars-amount, не банківські копійки.
  return parseFloat(result.rows[0]?.total ?? "0");
}

// ─────────────────────────────────────────────────────────────────────────
// Decisions
// ─────────────────────────────────────────────────────────────────────────

export interface RecordDecisionInput {
  founderUserId: string;
  topic: string;
  context: string;
  decision: string;
  rationale: string;
  alternatives?: string | undefined;
  invocationId?: number | undefined;
  metadata?: Record<string, unknown> | undefined;
}

/**
 * Створює row у `openclaw_decisions`. PR-у з markdown-ом ще немає —
 * `git_pr_url` лишається NULL і пізніше оновлюється `attachDecisionPrUrl`
 * (caller відкриває PR через GitHub API асинхронно).
 *
 * Чому INSERT тут одразу, не чекаючи PR: GitHub API може лагати; ми
 * хочемо щоб founder-а уже бачив "так, твоє рішення зафіксовано" одразу
 * після reply-я бота. Async-flow: insert → reply → open PR → update url.
 */
export async function insertDecision(
  pool: Pool,
  input: RecordDecisionInput,
): Promise<number> {
  const result = await pool.query<{ id: string }>(
    `INSERT INTO openclaw_decisions (
       founder_user_id, topic, context, decision, rationale,
       alternatives, invocation_id, metadata
     )
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb)
     RETURNING id`,
    [
      input.founderUserId,
      input.topic,
      input.context,
      input.decision,
      input.rationale,
      input.alternatives ?? null,
      input.invocationId ?? null,
      JSON.stringify(input.metadata ?? {}),
    ],
  );
  const decisionRow = result.rows[0];
  if (!decisionRow)
    throw new Error("insertDecision: INSERT RETURNING returned no rows");
  return Number(decisionRow.id);
}

/**
 * Оновлює `git_pr_url` для decision-row-у (після того, як GitHub API
 * успішно створив PR). NULL-update дозволено (для retry-flow-у).
 */
export async function attachDecisionPrUrl(
  pool: Pool,
  decisionId: number,
  prUrl: string | null,
): Promise<void> {
  await pool.query(
    `UPDATE openclaw_decisions SET git_pr_url = $2 WHERE id = $1`,
    [decisionId, prUrl],
  );
}

/**
 * Останні N decisions для founder-а (для recall у дайджестах і UI). Не
 * exposed через `query_app_db` — це окремий tool-shape, бо у `query_app_db`
 * SQL-input приймається в raw-вигляді (для ad-hoc query) — а тут ми хочемо
 * ergonomic shape без LLM-generated SQL.
 */
export async function listRecentDecisions(
  pool: Pool,
  founderUserId: string,
  limit: number,
): Promise<OpenClawDecisionRecord[]> {
  const result = await pool.query(
    `SELECT id, decided_at, founder_user_id, topic, context, decision,
            rationale, alternatives, git_pr_url, invocation_id, metadata
       FROM openclaw_decisions
      WHERE founder_user_id = $1
      ORDER BY decided_at DESC
      LIMIT $2`,
    [founderUserId, Math.max(1, Math.min(50, limit))],
  );
  return result.rows.map((r) => ({
    id: Number(r.id),
    decided_at:
      r.decided_at instanceof Date ? r.decided_at.toISOString() : r.decided_at,
    // founder_user_id у БД — TEXT (Better Auth user.id), а не BIGINT, тому
    // не coerce-имо до Number; eslint heuristic-rule no-bigint-string
    // false-positive-нить на ім'я з '_id'.

    founder_user_id: String(r.founder_user_id),
    topic: r.topic,
    context: r.context,
    decision: r.decision,
    rationale: r.rationale,
    alternatives: r.alternatives,
    git_pr_url: r.git_pr_url,
    invocation_id: r.invocation_id ? Number(r.invocation_id) : null,
    metadata: r.metadata ?? {},
  }));
}

/**
 * Останні invocations (для observability). Без assistant_response /
 * tool_calls — компактний overview-row.
 */
export async function listRecentInvocations(
  pool: Pool,
  founderUserId: string,
  limit: number,
): Promise<
  Array<
    Pick<
      OpenClawInvocationRecord,
      | "id"
      | "invoked_at"
      | "trigger"
      | "user_message"
      | "status"
      | "cost_usd"
      | "duration_ms"
      | "iterations"
      | "tone_mode"
    >
  >
> {
  const result = await pool.query(
    `SELECT id, invoked_at, trigger, user_message, status, cost_usd,
            duration_ms, iterations, tone_mode
       FROM openclaw_invocations
      WHERE founder_user_id = $1
      ORDER BY invoked_at DESC
      LIMIT $2`,
    [founderUserId, Math.max(1, Math.min(100, limit))],
  );
  return result.rows.map((r) => ({
    id: Number(r.id),
    invoked_at:
      r.invoked_at instanceof Date ? r.invoked_at.toISOString() : r.invoked_at,
    trigger: r.trigger as OpenClawTrigger,
    user_message: r.user_message,
    status: r.status as OpenClawStatus,
    cost_usd: parseFloat(r.cost_usd?.toString?.() ?? "0"),
    duration_ms: Number(r.duration_ms ?? 0),
    iterations: Number(r.iterations ?? 0),
    tone_mode: r.tone_mode,
  }));
}

// ─────────────────────────────────────────────────────────────────────────
// Write-audit (ADR-0037, Phase 4.5)
// ─────────────────────────────────────────────────────────────────────────

/** Server-side cap для `response_excerpt` — захищає від випадкового pushing
 *  гіганських response-body-ів (e.g. failed Sentry HTML error page) у БД. */
const RESPONSE_EXCERPT_MAX_BYTES = 4_096;

export interface RecordWriteAuditInput {
  approvalId: string;
  tool: string;
  founderUserId: string;
  founderTgUserId: number;
  invocationId?: number | null | undefined;
  action: OpenClawWriteAuditAction;
  input?: Record<string, unknown> | undefined;
  /** Populated for `executed` rows; ignored for `approved`/`rejected`. */
  httpStatus?: number | null | undefined;
  /** Populated for `executed` rows. */
  ok?: boolean | null | undefined;
  /** Populated for `executed` rows. Truncated to `RESPONSE_EXCERPT_MAX_BYTES`. */
  responseExcerpt?: string | null | undefined;
  /** Persona that emitted the write-tool call. */
  persona?: string | null | undefined;
  metadata?: Record<string, unknown> | undefined;
}

/**
 * INSERT-ить одну row у `openclaw_write_audit` (append-only за дизайном).
 * Caller — `tools/console` callback handler через
 * `POST /api/internal/openclaw/write-audit/log` endpoint.
 *
 * Чому без UPDATE-flow-у: lifecycle reconstructed by reading rows за
 * `approval_id` + `recorded_at`. Mutable row втратив би `approved_at` як
 * standalone-event і ускладнив би concurrent-write-и (rejected double-click,
 * race-у `markExecuted`/`markRejected` у in-memory store).
 *
 * Повертає id новоствореної row-и (BIGSERIAL → coerced to number per
 * AGENTS hard-rule #1).
 */
export async function recordWriteAudit(
  pool: Pool,
  input: RecordWriteAuditInput,
): Promise<number> {
  const responseExcerpt =
    input.responseExcerpt == null
      ? null
      : input.responseExcerpt.length > RESPONSE_EXCERPT_MAX_BYTES
        ? input.responseExcerpt.slice(0, RESPONSE_EXCERPT_MAX_BYTES)
        : input.responseExcerpt;

  const result = await pool.query<{ id: string }>(
    `INSERT INTO openclaw_write_audit (
       approval_id, tool, founder_user_id, founder_tg_user_id,
       invocation_id, action, input, http_status, ok,
       response_excerpt, persona, metadata
     )
     VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8, $9, $10, $11, $12::jsonb)
     RETURNING id`,
    [
      input.approvalId,
      input.tool,
      input.founderUserId,
      input.founderTgUserId,
      input.invocationId ?? null,
      input.action,
      JSON.stringify(input.input ?? {}),
      input.httpStatus ?? null,
      input.ok ?? null,
      responseExcerpt,
      input.persona ?? null,
      JSON.stringify(input.metadata ?? {}),
    ],
  );
  const auditRow = result.rows[0];
  if (!auditRow)
    throw new Error("recordWriteAudit: INSERT RETURNING returned no rows");
  return Number(auditRow.id);
}

export interface ListWriteAuditFilters {
  founderUserId: string;
  limit?: number | undefined;
  /** Filter by tool name (e.g. `pause_workflow`). */
  tool?: string | undefined;
  /** Filter by lifecycle action. */
  action?: OpenClawWriteAuditAction | undefined;
  /** Filter by persona that emitted the call. */
  persona?: string | undefined;
  /**
   * Lower-bound on `recorded_at` (inclusive). Drives the `/audit since=<dur>`
   * time-window query — the console parses `since=24h` / `7d` / `30m` into
   * a wall-clock cutoff and forwards it as ISO. Inclusive `>=` so a row
   * recorded exactly at the cutoff is still returned.
   */
  recordedAfter?: Date | undefined;
}

/**
 * Останні N write-audit row-ів для founder-а (newest-first), з опційними
 * фільтрами. Використовується `/audit` slash-командою у DM. Не exposed
 * через `query_app_db` — це ergonomic shape, не raw-SQL.
 */
export async function listRecentWriteAudits(
  pool: Pool,
  filters: ListWriteAuditFilters,
): Promise<OpenClawWriteAuditRecord[]> {
  const conditions: string[] = ["founder_user_id = $1"];
  const params: unknown[] = [filters.founderUserId];

  if (filters.tool) {
    params.push(filters.tool);
    conditions.push(`tool = $${params.length}`);
  }
  if (filters.action) {
    params.push(filters.action);
    conditions.push(`action = $${params.length}`);
  }
  if (filters.persona) {
    params.push(filters.persona);
    conditions.push(`persona = $${params.length}`);
  }
  if (filters.recordedAfter) {
    params.push(filters.recordedAfter);
    conditions.push(`recorded_at >= $${params.length}`);
  }

  const limit = Math.max(1, Math.min(100, filters.limit ?? 20));
  params.push(limit);

  // WHERE conjuncts assembled from allowlisted typed filter keys
  // (`approvalId`, `tool`, `founderUserId`, `recordedAfter`, `limit`); each
  // value is a `$N` placeholder bound via `params`. Same baseline pattern
  // documented in eslint.config.js M11 audit comments.
  // eslint-disable-next-line no-restricted-syntax
  const result = await pool.query(
    `SELECT id, recorded_at, approval_id, tool, founder_user_id,
            founder_tg_user_id, invocation_id, action, input,
            http_status, ok, response_excerpt, persona, metadata
       FROM openclaw_write_audit
      WHERE ${conditions.join(" AND ")}
      ORDER BY recorded_at DESC
      LIMIT $${params.length}`,
    params,
  );

  return result.rows.map((r) => ({
    id: Number(r.id),
    recorded_at:
      r.recorded_at instanceof Date
        ? r.recorded_at.toISOString()
        : r.recorded_at,
    approval_id: String(r.approval_id),
    tool: String(r.tool),
    founder_user_id: String(r.founder_user_id),
    founder_tg_user_id: Number(r.founder_tg_user_id),
    invocation_id: r.invocation_id == null ? null : Number(r.invocation_id),
    action: r.action as OpenClawWriteAuditAction,
    input: (r.input as Record<string, unknown>) ?? {},
    http_status: r.http_status == null ? null : Number(r.http_status),
    ok: r.ok == null ? null : Boolean(r.ok),
    response_excerpt: r.response_excerpt ?? null,
    persona: r.persona ?? null,
    metadata: (r.metadata as Record<string, unknown>) ?? {},
  }));
}
