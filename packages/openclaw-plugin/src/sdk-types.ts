/**
 * Local type stubs for the (external) `@openclaw/plugin-sdk`. PR-B Phase 0.5
 * PoC does not depend on a real npm package — these types capture the
 * surface we *expect* the SDK to expose, based on the OpenClaw plugin spec
 * referenced in `docs/planning/openclaw-migration-plan.md`.
 *
 * When the real SDK ships, this file becomes a thin re-export:
 *
 *   export {
 *     definePluginEntry,
 *     type PluginApi,
 *     type ToolDefinition,
 *     type HookDefinition,
 *     ...
 *   } from "@openclaw/plugin-sdk";
 *
 * Until then, our PoC consumes this typed surface and our parity-харнес
 * exercises a stub `PluginApi` (see `parity/parity-runner.ts`).
 *
 * AI-CONTEXT: Phase 0.5 spike validates "що critical-path рішення дійсно
 * лягають на OpenClaw Plugin SDK" (plan §510). Якщо реальний SDK
 * розходиться з цим контрактом — PoC notes (`docs/notes/spikes/openclaw-poc.md`)
 * фіксують deltas + рекомендацію по shim-shape для Phase 1.
 */

import type { ZodTypeAny } from "zod";

// ─────────────────────────────────────────────────────────────────────────
// Tool surface
// ─────────────────────────────────────────────────────────────────────────

export interface ToolResultTextBlock {
  type: "text";
  text: string;
}

export interface ToolResultStructuredBlock {
  type: "structured";
  data: unknown;
}

export type ToolResultBlock = ToolResultTextBlock | ToolResultStructuredBlock;

export interface ToolResult {
  content: ToolResultBlock[];
  /**
   * Optional cost contribution for this single tool call, in USD. Used by
   * `agent_turn_end` hook to roll up invocation cost. Omit for free
   * (HTTP-only) tools — the hook will sum LLM-side cost separately.
   */
  costUsd?: number;
  /**
   * Optional flag used by approval flows (Variant A) to indicate the tool
   * was rejected by the user. Plugin code returns this so the agent loop
   * can reflect on the rejection. SDK is expected to surface this too.
   */
  rejected?: boolean;
}

export interface ToolDefinition<TParams = unknown> {
  name: string;
  description: string;
  /**
   * Zod schema describing tool parameters. SDK is expected to convert it
   * to JSON-Schema for the model. We use Zod (not direct JSON-Schema) so
   * the same schema doubles as runtime validator inside `execute`.
   */
  parameters: ZodTypeAny;
  /**
   * Marks tool as optional in the registry. Tools registered with
   * `optional: true` are NOT advertised to the model unless the agent's
   * `tools` allowlist explicitly includes them. Used for write-tools
   * (gated behind persona allowlist + approval).
   */
  optional?: boolean;
  /**
   * Approval Variant A (native gating). When `true`, the SDK suspends
   * `execute()` until the user confirms via the messaging channel
   * (inline keyboard on Telegram). PoC tries Variant A on
   * `create_github_issue`; final default is Variant B (custom hook) per
   * Locked decision #5.
   */
  requiresConfirmation?: boolean;
  /**
   * Tool entrypoint. Receives the invocation id (so the plugin can
   * correlate with `openclaw_invocations.id`) and the validated params.
   */
  execute: (invocationId: string, params: TParams) => Promise<ToolResult>;
}

// ─────────────────────────────────────────────────────────────────────────
// Hook surface
// ─────────────────────────────────────────────────────────────────────────

export type HookName =
  | "agent_turn_start"
  | "agent_turn_end"
  | "llm_input"
  | "llm_output"
  | "tool_call_pre"
  | "tool_call_post";

export interface HookContextBase {
  invocationId: string;
  agentRunId: string;
  founderUserId?: string;
}

export interface AgentTurnStartContext extends HookContextBase {
  trigger: "dm" | "morning_ritual" | "weekly_review" | "monthly_okr" | string;
  userMessage: string;
}

export interface AgentTurnEndContext extends HookContextBase {
  status:
    | "success"
    | "error"
    | "rejected"
    | "budget_exceeded"
    | "iteration_cap";
  costUsd: number;
  durationMs: number;
  iterations: number;
  /**
   * Final assistant response (may be NULL if turn failed before LLM
   * generated anything).
   */
  assistantResponse: string | null;
}

export interface LlmInputContext extends HookContextBase {
  /**
   * Estimated cost of the upcoming LLM call (input + max_output tokens
   * priced at the agent's model tier). Plugin uses this to gate against
   * `/budget`.
   */
  estimatedCostUsd: number;
  modelTier: "cheap" | "default" | "thinking";
}

export interface ToolCallPreContext extends HookContextBase {
  toolName: string;
  params: Record<string, unknown>;
}

export interface ToolCallPostContext extends HookContextBase {
  toolName: string;
  params: Record<string, unknown>;
  result: { ok: true; result: ToolResult } | { ok: false; error: string };
  durationMs: number;
}

/** Discriminated context type by hook name. */
export type HookContext<H extends HookName> = H extends "agent_turn_start"
  ? AgentTurnStartContext
  : H extends "agent_turn_end"
    ? AgentTurnEndContext
    : H extends "llm_input"
      ? LlmInputContext
      : H extends "tool_call_pre"
        ? ToolCallPreContext
        : H extends "tool_call_post"
          ? ToolCallPostContext
          : HookContextBase;

/**
 * Hook handler return shape. Hooks can:
 *   - allow the action: `{ ok: true }`
 *   - block the action: `{ ok: false, reason }`
 *   - mutate context (forwarded to subsequent hooks / runtime).
 */
export interface HookOk {
  ok: true;
}

export interface HookBlock {
  ok: false;
  /** Human-readable reason surfaced to the messaging channel. */
  reason: string;
  /**
   * Optional structured status for the runtime (mapped to
   * `openclaw_invocations.status`).
   */
  status?:
    | "budget_exceeded"
    | "iteration_cap"
    | "allowlist_fail"
    | "approval_rejected";
}

export type HookResult = HookOk | HookBlock;

export type HookHandler<H extends HookName> = (
  ctx: HookContext<H>,
) => Promise<HookResult>;

// ─────────────────────────────────────────────────────────────────────────
// Plugin API surface
// ─────────────────────────────────────────────────────────────────────────

export interface MessagingService {
  /**
   * Send a text message back to the user channel that triggered the
   * current invocation. Returns the message id (for inline-keyboard
   * callback correlation in Variant B approval flow).
   */
  send: (
    text: string,
    opts?: { replyMarkup?: unknown },
  ) => Promise<{ messageId: string }>;
  /**
   * Wait for the user to click a callback button (Variant B approval).
   * Resolves with the callback payload once received, or rejects on
   * timeout. PoC uses 5-minute timeout.
   */
  waitForCallback: (
    messageId: string,
    opts?: { timeoutMs?: number },
  ) => Promise<{ callbackData: string }>;
}

export interface RuntimeService {
  /** Monotonic clock — used by parity-харнес and audit hooks. */
  now: () => number;
  /** Logger — wraps OpenClaw's structured logger. */
  log: (
    level: "debug" | "info" | "warn" | "error",
    message: string,
    fields?: Record<string, unknown>,
  ) => void;
}

export interface PluginApi {
  registerTool: <TParams>(tool: ToolDefinition<TParams>, opts?: { optional?: boolean }) => void;
  registerHook: <H extends HookName>(name: H, handler: HookHandler<H>) => void;
  // Real openclaw 5.7 injected API (api.logger / api.pluginConfig).
  // Not present in v5.6 stubs or test mocks that only supply services.*.
  logger?: {
    debug: (msg: string, fields?: Record<string, unknown>) => void;
    info: (msg: string, fields?: Record<string, unknown>) => void;
    warn: (msg: string, fields?: Record<string, unknown>) => void;
    error: (msg: string, fields?: Record<string, unknown>) => void;
  };
  /** Parsed plugin config from openclaw.json plugins.entries.<id>.config (5.7+). */
  pluginConfig?: unknown;
  // Legacy stub surface used by tests and v5.6. Not injected by real 5.7 runtime.
  services?: {
    messaging?: MessagingService;
    runtime?: RuntimeService;
  };
}

// ─────────────────────────────────────────────────────────────────────────
// Plugin entry
// ─────────────────────────────────────────────────────────────────────────

export interface Plugin {
  /** Stable plugin identifier — must match `openclaw.plugin.json` § name. */
  name: string;
  /** Optional teardown for tests / hot-reload. */
  dispose?: () => Promise<void> | void;
}

/**
 * Plugin entry — what `index.ts` default-exports. The signature matches
 * what `@openclaw/plugin-sdk` `definePluginEntry` is expected to return.
 *
 * SDK injects the runtime `api` and the **stringified** `openclaw.json` §
 * `plugin.config` (resolved with env interpolation). Plugin parses + Zod-
 * validates it inside, then registers tools/hooks. Returning a `Plugin`
 * struct lets the runtime track the plugin in its registry.
 */
export type PluginEntry = (
  api: PluginApi,
  configJson: string,
) => Plugin | Promise<Plugin>;

/** Helper that delegates straight to the supplied entry. SDK adds typing. */
export function definePluginEntry(entry: PluginEntry): PluginEntry {
  return entry;
}
