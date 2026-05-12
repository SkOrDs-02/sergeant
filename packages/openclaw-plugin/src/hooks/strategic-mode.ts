/**
 * Stage 5b — strategic-mode hook (`before_agent_start`).
 *
 * Detects strategic-mode slash commands (`/plan <topic>` for PR-1;
 * `/analyze` and `/okr` land in the next PRs) in the inbound user
 * message, strips the slash + slug, and returns a result that mutates
 * the agent turn:
 *
 *   - `prompt`       — the captured topic only (slash + slug removed)
 *   - `prependContext` — the mode primer paragraph, slotted in front of
 *                        the persona system prompt so the framework
 *                        wins before any persona-tone instructions
 *                        nudge the agent into free-form chat.
 *
 * Why `before_agent_start` and not `before_dispatch`:
 *   - `before_dispatch` only carries `{ handled, text }` in its result
 *     type — it can short-circuit the agent (Layer 0 shortcuts) or fall
 *     through, but it cannot mutate the prompt for downstream stages.
 *     Strategic modes must STILL spin up the agent (the LLM drives the
 *     4-step framework); we just need to set the stage. The Stage 4c
 *     spike (`docs/notes/spikes/openclaw-sdk-5.7-real-api.md` § 4)
 *     documents that `before_agent_start` carries the canonical
 *     `prompt` field and its result type accepts
 *     `prependContext` / `appendContext` / `systemPrompt` / `prompt`
 *     / `modelOverride` — the deprecation tag (real openclaw 5.7
 *     `hook-before-agent-start.types.d.ts:38+`) reroutes the canonical
 *     path to `before_model_resolve` / `before_prompt_build`, but the
 *     legacy compat dispatch still fires and is what Stage 4a audit
 *     already runs on.
 *
 * Why we register AFTER the audit hook:
 *   - The audit hook in `hooks/audit.ts` reads `event.prompt` to log
 *     the founder's verbatim slash command into the
 *     `openclaw_invocations` row. If strategic-mode ran first and
 *     mutated `event.prompt` in place, the audit trail would show
 *     `churn-reduction-q3` instead of `/plan churn-reduction-q3`.
 *     The runtime applies handler results in registration order, so
 *     registering audit first preserves the original prompt for the
 *     audit row while the agent itself receives the stripped version.
 *
 * Soft posture (matches the rest of the plugin):
 *   - Empty / whitespace prompt → no-op pass-through.
 *   - `event.prompt` non-string / missing → no-op pass-through.
 *   - No mode matches → no-op pass-through (result `undefined`).
 *   - Throws from regex / matcher → caught + logged, no-op pass-through
 *     (a strategic-mode miss must NEVER block the agent turn).
 */

import type { PluginHookBeforeAgentStartEvent } from "openclaw/plugin-sdk/plugin-entry";

import {
  ALL_STRATEGIC_MODES,
  matchStrategicMode,
} from "../strategic-modes/index.js";
import type {
  StrategicModeDefinition,
  StrategicModeMatch,
} from "../strategic-modes/types.js";

export type StrategicModeHookLogger = (
  level: "debug" | "info" | "warn" | "error",
  message: string,
  fields?: Record<string, unknown>,
) => void;

export interface StrategicModeHookOptions {
  modes?: readonly StrategicModeDefinition[];
  log?: StrategicModeHookLogger;
}

/**
 * Subset of `before_agent_start` result fields the strategic-mode hook
 * actually emits. The wider result type (per the spike doc) also covers
 * `appendContext` / `systemPrompt` / `modelOverride`, but PR-1 only
 * needs `prompt` (rewritten to the stripped topic) and `prependContext`
 * (primer paragraph). Keeping the slot list small here makes the
 * contract obvious from the call-site grep — extending it later is a
 * one-line change.
 */
export interface StrategicModeHookResult {
  prompt?: string;
  prependContext?: string;
}

/**
 * Builds a `before_agent_start` handler that activates strategic modes.
 * Returns `undefined` when no mode matches so the runtime applies no
 * mutation to the agent turn.
 */
export function createStrategicModeHook(
  opts: StrategicModeHookOptions = {},
): (
  event: PluginHookBeforeAgentStartEvent,
) => Promise<StrategicModeHookResult | undefined> {
  const log = opts.log ?? (() => undefined);
  const modes = opts.modes ?? ALL_STRATEGIC_MODES;

  return async (event) => {
    const prompt = typeof event.prompt === "string" ? event.prompt : "";
    if (prompt.length === 0) return undefined;

    let match: StrategicModeMatch | null;
    try {
      match = matchStrategicMode(prompt, modes);
    } catch (err) {
      log("error", "sergeant.strategic_mode.match_error", {
        error: err instanceof Error ? err.message : String(err),
      });
      return undefined;
    }
    if (!match) return undefined;

    log("info", "sergeant.strategic_mode.activated", {
      slug: match.slug,
      trigger: match.trigger,
      topicChars: match.topic.length,
      runId: event.runId,
    });

    return {
      prompt: match.topic,
      prependContext: match.primer,
    };
  };
}
