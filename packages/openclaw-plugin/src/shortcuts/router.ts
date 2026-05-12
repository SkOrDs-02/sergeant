/**
 * Stage 4b — Layer 0 shortcut router (regex/slash matching, no LLM).
 *
 * Iterates the registered `ShortcutDefinition[]` and tries each pattern
 * against the trimmed user message. First match wins. On match:
 *
 *   1. Resolve tool calls (parallel by default; opt-in to sequential by
 *      setting `parallel: false` on the shortcut).
 *   2. Render the canned Markdown template via the shortcut's `render` fn.
 *   3. Return `{ slug, response, toolResults }`.
 *
 * No match → `null`. The caller (hook in `src/hooks/shortcut-router.ts`)
 * decides what to do with that — Stage 4b lets the agent continue normally;
 * Stage 4c (Haiku cheap-router) is the next layer.
 *
 * Failures in tool execution are caught and surfaced as text blocks so a
 * partial template still renders — we never throw out of `match()`.
 */

import type {
  ShortcutDefinition,
  ShortcutMatchResult,
  ShortcutParams,
  ToolExecutor,
  ToolResult,
} from "./types.js";

export type ShortcutRouterLogger = (
  level: "debug" | "info" | "warn" | "error",
  message: string,
  fields?: Record<string, unknown>,
) => void;

export interface ShortcutRouterOptions {
  shortcuts: ShortcutDefinition[];
  executeTool: ToolExecutor;
  log?: ShortcutRouterLogger;
}

export class ShortcutRouter {
  private readonly shortcuts: ShortcutDefinition[];
  private readonly executeTool: ToolExecutor;
  private readonly log: ShortcutRouterLogger;

  constructor(opts: ShortcutRouterOptions) {
    this.shortcuts = opts.shortcuts;
    this.executeTool = opts.executeTool;
    this.log = opts.log ?? (() => undefined);
  }

  async match(userMessage: string): Promise<ShortcutMatchResult | null> {
    const trimmed = userMessage.trim();
    if (trimmed.length === 0) return null;

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
        // `match.groups` is undefined when no named groups exist — spread is safe.
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
    if (shortcut.toolCalls.length === 0) return results;

    const parallel = shortcut.parallel !== false;
    if (parallel) {
      const settled = await Promise.all(
        shortcut.toolCalls.map(async (tc) => {
          const params = tc.buildParams(captured);
          const result = await this.safeExecute(tc.toolName, params);
          return [tc.toolName, result] as const;
        }),
      );
      for (const [name, result] of settled) results.set(name, result);
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
      const msg = err instanceof Error ? err.message : String(err);
      this.log("error", "openclaw.shortcut.tool_error", {
        toolName,
        error: msg,
      });
      return {
        content: [
          { type: "text", text: `(Error executing ${toolName}: ${msg})` },
        ],
      };
    }
  }
}

/** Extract text content from a `ToolResult` for use inside template strings. */
export function extractText(result: ToolResult | undefined): string {
  if (!result) return "(no data)";
  const textBlocks = result.content.filter((b) => b.type === "text");
  if (textBlocks.length === 0) return "(no data)";
  return textBlocks.map((b) => b.text).join("\n");
}
