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
 * Дозволені таблиці у `query_app_db`. Хардкод — ні в якому разі
 * не env-driven, бо кожне додавання повинно бути reviewed у PR.
 *
 * Forbidden: auth_*, ai_usage_daily, ai_memories, sync_op_log,
 * sync_audit_log, anything containing PII у raw form.
 */
export const QUERY_APP_DB_TABLE_ALLOWLIST = new Set<string>([
  "subscriptions",
  "payments",
  "users",
  "digest_runs",
  "n8n_errors",
  "routines",
  "mono_transactions",
  "nutrition_entries",
  "openclaw_decisions",
  "openclaw_invocations",
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
