/**
 * `@sergeant/openclaw-plugin` entry point.
 *
 * Phase 1 scope (PR-C1a + PR-C1d):
 *   - 12 read tools (1 from PoC + 11 new HTTP-proxy tools)
 *   - 1 write tool (create_github_issue) from PoC
 *   - Layer 0 shortcut router (17 shortcuts, $0 cost)
 *   - Layer 1 cheap router (Haiku classifier, ~$0.0002)
 *   - 3 hooks: llm_input (budget + routing), agent_turn_start, agent_turn_end
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
import {
  InvocationCorrelator,
  createAgentTurnStartHook,
  createAgentTurnEndHook,
} from "./audit.js";
import { createRoutingHook, type RoutingHookOptions } from "./routing-hook.js";
import type { ToolResult } from "./sdk-types.js";
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
import { createCreateGithubIssueTool } from "./write-tools/create-github-issue.js";
import { definePluginEntry, type Plugin, type PluginApi } from "./sdk-types.js";

export interface CreatePluginOptions {
  /** Optional fetch override for tests / OpenTelemetry instrumentation. */
  fetchImpl?: typeof globalThis.fetch;
  /** Optional LLM classifier override for Layer 1 cheap router (tests). */
  classifyImpl?: RoutingHookOptions["classify"];
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

  // ─── Tool registry (for shortcut router dispatching) ─────────────────
  const toolRegistry = new Map<
    string,
    (params: Record<string, unknown>) => Promise<ToolResult>
  >();

  /** Tool executor that dispatches to the internal registry. */
  const executeTool = async (
    toolName: string,
    params: Record<string, unknown>,
  ): Promise<ToolResult> => {
    const executor = toolRegistry.get(toolName);
    if (!executor) {
      return {
        content: [
          { type: "text", text: `(tool "${toolName}" not registered)` },
        ],
      };
    }
    return executor(params);
  };

  // ─── Default LLM classifier (Haiku) ─────────────────────────────────
  const defaultClassify: RoutingHookOptions["classify"] = async (
    systemPrompt,
    userMessage,
  ) => {
    const response = await http.post<{ text: string; costUsd?: number }>(
      "/classify",
      { systemPrompt, userMessage, model: "claude-3-5-haiku-latest" },
    );
    return { text: response.text, costUsd: response.costUsd ?? 0.0002 };
  };

  // ─── Hooks ───────────────────────────────────────────────────────────
  const { hook: routingHook } = createRoutingHook({
    http,
    founderUserId: config.founderUserId,
    perCallCapUsd: config.maxPerCallUsd,
    classify: options.classifyImpl ?? defaultClassify,
    executeTool,
    log,
  });

  api.registerHook("llm_input", routingHook);

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
  // Helper: register tool in both SDK API and internal registry.
  const registerToolWithRegistry = <TParams>(
    tool: import("./sdk-types.js").ToolDefinition<TParams>,
  ) => {
    api.registerTool(tool);
    toolRegistry.set(tool.name, (params) =>
      tool.execute("shortcut-dispatch", params as TParams),
    );
  };

  registerToolWithRegistry(
    createRecallMemoryTool({
      http,
      founderUserId: config.founderUserId,
    }),
  );

  registerToolWithRegistry(createReadStrategyDocsTool({ http }));
  registerToolWithRegistry(createQueryAppDbTool({ http }));
  registerToolWithRegistry(createReadGithubTool({ http }));
  registerToolWithRegistry(createGetStripeMetricsTool({ http }));
  registerToolWithRegistry(createGetSentryIssuesTool({ http }));
  registerToolWithRegistry(createGetPostHogStatsTool({ http }));
  registerToolWithRegistry(createReadWorkflowLogsTool({ http }));
  registerToolWithRegistry(createGetServerStatsTool({ http }));
  registerToolWithRegistry(createGetGithubReleasesTool({ http }));
  registerToolWithRegistry(createReadTelegramTopicTool({ http }));
  registerToolWithRegistry(
    createRecordDecisionTool({ http, founderUserId: config.founderUserId }),
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
export {
  ShortcutRouter,
  extractText,
  type ShortcutDefinition,
  type ShortcutMatchResult,
  type ToolExecutor,
} from "./shortcut-router.js";
export {
  CheapRouter,
  CheapRouterClassSchema,
  CheapRouterResponseSchema,
  CHEAP_ROUTER_SYSTEM_PROMPT,
  routineToShortcutSlug,
  isLayer2Escalation,
  isChatResponse,
  type CheapRouterClass,
  type CheapRouterResponse,
  type CheapRouterResult,
  type LlmClassifier,
} from "./cheap-router.js";
export {
  createRoutingHook,
  isRoutedResponse,
  extractRoutedResponse,
  ROUTED_RESPONSE_PREFIX,
  ESCALATE_PREFIX,
} from "./routing-hook.js";
export { ALL_SHORTCUTS } from "./shortcuts/index.js";
export { renderTemplate } from "./canned-templates/index.js";
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
