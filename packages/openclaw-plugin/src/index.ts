/**
 * `@sergeant/openclaw-plugin` entry point.
 *
 * Phase 1 + Phase 4 scope (PR-C1a…C1d + PR-D):
 *   - 24 read tools (12 C1a + 8 C1b + 5 C1c from n8n delegation)
 *   - 5 write tools (create_github_issue + commit_to_strategy_doc +
 *     post_to_topic + pause_workflow + mute_alert) — Variant B approval
 *   - Layer 0 shortcut router (17 shortcuts, $0 cost)
 *   - Layer 1 cheap router (Haiku classifier, ~$0.0002)
 *   - 3 hooks: llm_input (budget + routing), agent_turn_start, agent_turn_end
 *   - N tool_call_pre hooks (Variant B write-tool approval gates)
 *   - N tool_call_post hooks (write-audit + n8n Tier C gate)
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

import * as fs from "fs";
import { parsePluginConfig, type PluginConfig } from "./config.js";
import { OpenClawHttpClient } from "./http-client.js";
import {
  InvocationCorrelator,
  createAgentTurnStartHook,
  createAgentTurnEndHook,
} from "./audit.js";
import { createRoutingHook, type RoutingHookOptions } from "./routing-hook.js";
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
import { createGithubSearchTool } from "./tools/github-search.js";
import { createGithubTreeTool } from "./tools/github-tree.js";
import { createGithubDiffTool } from "./tools/github-diff.js";
import { createGithubPrsTool } from "./tools/github-prs.js";
import { createSeoGscQueryTool } from "./tools/seo-gsc-query.js";
import { createSeoPsiAuditTool } from "./tools/seo-psi-audit.js";
import { createSeoSerpLookupTool } from "./tools/seo-serp-lookup.js";
import { createSetReminderTool } from "./tools/set-reminder.js";
import { createCreateGithubIssueTool } from "./write-tools/create-github-issue.js";
import { createCommitToStrategyDocTool } from "./write-tools/commit-to-strategy-doc.js";
import { createPostToTopicTool } from "./write-tools/post-to-topic.js";
import { createPauseWorkflowTool } from "./write-tools/pause-workflow.js";
import { createMuteAlertTool } from "./write-tools/mute-alert.js";
import {
  createHttpAuditSink,
  type WriteToolFactoryOptions,
} from "./write-tools/write-tool-factory.js";
import { createN8nTierCPostHook } from "./write-tools/n8n-tier-c-gate.js";
import {
  definePluginEntry,
  type MessagingService,
  type Plugin,
  type PluginApi,
  type RuntimeService,
  type ToolResult,
} from "./sdk-types.js";

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
  // Prefer real openclaw 5.7 api.logger; fall back to legacy services.runtime.log
  // (test stubs) or console if neither is present.
  const log: RuntimeService["log"] =
    api.services?.runtime?.log ??
    ((level, msg, fields?) => {
      const fn =
        api.logger?.[level as keyof NonNullable<PluginApi["logger"]>];
      if (typeof fn === "function") fn(msg, fields ?? undefined);
      else
        (
          console[
            level === "error"
              ? "error"
              : level === "warn"
                ? "warn"
                : "debug"
          ] as (...args: unknown[]) => void
        )(`[sergeant] ${msg}`, fields ?? "");
    });

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

  // ─── Cheap-router system prompt (optional external file) ─────────────
  const cheapRouterSystemPrompt = config.cheapRouterSystemPromptPath
    ? fs.readFileSync(config.cheapRouterSystemPromptPath, "utf-8")
    : undefined;

  // ─── Hooks ───────────────────────────────────────────────────────────
  const { hook: routingHook } = createRoutingHook({
    http,
    founderUserId: config.founderUserId,
    perCallCapUsd: config.maxPerCallUsd,
    ...(cheapRouterSystemPrompt ? { cheapRouterSystemPrompt } : {}),
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

  // ─── n8n delegation surface (PR-C1c, tier-aware) ────────────────────
  registerToolWithRegistry(createN8nListTool({ http }));
  registerToolWithRegistry(createN8nDescribeTool({ http }));
  registerToolWithRegistry(createN8nTriggerTool({ http }));
  registerToolWithRegistry(createN8nActivateTool({ http }));
  registerToolWithRegistry(createRefreshBusinessSnapshotTool({ http }));

  // ─── PR-C1b: code-understanding tools ────────────────────────────────
  registerToolWithRegistry(createGithubSearchTool({ http }));
  registerToolWithRegistry(createGithubTreeTool({ http }));
  registerToolWithRegistry(createGithubDiffTool({ http }));
  registerToolWithRegistry(createGithubPrsTool({ http }));

  // ─── PR-C1b: SEO env-stub tools (graceful not_configured) ───────────────
  registerToolWithRegistry(createSeoGscQueryTool({ http }));
  registerToolWithRegistry(createSeoPsiAuditTool({ http }));
  registerToolWithRegistry(createSeoSerpLookupTool({ http }));

  // ─── PR-C1b: set_reminder (write tool, no approval gate — see plan) ──────
  registerToolWithRegistry(
    createSetReminderTool({ http, founderUserId: config.founderUserId }),
  );

  // ─── Write tools (Phase 0.5 PoC + PR-D Phase 4) ───────────────────
  //
  // Shared options for all Variant B write-tools: audit sink, messaging,
  // approval timeout.
  const auditSink = createHttpAuditSink(http, 0);
  // Real openclaw 5.7 runtime does not inject api.services.messaging — fall
  // back to a stub that logs the unavailability so write-tool approval flows
  // degrade gracefully instead of crashing the plugin at register time.
  const messaging: MessagingService = api.services?.messaging ?? {
    send: async (text) => {
      log("warn", "[messaging unavailable] " + text);
      return { messageId: "unavailable" };
    },
    waitForCallback: async () => {
      throw new Error("openclaw runtime did not inject messaging service");
    },
  };
  const writeOpts: WriteToolFactoryOptions = {
    http,
    founderUserId: config.founderUserId,
    variant: config.approvalVariant,
    messaging,
    approvalCallbackTimeoutMs: config.approvalCallbackTimeoutMs,
    auditSink,
    log,
  };

  // create_github_issue (PoC — keeps its own factory for backwards compat)
  const writeParts = createCreateGithubIssueTool({
    http,
    founderUserId: config.founderUserId,
    variant: config.approvalVariant,
    messaging,
    approvalCallbackTimeoutMs: config.approvalCallbackTimeoutMs,
    recordAudit: async (record) => {
      await auditSink({
        approvalId: record.invocationId,
        tool: record.toolName,
        founderUserId: config.founderUserId,
        invocationId: record.invocationId,
        action: record.decision.status === "approved" ? "approved" : "rejected",
        input: record.params,
        variant: record.variant,
      });
    },
    log,
  });
  api.registerTool(writeParts.tool);
  if (writeParts.toolCallPreHook) {
    api.registerHook("tool_call_pre", writeParts.toolCallPreHook);
  }
  api.registerHook("tool_call_post", writeParts.toolCallPostHook);

  // commit_to_strategy_doc (PR-D)
  const strategyDocParts = createCommitToStrategyDocTool(writeOpts);
  api.registerTool(strategyDocParts.tool);
  if (strategyDocParts.toolCallPreHook) {
    api.registerHook("tool_call_pre", strategyDocParts.toolCallPreHook);
  }
  api.registerHook("tool_call_post", strategyDocParts.toolCallPostHook);

  // post_to_topic (PR-D)
  const postToTopicParts = createPostToTopicTool(writeOpts);
  api.registerTool(postToTopicParts.tool);
  if (postToTopicParts.toolCallPreHook) {
    api.registerHook("tool_call_pre", postToTopicParts.toolCallPreHook);
  }
  api.registerHook("tool_call_post", postToTopicParts.toolCallPostHook);

  // pause_workflow (PR-D)
  const pauseWorkflowParts = createPauseWorkflowTool(writeOpts);
  api.registerTool(pauseWorkflowParts.tool);
  if (pauseWorkflowParts.toolCallPreHook) {
    api.registerHook("tool_call_pre", pauseWorkflowParts.toolCallPreHook);
  }
  api.registerHook("tool_call_post", pauseWorkflowParts.toolCallPostHook);

  // mute_alert (PR-D)
  const muteAlertParts = createMuteAlertTool(writeOpts);
  api.registerTool(muteAlertParts.tool);
  if (muteAlertParts.toolCallPreHook) {
    api.registerHook("tool_call_pre", muteAlertParts.toolCallPreHook);
  }
  api.registerHook("tool_call_post", muteAlertParts.toolCallPostHook);

  // ─── n8n Tier C audit gate (PR-D Phase 4) ────────────────────────────
  api.registerHook(
    "tool_call_post",
    createN8nTierCPostHook({
      founderUserId: config.founderUserId,
      auditSink,
      log,
    }),
  );

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
  COUNCIL_DEFAULT_SEQUENCE,
  COUNCIL_SYNTHESIS_PERSONA,
  COUNCIL_SYNTHESIS_STEP_LABEL,
  createCouncilBudgetGate,
  type CouncilPersona,
  type CouncilBudgetResponse,
  type CouncilGateOutcome,
  type CouncilBudgetGateOptions,
} from "./council.js";
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
  createCommitToStrategyDocTool,
  CommitToStrategyDocParamsSchema,
  type CommitToStrategyDocParams,
} from "./write-tools/commit-to-strategy-doc.js";
export {
  createPostToTopicTool,
  PostToTopicParamsSchema,
  type PostToTopicParams,
} from "./write-tools/post-to-topic.js";
export {
  createPauseWorkflowTool,
  PauseWorkflowParamsSchema,
  type PauseWorkflowParams,
} from "./write-tools/pause-workflow.js";
export {
  createMuteAlertTool,
  MuteAlertParamsSchema,
  type MuteAlertParams,
} from "./write-tools/mute-alert.js";
export {
  createWriteTool,
  createHttpAuditSink,
  type WriteToolSpec,
  type WriteToolFactoryOptions,
  type WriteToolParts,
  type WriteAuditRecord,
  type WriteAuditSink,
} from "./write-tools/write-tool-factory.js";
export {
  createN8nTierCPostHook,
  isApprovalRequiredResult,
} from "./write-tools/n8n-tier-c-gate.js";
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
