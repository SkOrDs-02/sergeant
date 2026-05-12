/**
 * Loads the cheap-router system prompt from disk.
 *
 * `cheapRouterSystemPromptPath` (`PluginConfig`) points at
 * `ops/openclaw/cheap-router.system.md` on the Gateway volume. We load
 * once at plugin start so each Haiku call doesn't re-read the file; if the
 * file does not exist OR cannot be read, we return `undefined` and the
 * classifier falls back to the server-side embedded default.
 *
 * Comment lines (`<!--…-->` blocks at the top of the markdown file) are
 * stripped so we forward the bare classification instructions to Haiku
 * — the canonical .md file uses them for documentation/lifecycle markers.
 */

import { readFileSync } from "node:fs";

export interface LoadCheapRouterPromptResult {
  /** Resolved prompt or `undefined` if not configured / failed to read. */
  prompt: string | undefined;
  /** Whether we attempted to read a file (true if `path` was provided). */
  attempted: boolean;
  /** Error message (only set when `attempted=true` and load failed). */
  error?: string;
}

export function loadCheapRouterSystemPrompt(
  path: string | undefined,
): LoadCheapRouterPromptResult {
  if (!path) return { prompt: undefined, attempted: false };

  try {
    const raw = readFileSync(path, "utf8");
    const stripped = stripHtmlComments(raw).trim();
    if (stripped.length === 0) {
      return {
        prompt: undefined,
        attempted: true,
        error: "prompt file is empty after stripping HTML comments",
      };
    }
    return { prompt: stripped, attempted: true };
  } catch (err) {
    return {
      prompt: undefined,
      attempted: true,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

/**
 * Strips `<!-- … -->` HTML comments (matches across newlines). Used because
 * `ops/openclaw/cheap-router.system.md` opens with a documentation comment
 * describing canonical-source + last-validated stamp that should not be
 * forwarded to Haiku as part of the classification instructions.
 */
export function stripHtmlComments(text: string): string {
  return text.replace(/<!--[\s\S]*?-->/g, "");
}
