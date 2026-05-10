/**
 * Layer 0 — Shortcut router.
 *
 * Regex/slash-command matching без LLM. Якщо user message збігається
 * з одним із зареєстрованих shortcuts — виконуємо відповідні tool
 * call(s), рендеримо Mustache canned template, exit без LLM.
 *
 * Інтегрується у `llm_input` hook: якщо shortcut matched → повертає
 * готову відповідь + cost=$0. Якщо немає match → повертає null,
 * runtime йде далі до Layer 1 (cheap-router).
 *
 * 0 нових server endpoints — усі tool-виклики через existing registry.
 */

import type { ToolResult } from "./sdk-types.js";

// ─────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────

/** Parsed params from regex capture groups. */
export type ShortcutParams = Record<string, string | undefined>;

/** A single tool invocation descriptor. */
export interface ShortcutToolCall {
  /** Tool name from the registry (e.g. "get_stripe_metrics"). */
  toolName: string;
  /** Params builder — receives regex-captured params. */
  buildParams: (captured: ShortcutParams) => Record<string, unknown>;
}

/** Canned template render function. Receives aggregated tool results. */
export type TemplateRenderer = (
  results: Map<string, ToolResult>,
  params: ShortcutParams,
) => string;

/** Shortcut definition. Each shortcut is a separate file in `src/shortcuts/`. */
export interface ShortcutDefinition {
  /** Unique slug (e.g. "metrics", "runway", "prs"). */
  slug: string;
  /** Patterns that trigger this shortcut. First match wins. */
  patterns: RegExp[];
  /** Named capture groups to extract from the matched pattern. */
  captureGroups?: string[];
  /** Tool calls to execute (sequentially or in parallel). */
  toolCalls: ShortcutToolCall[];
  /** Whether tool calls should run in parallel. Default: true. */
  parallel?: boolean;
  /** Render the final response from tool results. */
  render: TemplateRenderer;
}

/** Result of a successful shortcut match. */
export interface ShortcutMatchResult {
  slug: string;
  response: string;
  toolResults: Map<string, ToolResult>;
}

/** Tool executor — injected dependency (wires to actual plugin tool registry). */
export type ToolExecutor = (
  toolName: string,
  params: Record<string, unknown>,
) => Promise<ToolResult>;

// ─────────────────────────────────────────────────────────────────────────
// Router
// ─────────────────────────────────────────────────────────────────────────

export interface ShortcutRouterOptions {
  shortcuts: ShortcutDefinition[];
  executeTool: ToolExecutor;
  log?: (
    level: "debug" | "info" | "warn" | "error",
    message: string,
    fields?: Record<string, unknown>,
  ) => void;
}

export class ShortcutRouter {
  private readonly shortcuts: ShortcutDefinition[];
  private readonly executeTool: ToolExecutor;
  private readonly log: NonNullable<ShortcutRouterOptions["log"]>;

  constructor(opts: ShortcutRouterOptions) {
    this.shortcuts = opts.shortcuts;
    this.executeTool = opts.executeTool;
    this.log = opts.log ?? (() => undefined);
  }

  /**
   * Try to match the user message against registered shortcuts.
   * Returns null if no match — caller should proceed to Layer 1.
   */
  async match(userMessage: string): Promise<ShortcutMatchResult | null> {
    const trimmed = userMessage.trim();

    for (const shortcut of this.shortcuts) {
      const captured = this.tryMatch(trimmed, shortcut);
      if (captured === null) continue;

      this.log("debug", "openclaw.shortcut.matched", {
        slug: shortcut.slug,
        captured,
      });

      const results = await this.executeToolCalls(shortcut, captured);
      const response = shortcut.render(results, captured);

      return { slug: shortcut.slug, response, toolResults: results };
    }

    return null;
  }

  private tryMatch(
    message: string,
    shortcut: ShortcutDefinition,
  ): ShortcutParams | null {
    for (const pattern of shortcut.patterns) {
      const match = pattern.exec(message);
      if (match) {
        return { ...match.groups };
      }
    }
    return null;
  }

  private async executeToolCalls(
    shortcut: ShortcutDefinition,
    captured: ShortcutParams,
  ): Promise<Map<string, ToolResult>> {
    const results = new Map<string, ToolResult>();
    const parallel = shortcut.parallel !== false;

    if (parallel) {
      const promises = shortcut.toolCalls.map(async (tc) => {
        const params = tc.buildParams(captured);
        const result = await this.safeExecute(tc.toolName, params);
        return [tc.toolName, result] as const;
      });
      const settled = await Promise.all(promises);
      for (const [name, result] of settled) {
        results.set(name, result);
      }
    } else {
      for (const tc of shortcut.toolCalls) {
        const params = tc.buildParams(captured);
        const result = await this.safeExecute(tc.toolName, params);
        results.set(tc.toolName, result);
      }
    }

    return results;
  }

  private async safeExecute(
    toolName: string,
    params: Record<string, unknown>,
  ): Promise<ToolResult> {
    try {
      return await this.executeTool(toolName, params);
    } catch (err) {
      this.log("error", "openclaw.shortcut.tool_error", {
        toolName,
        error: err instanceof Error ? err.message : String(err),
      });
      return {
        content: [
          {
            type: "text",
            text: `(Error executing ${toolName}: ${err instanceof Error ? err.message : "unknown error"})`,
          },
        ],
      };
    }
  }
}

/**
 * Extract text content from a ToolResult for use in templates.
 */
export function extractText(result: ToolResult | undefined): string {
  if (!result) return "(no data)";
  const textBlocks = result.content.filter((b) => b.type === "text");
  return textBlocks
    .map((b) => (b as { type: "text"; text: string }).text)
    .join("\n");
}
