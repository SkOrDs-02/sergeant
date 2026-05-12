/**
 * Public exports OpenClaw модуля. Caller-и (HTTP routes / тести) імпортують
 * звідси, щоб не залежати від внутрішньої структури файлів.
 */

export * from "./types.js";
export {
  openInvocation,
  finalizeInvocation,
  getDailyCostUsd,
  insertDecision,
  attachDecisionPrUrl,
  listRecentDecisions,
  listRecentInvocations,
  // Phase 4.5 (ADR-0037): write-audit log helpers.
  recordWriteAudit,
  listRecentWriteAudits,
} from "./store.js";
export type { RecordWriteAuditInput, ListWriteAuditFilters } from "./store.js";
export { checkDailyBudget, estimateClaudeSonnetCostUsd } from "./budget.js";
export {
  recallCofounderMemory,
  readStrategyDoc,
  queryAppDb,
  readGithub,
  readWorkflowLogs,
  readTelegramTopicHistory,
  recordDecision,
  extractSqlTables,
  OpenClawAllowlistError,
  OpenClawSchemaError,
  OpenClawNotFoundError,
  // ADR-0032: tools ported from Sergeant Console agents (ops + marketing)
  // into OpenClaw. They go through the same `/api/internal/openclaw/*`
  // surface so allowlist + audit semantics still apply.
  getStripeMetrics,
  getSentryIssues,
  getServerStats,
  getPostHogStats,
  getGithubReleases,
} from "./tools.js";
export { selectToneMode, buildSystemPrompt } from "./prompts.js";

// Stage 4c (PR-Stage4c): Layer 1 cheap-router classifier (Haiku JSON).
// Lives next to the read-tools so write-audit, budget і classify ділять
// один module-namespace.
export {
  classifyMessage,
  parseClassification,
  DEFAULT_CHEAP_ROUTER_SYSTEM_PROMPT,
  CHEAP_ROUTER_CLASSES,
} from "./classify.js";
export type {
  CheapRouterClass,
  CheapRouterClassification,
  ClassifyMessageArgs,
} from "./classify.js";

// Phase 1 (PR-C1c): n8n delegation surface + refresh_business_snapshot.
export {
  listN8nWorkflows,
  describeN8nWorkflow,
  triggerN8nWorkflow,
  activateN8nWorkflow,
  refreshBusinessSnapshot,
  loadN8nAllowlist,
  N8nAllowlistError,
  __resetN8nAllowlistCacheForTests,
  __setN8nAllowlistForTests,
} from "./n8n.js";
export type {
  N8nTier,
  N8nAllowlist,
  N8nAllowlistEntry,
  ListN8nWorkflowsInput,
  ListN8nWorkflowsOutput,
  ListN8nWorkflowsRow,
  DescribeN8nWorkflowInput,
  DescribeN8nWorkflowOutput,
  TriggerN8nWorkflowInput,
  TriggerN8nWorkflowOutput,
  TriggerN8nWorkflowStatus,
  ActivateN8nWorkflowInput,
  ActivateN8nWorkflowOutput,
  ActivateN8nWorkflowStatus,
  RefreshBusinessSnapshotInput,
  RefreshBusinessSnapshotOutput,
  RefreshBusinessSnapshotResult,
} from "./n8n.js";

// Phase 4 (ADR-0036): write-tools (approval-gated on console side).
export {
  commitToStrategyDoc,
  createGithubIssue,
  postToTopic,
  pauseWorkflow,
  muteSentryAlert,
  assertStrategyDocPath,
  OpenClawWriteAllowlistError,
  OPENCLAW_WRITE_TOOL_NAMES,
  COMMIT_STRATEGY_DOC_ALLOWED_PREFIX,
  POST_TO_TOPIC_ALLOWLIST,
} from "./write-tools.js";
export type {
  CommitStrategyDocInput,
  CommitStrategyDocOutput,
  CreateGithubIssueInput,
  CreateGithubIssueOutput,
  PostToTopicInput,
  PostToTopicOutput,
  PauseWorkflowInput,
  PauseWorkflowOutput,
  MuteAlertInput,
  MuteAlertOutput,
} from "./write-tools.js";

// PR-C1b: code-understanding read tools (github_search/tree/diff/prs).
export {
  githubSearch,
  githubTree,
  githubDiff,
  githubPrs,
} from "./code-tools.js";
export type {
  GithubSearchInput,
  GithubSearchScope,
  GithubTreeInput,
  GithubDiffInput,
  GithubPrsInput,
} from "./code-tools.js";

// PR-C1b: SEO env-stub tools with graceful fallback.
export {
  seoGscQuery,
  seoPsiAudit,
  seoSerpLookup,
  isNotConfigured,
} from "./seo-tools.js";
export type {
  SeoGscQueryInput,
  SeoGscQueryOutput,
  GscDimension,
  SeoGscRow,
  SeoPsiAuditInput,
  SeoPsiAuditOutput,
  PsiStrategy,
  SeoSerpLookupInput,
  SeoSerpLookupOutput,
  SeoSerpResult,
} from "./seo-tools.js";

// PR-C1b: reminder store + state transitions.
export {
  setReminder,
  listDueReminders,
  claimDueReminders,
  markReminderSent,
  markReminderFailed,
  markReminderCancelled,
  listFounderReminders,
  ReminderValidationError,
} from "./reminders.js";
export type {
  ReminderRecord,
  ReminderStatus,
  ReminderChannel,
  SetReminderInput,
  ListDueOptions,
  ListFounderRemindersOptions,
} from "./reminders.js";
