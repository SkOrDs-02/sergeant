/**
 * `@sergeant/openclaw-plugin` entry point.
 *
 * Phase 0.5 PoC scope:
 *   - 1 read tool (recall_memory)
 *   - 1 write tool (create_github_issue) — обкатує A/B/C approval variants
 *   - 1 hook llm_input (budget gate)
 *   - 1 hook agent_turn_start + 1 hook agent_turn_end (audit)
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

  // ─── Read tool ───────────────────────────────────────────────────────
  api.registerTool(
    createRecallMemoryTool({
      http,
      founderUserId: config.founderUserId,
    }),
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
