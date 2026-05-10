/**
 * `@sergeant/openclaw-plugin` entry point.
 *
 * Phase 1 (PR-C1a) scope:
 *   - 12 read tools (1 from PoC + 11 new HTTP-proxy tools)
 *   - 1 write tool (create_github_issue) from PoC
 *   - 3 hooks: llm_input (budget gate), agent_turn_start, agent_turn_end (audit)
 *   - 1 hook: tool_call_pre (write-tool approval gate from PoC)
 *   - 1 hook: tool_call_post (write-audit from PoC)
 *
 * Default export — `definePluginEntry((api, raw) => ...)`. OpenClaw runtime
 * викликає його з actual SDK API + JSON config string.
 *
 * Усі залежності injectаються через `createOpenClawPlugin(api, configJson)`,
 * що дозволяє інтеграційний тест прокрутити плагін без OpenClaw runtime.
 */

import { parsePluginConfig, type PluginConfig } from "./config.js";
import { OpenClawHttpClient } from "./http-client.js";
import { createBudgetGate } from "./budget.js";
import {
  InvocationCorrelator,
  createAgentTurnStartHook,
  createAgentTurnEndHook,
} from "./audit.js";
import { createRecallMemoryTool } from "./tools/recall-memory.js";
import { createReadStrategyDocsTool } from "./tools/read-strategy-docs.js";
import { createQueryAppDbTool } from "./tools/query-app-db.js";
import { createReadGithubTool } from "./tools/read-github.js";
import { createGetStripeMetricsTool } from "./tools/get-stripe-metrics.js";
import { createGetSentryIssuesTool } from "./tools/get-sentry-issues.js";
import { createGetPostHogStatsTool } from "./tools/get-posthog-stats.js";
import { createReadWorkflowLogsTool } from "./tools/read-workflow-logs.js";
import { createGetServerStatsTool } from "./tools/get-server-stats.js";
import { createGetGithubReleasesTool } from "./tools/get-github-releases.js";
import { createReadTelegramTopicTool } from "./tools/read-telegram-topic.js";
import { createRecordDecisionTool } from "./tools/record-decision.js";
import { createGithubSearchTool } from "./tools/github-search.js";
import { createGithubTreeTool } from "./tools/github-tree.js";
import { createGithubDiffTool } from "./tools/github-diff.js";
import { createGithubPrsTool } from "./tools/github-prs.js";
import { createSeoGscQueryTool } from "./tools/seo-gsc-query.js";
import { createSeoPsiAuditTool } from "./tools/seo-psi-audit.js";
import { createSeoSerpLookupTool } from "./tools/seo-serp-lookup.js";
import { createSetReminderTool } from "./tools/set-reminder.js";
import { createCreateGithubIssueTool } from "./write-tools/create-github-issue.js";
import { definePluginEntry, type Plugin, type PluginApi } from "./sdk-types.js";

export interface CreatePluginOptions {
  /** Optional fetch override for tests / OpenTelemetry instrumentation. */
  fetchImpl?: typeof globalThis.fetch;
}

/**
 * Pure-function factory: інжектиться у тестах. Створює plugin instance,
 * register-ить tools і hooks. Не виконує жодних мережевих викликів —
 * перший HTTP-call станеться при першому tool/hook trigger-і.
 */
export function createOpenClawPlugin(
  api: PluginApi,
  configJson: string,
  options: CreatePluginOptions = {},
): Plugin {
  const config: PluginConfig = parsePluginConfig(configJson);

  const http = new OpenClawHttpClient({
    baseUrl: config.serverInternalUrl,
    apiKey: config.internalApiKey,
    ...(options.fetchImpl ? { fetchImpl: options.fetchImpl } : {}),
  });

  const correlator = new InvocationCorrelator();
  const log = api.services.runtime.log;

  // ─── Hooks ───────────────────────────────────────────────────────────
  api.registerHook(
    "llm_input",
    createBudgetGate({
      http,
      founderUserId: config.founderUserId,
      perCallCapUsd: config.maxPerCallUsd,
      log,
    }),
  );

  api.registerHook(
    "agent_turn_start",
    createAgentTurnStartHook({
      http,
      founderUserId: config.founderUserId,
      correlator,
      log,
    }),
  );

  api.registerHook(
    "agent_turn_end",
    createAgentTurnEndHook({
      http,
      founderUserId: config.founderUserId,
      correlator,
      log,
    }),
  );

  // ─── Read tools ─────────────────────────────────────────────────────
  api.registerTool(
    createRecallMemoryTool({
      http,
      founderUserId: config.founderUserId,
    }),
  );

  api.registerTool(createReadStrategyDocsTool({ http }));
  api.registerTool(createQueryAppDbTool({ http }));
  api.registerTool(createReadGithubTool({ http }));
  api.registerTool(createGetStripeMetricsTool({ http }));
  api.registerTool(createGetSentryIssuesTool({ http }));
  api.registerTool(createGetPostHogStatsTool({ http }));
  api.registerTool(createReadWorkflowLogsTool({ http }));
  api.registerTool(createGetServerStatsTool({ http }));
  api.registerTool(createGetGithubReleasesTool({ http }));
  api.registerTool(createReadTelegramTopicTool({ http }));
  api.registerTool(
    createRecordDecisionTool({ http, founderUserId: config.founderUserId }),
  );

  // ─── PR-C1b: code-understanding tools ────────────────────────────────
  api.registerTool(createGithubSearchTool({ http }));
  api.registerTool(createGithubTreeTool({ http }));
  api.registerTool(createGithubDiffTool({ http }));
  api.registerTool(createGithubPrsTool({ http }));

  // ─── PR-C1b: SEO env-stub tools (graceful not_configured) ───────────────
  api.registerTool(createSeoGscQueryTool({ http }));
  api.registerTool(createSeoPsiAuditTool({ http }));
  api.registerTool(createSeoSerpLookupTool({ http }));

  // ─── PR-C1b: set_reminder (write tool, no approval gate — see plan) ──────
  api.registerTool(
    createSetReminderTool({ http, founderUserId: config.founderUserId }),
  );

  // ─── Write tool (Phase 0.5 PoC chosen variant) ──────────────────────
  const writeParts = createCreateGithubIssueTool({
    http,
    founderUserId: config.founderUserId,
    variant: config.approvalVariant,
    messaging: api.services.messaging,
    approvalCallbackTimeoutMs: config.approvalCallbackTimeoutMs,
    log,
  });
  api.registerTool(writeParts.tool);
  if (writeParts.toolCallPreHook) {
    api.registerHook("tool_call_pre", writeParts.toolCallPreHook);
  }
  api.registerHook("tool_call_post", writeParts.toolCallPostHook);

  return {
    name: "@sergeant/openclaw-plugin",
    dispose: () => {
      correlator.clear();
    },
  };
}

/**
 * Default plugin entry — what OpenClaw runtime expects from the
 * `index.ts` default export. Wraps `createOpenClawPlugin` без додаткової
 * логіки. Реальний SDK додасть type-checks через `definePluginEntry`.
 */
export default definePluginEntry((api, raw) => createOpenClawPlugin(api, raw));

// Public surface for type consumers (tests, future Phase 1 plugin code).
export {
  parsePluginConfig,
  PluginConfigSchema,
  type PluginConfig,
} from "./config.js";
export {
  OpenClawHttpClient,
  OpenClawHttpError,
  type HttpClientOptions,
} from "./http-client.js";
export {
  createBudgetGate,
  type BudgetCheckRequest,
  type BudgetCheckResponse,
} from "./budget.js";
export {
  InvocationCorrelator,
  createAgentTurnStartHook,
  createAgentTurnEndHook,
} from "./audit.js";
export {
  createRecallMemoryTool,
  RecallMemoryParamsSchema,
  type RecallMemoryParams,
} from "./tools/recall-memory.js";
export {
  createReadStrategyDocsTool,
  ReadStrategyDocsParamsSchema,
  type ReadStrategyDocsParams,
} from "./tools/read-strategy-docs.js";
export {
  createQueryAppDbTool,
  QueryAppDbParamsSchema,
  type QueryAppDbParams,
} from "./tools/query-app-db.js";
export {
  createReadGithubTool,
  ReadGithubParamsSchema,
  type ReadGithubParams,
} from "./tools/read-github.js";
export {
  createGetStripeMetricsTool,
  GetStripeMetricsParamsSchema,
  type GetStripeMetricsParams,
} from "./tools/get-stripe-metrics.js";
export {
  createGetSentryIssuesTool,
  GetSentryIssuesParamsSchema,
  type GetSentryIssuesParams,
} from "./tools/get-sentry-issues.js";
export {
  createGetPostHogStatsTool,
  GetPostHogStatsParamsSchema,
  type GetPostHogStatsParams,
} from "./tools/get-posthog-stats.js";
export {
  createReadWorkflowLogsTool,
  ReadWorkflowLogsParamsSchema,
  type ReadWorkflowLogsParams,
} from "./tools/read-workflow-logs.js";
export {
  createGetServerStatsTool,
  GetServerStatsParamsSchema,
  type GetServerStatsParams,
} from "./tools/get-server-stats.js";
export {
  createGetGithubReleasesTool,
  GetGithubReleasesParamsSchema,
  type GetGithubReleasesParams,
} from "./tools/get-github-releases.js";
export {
  createReadTelegramTopicTool,
  ReadTelegramTopicParamsSchema,
  type ReadTelegramTopicParams,
} from "./tools/read-telegram-topic.js";
export {
  createRecordDecisionTool,
  RecordDecisionParamsSchema,
  type RecordDecisionParams,
} from "./tools/record-decision.js";
export {
  createGithubSearchTool,
  GithubSearchParamsSchema,
  type GithubSearchParams,
} from "./tools/github-search.js";
export {
  createGithubTreeTool,
  GithubTreeParamsSchema,
  type GithubTreeParams,
} from "./tools/github-tree.js";
export {
  createGithubDiffTool,
  GithubDiffParamsSchema,
  type GithubDiffParams,
} from "./tools/github-diff.js";
export {
  createGithubPrsTool,
  GithubPrsParamsSchema,
  type GithubPrsParams,
} from "./tools/github-prs.js";
export {
  createSeoGscQueryTool,
  SeoGscQueryParamsSchema,
  type SeoGscQueryParams,
} from "./tools/seo-gsc-query.js";
export {
  createSeoPsiAuditTool,
  SeoPsiAuditParamsSchema,
  type SeoPsiAuditParams,
} from "./tools/seo-psi-audit.js";
export {
  createSeoSerpLookupTool,
  SeoSerpLookupParamsSchema,
  type SeoSerpLookupParams,
} from "./tools/seo-serp-lookup.js";
export {
  createSetReminderTool,
  SetReminderParamsSchema,
  type SetReminderParams,
} from "./tools/set-reminder.js";
export {
  createCreateGithubIssueTool,
  CreateGithubIssueParamsSchema,
  type CreateGithubIssueParams,
} from "./write-tools/create-github-issue.js";
export {
  type ApprovalVariant,
  type ApprovalDecision,
  shouldRunCustomApprovalGate,
  shouldUseNativeRequiresConfirmation,
  renderApprovalPrompt,
  decodeApprovalCallback,
  buildApprovalKeyboard,
} from "./write-tools/approval-variants.js";
export type {
  Plugin,
  PluginApi,
  PluginEntry,
  ToolDefinition,
  ToolResult,
  HookHandler,
  HookContext,
  HookName,
  HookResult,
} from "./sdk-types.js";
