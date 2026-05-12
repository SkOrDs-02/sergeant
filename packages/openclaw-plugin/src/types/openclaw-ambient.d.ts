/**
 * Ambient TypeScript declarations for openclaw 5.7 plugin SDK and TypeBox.
 *
 * Why: the workspace's pnpm-lock.yaml doesn't include `openclaw` or
 * `@sinclair/typebox`, and regenerating the lockfile in Docker is brittle
 * (npm chokes on pnpm's `workspace:*` protocol). For build-time type
 * checking we only need the *shape* of these modules — the actual JS lands
 * at runtime via the synthesised slim package.json in the Docker runtime
 * stage. These declarations describe just enough of each API surface to
 * compile src/index.ts without errors.
 *
 * When openclaw publishes proper types we can `pnpm add` it (locking deps)
 * and delete this file. Until then, this is the pragmatic boundary.
 */

declare module "openclaw/plugin-sdk/plugin-entry" {
  /**
   * Real openclaw 5.7 plugin entry contract — see docs.openclaw.ai/plugin-sdk.
   * The host calls `register(api)` once during plugin load with a runtime
   * API surface that exposes `registerTool`, `on` (for hooks), `config`,
   * etc. We type `api` permissively here because openclaw evolves the
   * surface across patch versions and we don't want compile-time coupling.
   *
   * Stage 4a (`registerHook` for `llm_input` / `agent_end` /
   * `before_tool_call` / `before_agent_start`): the SDK exposes
   * `api.registerHook(event, handler, opts?)` with hook-specific event
   * payload + return-value shapes. Real shapes are documented in
   * `docs/notes/spikes/openclaw-sdk-5.7-real-api.md`. We type both
   * generically as `unknown`-derived records here so the runtime can
   * ship new payload fields without breaking the workspace typecheck;
   * hook factories under `src/hooks/` cast defensively before reading.
   */
  export interface OpenClawPluginApi {
    registerTool: (tool: PluginTool, opts?: { optional?: boolean }) => void;
    on?: (
      eventName: string,
      handler: (event: unknown) => unknown,
      opts?: { priority?: number; timeoutMs?: number },
    ) => void;
    /**
     * Register a hook handler. **`opts.name` is REQUIRED** in openclaw
     * 5.7 — the loader (`node_modules/openclaw/dist/loader-B-GXgDrk.js:1490`)
     * throws `Error: hook registration missing name` from
     * `requireRegistrationValue(entry?.hook.name ?? opts?.name?.trim(), …)`
     * if the caller passes no `name`. Older fix (commit 305a4a03 from
     * 2026-05-11) wrapped this in a `safeRegisterHook` helper; the Stage 1
     * SDK rewrite (14ee42e2) dropped that helper and every hook
     * registration regressed silently — caught by smoke-test on 2026-05-12
     * (zero `openclaw.shortcut.routed`, zero `openclaw_invocations` rows).
     * Always pass `{ name: "sergeant.<unique-id>" }` to every call.
     */
    registerHook?: (
      eventName: PluginHookName | PluginHookName[] | string | string[],
      handler: (event: unknown) => unknown,
      opts?: { name: string; priority?: number; timeoutMs?: number },
    ) => void;
    /** Parsed plugin config (openclaw injects it before `register` runs). */
    config?: unknown;
    pluginConfig?: unknown;
    logger?: {
      debug: (msg: string, fields?: Record<string, unknown>) => void;
      info: (msg: string, fields?: Record<string, unknown>) => void;
      warn: (msg: string, fields?: Record<string, unknown>) => void;
      error: (msg: string, fields?: Record<string, unknown>) => void;
    };
  }

  /**
   * Subset of the canonical `PluginHookName` enum used in Sergeant Stage 4a/4b.
   * Full 34-name enum + payload + result shapes:
   * `node_modules/openclaw/dist/plugin-sdk/src/plugins/hook-types.d.ts`
   * (see spike doc § "Hook canonical enum"). Wider strings are still
   * accepted by `registerHook` above so we can extend incrementally
   * without bumping this list every PR.
   */
  export type PluginHookName =
    | "before_dispatch"
    | "before_agent_start"
    | "llm_input"
    | "agent_end"
    | "before_tool_call"
    | "after_tool_call"
    | "session_start"
    | "session_end"
    | "heartbeat_prompt_contribution";

  /**
   * Resolution values for `before_tool_call.requireApproval`. Real source:
   * `PluginApprovalResolutions` in `hook-types.d.ts:235+`. Plugin uses
   * these to discriminate `approved` vs `rejected` write-audit rows.
   */
  export type PluginApprovalResolution =
    | "allow-once"
    | "allow-always"
    | "deny"
    | "timeout"
    | "cancelled";

  /**
   * Event payload for `before_tool_call`. Real source:
   * `PluginHookBeforeToolCallEvent` (`hook-types.d.ts:226+`).
   * `runId` correlates to the same id used by `agent_end`; `toolCallId`
   * identifies one specific tool invocation inside the run.
   */
  export interface PluginHookBeforeToolCallEvent {
    toolName: string;
    params: Record<string, unknown>;
    runId?: string;
    toolCallId?: string;
  }

  /**
   * Result payload for `before_tool_call`. The host:
   *   - calls `execute` directly when result is undefined / `{}`,
   *   - blocks with `blockReason` when `block: true`,
   *   - shows the approval UI when `requireApproval` is present and
   *     calls `onResolution(decision)` after the founder picks
   *     allow / deny / timeout / cancel.
   */
  export interface PluginHookBeforeToolCallResult {
    params?: Record<string, unknown>;
    block?: boolean;
    blockReason?: string;
    requireApproval?: {
      title: string;
      description: string;
      severity?: "info" | "warning" | "critical";
      timeoutMs?: number;
      timeoutBehavior?: "allow" | "deny";
      pluginId?: string;
      onResolution?: (
        decision: PluginApprovalResolution,
      ) => Promise<void> | void;
    };
  }

  /**
   * Event payload for `llm_input`. Real shape evolves across openclaw
   * patches; we only need defensive access to `runId` (when present) for
   * log correlation, so the type stays permissive.
   */
  export interface PluginHookLlmInputEvent {
    runId?: string;
    [key: string]: unknown;
  }

  /**
   * Result payload for `llm_input`. Returning `{ block: true,
   * blockReason }` aborts the LLM call before any token spend.
   */
  export interface PluginHookLlmInputResult {
    block?: boolean;
    blockReason?: string;
  }

  /**
   * Event payload for `before_dispatch` — fires BEFORE the agent loop
   * starts on an inbound message. Real shape from
   * `hook-types.d.ts:163+` (`PluginHookBeforeDispatchEvent`).
   *
   * Used by Stage 4b shortcut router: read `content`, match against
   * regex shortcuts, return `{ handled: true, text: <rendered response> }`
   * to short-circuit the agent and have the runtime deliver `text` to
   * the originating channel (Telegram) verbatim. $0 LLM cost.
   */
  export interface PluginHookBeforeDispatchEvent {
    content: string;
    body?: string;
    channel?: string;
    sessionKey?: string;
    senderId?: string;
    isGroup?: boolean;
    timestamp?: number;
  }

  /**
   * Result payload for `before_dispatch`. Real source
   * `hook-types.d.ts:179+` (`PluginHookBeforeDispatchResult`).
   *
   *   - `{ handled: true, text }` → runtime sends `text` to the channel
   *     AND skips the agent dispatch entirely.
   *   - `{ handled: false }` or `undefined` → fall through to agent.
   */
  export interface PluginHookBeforeDispatchResult {
    handled: boolean;
    text?: string;
  }

  /**
   * Optional second-arg context to `before_dispatch` handlers — not
   * required for shortcut router, but defines the shape if hooks need
   * to discriminate by channel / account / session. Real source
   * `hook-types.d.ts:172+` (`PluginHookBeforeDispatchContext`).
   */
  export interface PluginHookBeforeDispatchContext {
    channelId?: string;
    accountId?: string;
    conversationId?: string;
    sessionKey?: string;
    senderId?: string;
  }

  /**
   * Event payload for `before_agent_start`.
   *
   * @deprecated Real openclaw 5.7 marks this hook itself as
   * `@deprecated Use before_model_resolve and before_prompt_build.`
   * (`hook-before-agent-start.types.d.ts:38+`). Live smoke-test 2026-05-12
   * confirmed: legacy compat dispatch still fires, but the real event has
   * `prompt` (not `userMessage`) and the result type does NOT support
   * `{ block, blockReason }` — only `prependContext`, `appendContext`,
   * `systemPrompt`, `modelOverride`, etc. Use `before_dispatch` for
   * short-circuit blocking; use `before_model_resolve` / `before_prompt_build`
   * for prompt mutation. Stage 4a audit hook still reads this event but
   * needs migration to `session_start` or `agent_turn_prepare`.
   */
  export interface PluginHookBeforeAgentStartEvent {
    prompt?: string;
    runId?: string;
    messages?: unknown[];
    /** Legacy field — NOT present in real openclaw 5.7 payload. Kept for
     *  defensive reading until Stage 4a audit-hook is migrated. */
    userMessage?: string;
    trigger?: string;
    sessionKey?: string;
    [key: string]: unknown;
  }

  /**
   * Event payload for `agent_end`. Carries the rollup numbers we need
   * for `/invocations/finalize` (status, cost, duration, iteration count).
   * Like the start event, fields stay optional pending live verification.
   */
  export interface PluginHookAgentEndEvent {
    runId?: string;
    status?: string;
    costUsd?: number;
    durationMs?: number;
    iterations?: number;
    assistantResponse?: string | null;
    errorMessage?: string | null;
    [key: string]: unknown;
  }

  export interface PluginTool {
    name: string;
    /**
     * UI display label — required by openclaw's AgentTool interface
     * (pi-agent-core). Tools without `label` are silently dropped.
     */
    label: string;
    description: string;
    /** TypeBox schema from the `typebox` package (not `@sinclair/typebox`). */
    parameters: unknown;
    execute: (
      invocationId: string,
      params: Record<string, unknown>,
    ) => Promise<{
      content: Array<{ type: "text"; text: string }>;
      /** Structured payload — pi-agent-core's AgentToolResult requires this. */
      details?: unknown;
    }>;
  }

  export interface PluginDefinition {
    id: string;
    name: string;
    description: string;
    /**
     * Called once at plugin load time. Signature is permissive (variadic
     * rest args) because openclaw 5.x lines have historically passed
     * additional context (e.g. a stringified config) as a second positional
     * arg and we want to introspect what we receive.
     */
    register: (
      api: OpenClawPluginApi,
      ...rest: unknown[]
    ) => void | Promise<void>;
    /** Optional fields openclaw 5.7 also honours but we don't use yet. */
    kind?: string;
    configSchema?: unknown;
    reload?: boolean;
  }

  /** Plugin entry helper — passthrough at runtime; gives us type safety. */
  export function definePluginEntry(def: PluginDefinition): PluginDefinition;
  export default definePluginEntry;
}

declare module "typebox" {
  // Minimal surface — covers what src/index.ts uses. The runtime values come
  // from the actual @sinclair/typebox install in the runtime stage.
  export interface TSchema {
    [key: string]: unknown;
  }

  interface TypeBuilder {
    Object: (
      props: Record<string, TSchema>,
      opts?: Record<string, unknown>,
    ) => TSchema;
    String: (opts?: Record<string, unknown>) => TSchema;
    Number: (opts?: Record<string, unknown>) => TSchema;
    Integer: (opts?: Record<string, unknown>) => TSchema;
    Boolean: (opts?: Record<string, unknown>) => TSchema;
    Array: (items: TSchema, opts?: Record<string, unknown>) => TSchema;
    Record: (key: TSchema, value: TSchema) => TSchema;
    Optional: (schema: TSchema) => TSchema;
    Unknown: () => TSchema;
    Any: () => TSchema;
    Literal: (value: string | number | boolean) => TSchema;
    Union: (schemas: TSchema[]) => TSchema;
  }

  export const Type: TypeBuilder;
}
