/**
 * Stage 4b — Layer 0 shortcut router hook (`before_dispatch`).
 *
 * Fires BEFORE the openclaw agent loop starts on an inbound message:
 *
 *   1. If the user message matches a shortcut → execute the tool calls,
 *      render the canned Markdown response, return
 *      `{ handled: true, text: <rendered response> }`. The runtime sends
 *      `text` to the originating channel (e.g. Telegram) verbatim AND
 *      skips agent dispatch entirely. $0 LLM cost.
 *
 *   2. If the matched shortcut is `/think` (sentinel `__ESCALATE_LAYER2__:`)
 *      we explicitly do NOT claim the message — let the runtime dispatch
 *      to the agent for Layer 2 reasoning. Layer 2 escalation still uses
 *      the sentinel because it travels back into the agent loop via the
 *      `userMessage` channel (handled outside this hook), not as a
 *      `text` short-circuit.
 *
 *   3. If no shortcut matches → return `{ handled: false }` so the
 *      runtime continues to the agent.
 *
 * Why `before_dispatch`: it is the canonical hook for "intercept a user
 * message and reply without invoking the agent" in openclaw 2026.5.7
 * (`hook-types.d.ts:163+`, `PluginHookBeforeDispatchResult.handled`).
 *
 * History: Stage 4b initially registered this router on `before_agent_start`
 * — but that hook is marked `@deprecated` in real 5.7 and its result type
 * (`PluginHookBeforeAgentStartResult`) does NOT support short-circuit
 * blocking. It only allows prompt mutation / model override. Live smoke-
 * test on Gateway 2026-05-12 confirmed the agent ran in full for every
 * shortcut command; logs showed no `openclaw.shortcut.routed` events.
 * See `docs/notes/spikes/openclaw-sdk-5.7-real-api.md` § Stage 4b fix.
 */

import type {
  PluginHookBeforeDispatchEvent,
  PluginHookBeforeDispatchResult,
} from "openclaw/plugin-sdk/plugin-entry";

import { ShortcutRouter } from "../shortcuts/router.js";
import type { ShortcutDefinition, ToolExecutor } from "../shortcuts/types.js";

/** Sentinel prefix marking a Layer 2 escalation (e.g. `/think`). */
export const ESCALATE_PREFIX = "__ESCALATE_LAYER2__:";

export type ShortcutHookLogger = (
  level: "debug" | "info" | "warn" | "error",
  message: string,
  fields?: Record<string, unknown>,
) => void;

export interface ShortcutRouterHookOptions {
  shortcuts: ShortcutDefinition[];
  executeTool: ToolExecutor;
  log?: ShortcutHookLogger;
}

/**
 * Builds the `before_dispatch` shortcut-router hook. Returns
 * `{ handled: false }` for non-matches so the runtime falls through to
 * the agent — this is the canonical "did not claim" signal in openclaw.
 */
export function createShortcutRouterHook(
  opts: ShortcutRouterHookOptions,
): (
  event: PluginHookBeforeDispatchEvent,
) => Promise<PluginHookBeforeDispatchResult> {
  const log = opts.log ?? (() => undefined);
  const router = new ShortcutRouter({
    shortcuts: opts.shortcuts,
    executeTool: opts.executeTool,
    log,
  });

  return async (event: PluginHookBeforeDispatchEvent) => {
    const content =
      typeof event.content === "string" ? event.content : undefined;
    if (!content || content.trim().length === 0) {
      return { handled: false };
    }

    let matchResult;
    try {
      matchResult = await router.match(content);
    } catch (err) {
      log("error", "openclaw.shortcut.router_error", {
        error: err instanceof Error ? err.message : String(err),
      });
      return { handled: false };
    }
    if (!matchResult) return { handled: false };

    if (matchResult.response.startsWith(ESCALATE_PREFIX)) {
      log("debug", "openclaw.shortcut.escalate_layer2", {
        slug: matchResult.slug,
        channel: event.channel,
        sessionKey: event.sessionKey,
      });
      return { handled: false };
    }

    log("info", "openclaw.shortcut.routed", {
      slug: matchResult.slug,
      channel: event.channel,
      sessionKey: event.sessionKey,
      responseChars: matchResult.response.length,
      toolCount: matchResult.toolResults.size,
    });

    return {
      handled: true,
      text: matchResult.response,
    };
  };
}
