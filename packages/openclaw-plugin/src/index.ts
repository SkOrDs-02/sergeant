/**
 * `@sergeant/openclaw-plugin` entry point.
 *
 * Phase 1 scope (PR-C1a + PR-C1c):
 *   - 15 read/list tools (1 PoC + 11 PR-C1a + n8n_list / n8n_describe /
 *     n8n_trigger / n8n_activate / refresh_business_snapshot from PR-C1c)
 *   - 1 write tool (create_github_issue) from PoC
 *   - 3 hooks: llm_input (budget gate), agent_turn_start, agent_turn_end (audit)
 *   - 1 hook: tool_call_pre (write-tool approval gate from PoC)
 *   - 1 hook: tool_call_post (write-audit from PoC)
 *
 * Note: n8n_trigger / n8n_activate / refresh_business_snapshot delegate
 * to the server, which enforces the 4-tier allowlist from
 * `ops/openclaw/n8n-allowlist.json`. Tier C approval gating runs through
 * the orchestrator's `tool_call_pre` hook (wired in PR-C1d) using the
 * `approvalRequired` flag surfaced in each server response.
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
import { createN8nListTool } from "./tools/n8n-list.js";
import { createN8nDescribeTool } from "./tools/n8n-describe.js";
import { createN8nTriggerTool } from "./tools/n8n-trigger.js";
import { createN8nActivateTool } from "./tools/n8n-activate.js";
import { createRefreshBusinessSnapshotTool } from "./tools/refresh-business-snapshot.js";
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

  // ─── n8n delegation surface (PR-C1c, tier-aware) ────────────────────
  api.registerTool(createN8nListTool({ http }));
  api.registerTool(createN8nDescribeTool({ http }));
  api.registerTool(createN8nTriggerTool({ http }));
  api.registerTool(createN8nActivateTool({ http }));
  api.registerTool(createRefreshBusinessSnapshotTool({ http }));

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
  createN8nListTool,
  N8nListParamsSchema,
  N8N_TIER_VALUES,
  type N8nListParams,
  type N8nTier,
} from "./tools/n8n-list.js";
export {
  createN8nDescribeTool,
  N8nDescribeParamsSchema,
  type N8nDescribeParams,
} from "./tools/n8n-describe.js";
export {
  createN8nTriggerTool,
  N8nTriggerParamsSchema,
  type N8nTriggerParams,
} from "./tools/n8n-trigger.js";
export {
  createN8nActivateTool,
  N8nActivateParamsSchema,
  type N8nActivateParams,
} from "./tools/n8n-activate.js";
export {
  createRefreshBusinessSnapshotTool,
  RefreshBusinessSnapshotParamsSchema,
  type RefreshBusinessSnapshotParams,
} from "./tools/refresh-business-snapshot.js";
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
