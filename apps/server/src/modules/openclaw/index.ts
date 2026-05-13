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

// `/ai_cost` slash-command aggregator — PR continuation of #2567 (PR-12)
// and #2590 (PR-13). DB-side rollup + in-process Prom snapshot.
export {
  buildAiCostSummary,
  fetchAnthropicCostsForRange,
  fetchTopEndpointsFromProm,
  fetchVoyageCumulativeFromProm,
  kyivDayKey,
  kyivWeekStart,
  kyivMonthStart,
  kyivMonthEnd,
  kyivDaysInMonth,
} from "./aiCostSummary.js";
export type {
  AiCostSummary,
  BudgetSnapshot,
  BuildAiCostSummaryInput,
  EndpointCostRow,
  ModelCostBreakdown,
  PeriodCostSummary,
  VoyageSnapshot,
} from "./aiCostSummary.js";
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

// T2 audit #3 — repo allowlist for OpenClaw GitHub-touching tools.
export {
  assertOpenClawRepoAllowed,
  __resetOpenClawRepoAllowlistForTests,
  __getOpenClawRepoAllowlistForTests,
} from "./repoAllowlist.js";
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

// PR-26: morning briefing template + orchestrator (no LLM).
export {
  buildMorningBriefing,
  assembleMorningBriefing,
} from "./briefing/index.js";

// O3 (Phase 2.B): Friday weekly review template + orchestrator.
export {
  buildWeeklyReview,
  assembleWeeklyReview,
} from "./weekly-review/index.js";
export type {
  AssembleWeeklyReviewInput,
  AssembleWeeklyReviewOptions,
  WeeklyReviewData,
  WeeklyReviewResponse,
} from "./weekly-review/index.js";

// O3 (Phase 2.B): Monthly OKR review.
export {
  buildMonthlyOkrReview,
  assembleMonthlyOkrReview,
  INTERIM_OKRS,
  krProgressPct,
} from "./monthly-okr/index.js";
export type {
  AssembleMonthlyOkrInput,
  AssembleMonthlyOkrOptions,
  KeyResult,
  MonthlyOkrData,
  MonthlyOkrResponse,
  Okr,
  OkrSource,
} from "./monthly-okr/index.js";

export type {
  AlertsBriefingSection,
  AssembleMorningBriefingInput,
  MorningBriefingData,
  MorningBriefingResponse,
  PrQueueBriefingSection,
  SignupsBriefingSection,
  StripeBriefingSection,
  WorkflowsBriefingSection,
} from "./briefing/index.js";

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

// PR /mute (Phase 5b): founder DM "do not disturb" mute-state.
export {
  setFounderMute,
  clearFounderMute,
  getFounderMute,
  isFounderMuted,
} from "./mute-state.js";
export type { MuteState, MuteCheckResult } from "./mute-state.js";

// PR /whois (debug): /openclaw whois <user_id|@username> aggregator.
export { lookupWhois } from "./whois.js";
export type {
  WhoisResult,
  WhoisInput,
  WhoisTelegramError,
  ToolUsageRow,
} from "./whois.js";
