/**
 * Спільні типи для OpenClaw v0 модуля (ADR-0031). Поділ на module-level
 * file щоб уникнути circular import-ів між `store.ts` (DB), `tools.ts`
 * (server-side helpers), `prompts.ts` (system prompt assembly) і HTTP-route
 * у `routes/internal/openclaw.ts`.
 */

/** Trigger, що викликав OpenClaw. */
export type OpenClawTrigger =
  | "dm"
  | "morning_ritual"
  | "weekly_review"
  | "monthly_okr";

/** Кінцевий status invocation-у. Усі fail-closed states присутні явно. */
export type OpenClawStatus =
  | "success"
  | "error"
  | "budget_exceeded"
  | "iteration_cap"
  | "allowlist_fail"
  | "dm_only_violation";

/** Tone-mode для system prompt-у (heuristic селектор у `prompts.ts`). */
export type OpenClawToneMode = "diplomatic" | "direct";

/** Broadcast-policy з env-у (`OPENCLAW_BROADCAST_MODE`). */
export type OpenClawBroadcastMode = "dm" | "digest" | "all";

/**
 * Один tool-call всередині invocation-у. Зберігається у JSONB-array
 * `openclaw_invocations.tool_calls`.
 */
export interface OpenClawToolCall {
  /** Назва tool-а (`recall_memory`, `read_strategy_docs`, etc). */
  tool: string;
  /** Сирий вхід tool-у (для debug-у). */
  input: Record<string, unknown>;
  /**
   * Розмір output-у (символи). Окремо від `output_preview` щоб audit-log
   * не роздувався тисячами символів recall-results-у.
   */
  output_chars: number;
  /**
   * Перші ~500 символів output-у — для quick scan у audit UI без full DB
   * dump-у.
   */
  output_preview: string;
  /** Чи tool execute-нувся успішно. */
  status: "ok" | "error";
  /** Лікарня-readable error message якщо `status='error'`. */
  error?: string;
  /** Скільки ms витратив tool. */
  duration_ms: number;
}

/**
 * Запис у `openclaw_decisions` (мапаmapping 1:1 на колонки).
 */
export interface OpenClawDecisionRecord {
  id: number;
  decided_at: string;
  founder_user_id: string;
  topic: string;
  context: string;
  decision: string;
  rationale: string;
  alternatives: string | null;
  git_pr_url: string | null;
  invocation_id: number | null;
  metadata: Record<string, unknown>;
}

/**
 * Запис у `openclaw_invocations` (мапа 1:1 на колонки).
 */
export interface OpenClawInvocationRecord {
  id: number;
  invoked_at: string;
  founder_user_id: string;
  founder_tg_user_id: number;
  trigger: OpenClawTrigger;
  user_message: string;
  assistant_response: string | null;
  tool_calls: OpenClawToolCall[];
  cost_usd: number;
  duration_ms: number;
  iterations: number;
  status: OpenClawStatus;
  error_message: string | null;
  tone_mode: OpenClawToneMode | null;
  metadata: Record<string, unknown>;
}

/**
 * Lifecycle action for a write-tool approval (ADR-0037, Phase 4.5).
 *
 * - `approved` — founder clicked Approve, BEFORE the upstream HTTP call.
 * - `executed` — same `approval_id`, AFTER the HTTP call (with
 *   `http_status`/`ok`/`response_excerpt`).
 * - `rejected` — founder clicked Reject. Single row, no `executed`
 *   follow-up.
 */
export type OpenClawWriteAuditAction = "approved" | "executed" | "rejected";

/**
 * Запис у `openclaw_write_audit` (мапа 1:1 на колонки). ADR-0037, Phase
 * 4.5. Append-only — кожен transition створює нову row; повний lifecycle
 * одного approval-id reconstructed через `WHERE approval_id = $1
 * ORDER BY recorded_at`.
 */
export interface OpenClawWriteAuditRecord {
  id: number;
  recorded_at: string;
  approval_id: string;
  tool: string;
  founder_user_id: string;
  founder_tg_user_id: number;
  invocation_id: number | null;
  action: OpenClawWriteAuditAction;
  input: Record<string, unknown>;
  http_status: number | null;
  ok: boolean | null;
  response_excerpt: string | null;
  persona: string | null;
  metadata: Record<string, unknown>;
}

/**
 * Дозволені таблиці у `query_app_db`. Хардкод — ні в якому разі
 * не env-driven, бо кожне додавання повинно бути reviewed у PR.
 *
 * Усі таблиці тут МАЮТЬ існувати у поточній схемі (див. `apps/server/src/
 * migrations/`). Allowlist-рекорди для ще-не-створених таблиць призводять
 * до 5xx у `query_app_db` (LLM формує SELECT за allowlist-ом → Postgres
 * → `relation "X" does not exist` → asyncHandler → Sentry fatal).
 *
 * Раніше тут були `subscriptions` і `payments` — це aspirational stubs
 * для майбутнього Stripe billing-модуля. Жодна міграція їх не створювала
 * (в схемі лише `push_subscriptions`), тож вони генерували Sentry-noise
 * на проді. Повертати лише разом із міграцією, що CREATE TABLE-ить їх.
 *
 * Друга чистка: `digest_runs` і `nutrition_entries` теж stubs без
 * відповідної міграції; `n8n_errors`, `mono_transactions`, `routines` —
 * назви, які не збігаються з реальними таблицями (`n8n_failure_events`,
 * `mono_transaction`, `routine_entries`/`routine_streaks`). LLM-pre-fill
 * SQL валив прод 5xx-ом → asyncHandler → Sentry fatal. Кожен запис нижче
 * посилається на migration-файл, де таблицю створено.
 *
 * Forbidden: auth_*, ai_usage_daily, ai_memories, sync_op_log,
 * sync_audit_log, anything containing PII у raw form.
 */
export const QUERY_APP_DB_TABLE_ALLOWLIST = new Set<string>([
  // 003_baseline_schema.sql створює таблицю `"user"` (quoted, singular,
  // зарезервоване слово). У прод-міграціях `users` не існує — додати
  // лише разом із VIEW або міграцією-перейменування.
  "users",
  // 015_n8n_failure_events.sql — dead-letter log від n8n global error WF.
  "n8n_failure_events",
  // 026_routine_tables.sql — habits/routines модуль.
  "routine_entries",
  "routine_streaks",
  // 008_mono_integration.sql — Monobank transactions (singular, без 's').
  "mono_transaction",
  // 028_openclaw.sql — OpenClaw audit-trail.
  "openclaw_decisions",
  "openclaw_invocations",
  // 030_openclaw_write_audit.sql — approval/write-tool audit trail.
  "openclaw_write_audit",
  // 031_tg_alert_acks.sql, ADR-0038 (Wave 3 §3.2): accountability trail
  // for Sergeant_alert_bot broadcasts. Allows OpenClaw to answer ad-hoc
  // questions like "TTA distribution last 7 days" or "P0 alerts unacked
  // > 30 min" without a dedicated endpoint per query.
  "tg_alert_acks",
]);

/**
 * Дозволені root-paths для `read_strategy_docs`. Обмежує на read-doc
 * директорії; ніколи не виходить за docs/. Реальний path-resolve у
 * `tools.ts` робиться через `path.resolve` + prefix-check, щоб
 * `../../etc/passwd` traversal не пройшов.
 */
export const READ_STRATEGY_DOCS_ALLOWED_PATHS = [
  "docs/strategy/",
  "docs/launch/",
  "docs/adr/",
  "docs/decisions/",
  "docs/integrations/",
  "docs/governance/",
] as const;
