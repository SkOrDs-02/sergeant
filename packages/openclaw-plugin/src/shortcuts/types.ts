/**
 * Stage 4b — Layer 0 shortcut router types.
 *
 * A shortcut is an exact regex match (slash command or canonical Ukrainian
 * phrase) that bypasses the LLM entirely: the router runs a set of plugin
 * tools through the same HTTP proxy used by `api.registerTool`, then renders
 * a canned Markdown template from the aggregated tool results.
 *
 * The router lives in `src/shortcuts/router.ts`; the host wiring is
 * `src/hooks/shortcut-router.ts` and runs inside `before_agent_start`. Tool
 * dispatch goes through the in-process `ToolExecutor` callback that
 * `src/index.ts` builds alongside the `api.registerTool` loop, so we never
 * touch openclaw's tool registry from here.
 */

/** Parsed parameters from regex named-capture groups. */
export type ShortcutParams = Record<string, string | undefined>;

/** One text block inside a tool result. */
export interface ToolResultTextBlock {
  type: "text";
  text: string;
}

/**
 * Tool execution result shape — mirrors what `api.registerTool({execute})`
 * returns on the runtime. We only consume `content[*].text` here.
 */
export interface ToolResult {
  content: ToolResultTextBlock[];
  details?: unknown;
}

/** A single tool invocation requested by a shortcut definition. */
export interface ShortcutToolCall {
  /** Tool name from the active plugin registry (e.g. "get_stripe_metrics"). */
  toolName: string;
  /** Param builder — receives regex-captured groups, returns tool params. */
  buildParams: (captured: ShortcutParams) => Record<string, unknown>;
}

/** Renders the final Markdown response from aggregated tool results. */
export type TemplateRenderer = (
  results: Map<string, ToolResult>,
  params: ShortcutParams,
) => string;

/**
 * One shortcut. Each shortcut lives in its own `src/shortcuts/<slug>.ts`
 * and is included in `ALL_SHORTCUTS` (`src/shortcuts/index.ts`).
 */
export interface ShortcutDefinition {
  /** Unique slug — also the slash-command name without leading "/". */
  slug: string;
  /** Patterns that trigger this shortcut. First-match wins (per pattern). */
  patterns: RegExp[];
  /** Optional list of expected named-capture groups (for documentation). */
  captureGroups?: string[];
  /** Tool calls to execute when the shortcut matches. */
  toolCalls: ShortcutToolCall[];
  /** Whether tool calls run in parallel. Default: true. */
  parallel?: boolean;
  /** Render the final Markdown response from tool results + captured params. */
  render: TemplateRenderer;
}

/** Successful shortcut match. */
export interface ShortcutMatchResult {
  slug: string;
  response: string;
  toolResults: Map<string, ToolResult>;
}

/**
 * Tool executor — injected dependency. `src/index.ts` builds one that
 * dispatches to the same HTTP endpoint the registered tool would have
 * hit, so server-side semantics stay identical to non-shortcut calls.
 */
export type ToolExecutor = (
  toolName: string,
  params: Record<string, unknown>,
) => Promise<ToolResult>;
