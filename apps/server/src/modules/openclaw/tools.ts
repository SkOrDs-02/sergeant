/**
 * Server-side implementations OpenClaw tool-ів (ADR-0031 §5).
 *
 * Чому tool-implementations тут на сервері, а не у `tools/openclaw`:
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
 *
 * Цей файл — барель: реалізації рознесені по доменних модулях
 * (`tools-*.ts`), а імпорт-шлях `./tools.js` зберігається для всіх
 * споживачів через re-export.
 */

export {
  OpenClawAllowlistError,
  OpenClawSchemaError,
  OpenClawNotFoundError,
} from "./tools-errors.js";

export type { RecallMemoryInput, RecallMemoryOutput } from "./tools-memory.js";
export { recallCofounderMemory } from "./tools-memory.js";

export type {
  ReadStrategyDocsInput,
  ReadStrategyDocsOutput,
} from "./tools-strategy-docs.js";
export { readStrategyDoc } from "./tools-strategy-docs.js";

export type { QueryAppDbInput, QueryAppDbOutput } from "./tools-db-query.js";
export { extractSqlTables, queryAppDb } from "./tools-db-query.js";

export type { ReadGithubInput, ReadGithubOutput } from "./tools-github.js";
export { readGithub } from "./tools-github.js";

export type {
  ReadWorkflowLogsInput,
  ReadWorkflowLogsOutput,
} from "./tools-workflow-logs.js";
export { readWorkflowLogs } from "./tools-workflow-logs.js";

export type {
  ReadTelegramTopicHistoryInput,
  ReadTelegramTopicHistoryErrorCode,
  ReadTelegramTopicHistoryError,
  ReadTelegramTopicHistoryMessage,
  ReadTelegramTopicHistoryOutput,
  ReadTelegramTopicHistoryDeps,
} from "./tools-telegram-history.js";
export { readTelegramTopicHistory } from "./tools-telegram-history.js";

export type {
  GetStripeMetricsInput,
  GetStripeMetricsOutput,
  SentryLevel,
  GetSentryIssuesInput,
  SentryIssueRecord,
  GetSentryIssuesOutput,
  GetServerStatsOutput,
  GetPostHogStatsInput,
  GetPostHogStatsOutput,
  GetGithubReleasesInput,
  GetGithubReleasesOutput,
} from "./tools-external-metrics.js";
export {
  getStripeMetrics,
  getSentryIssues,
  getServerStats,
  getPostHogStats,
  getGithubReleases,
} from "./tools-external-metrics.js";

export type { RecordDecisionResult } from "./tools-decisions.js";
export { recordDecision } from "./tools-decisions.js";
