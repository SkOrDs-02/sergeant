/**
 * Stage 4b — Layer 0 shortcut router hook (`before_agent_start`).
 *
 * Composed BEFORE the Stage 4a audit-open hook on the same event:
 *
 *   1. If the user message matches a shortcut → execute tool calls,
 *      render the canned response, return
 *      `{ block: true, blockReason: <rendered response> }`. The OpenClaw
 *      runtime renders `blockReason` as the assistant turn, so no
 *      sentinel prefix or host-side stripping is required. The agent
 *      never runs; cost stays at $0 from LLM standpoint.
 *
 *   2. If the matched shortcut is `/think` (sentinel `__ESCALATE_LAYER2__:`)
 *      we explicitly do NOT block — let the agent continue to Layer 2.
 *      Layer 2 escalation still uses the sentinel because it travels
 *      back into the agent loop via `userMessage` rewrites, not as a
 *      `blockReason`.
 *
 *   3. If no shortcut matches → return `undefined` (caller falls through
 *      to the Stage 4a audit-open hook).
 *
 * Why `before_agent_start`: it fires once per turn AND its event payload
 * exposes `userMessage` (`PluginHookBeforeAgentStartEvent.userMessage`),
 * which is exactly what a shortcut regex needs. We deliberately do not
 * register the router as a second `before_agent_start` handler — the SDK
 * does not document multi-handler ordering, so composition is safer.
 *
 * History: an earlier iteration prefixed the routed `blockReason` with a
 * `__ROUTED__:` sentinel so a Gateway-side handler could strip it before
 * delivery to Telegram. That host-side handler was never built (no plug
 * point in the upstream OpenClaw runtime, and `apps/server` is not in
 * the Telegram hot path for the Gateway flow). The sentinel is gone;
 * `blockReason` carries the rendered Markdown verbatim. See
 * `docs/planning/openclaw-migration-plan.md` § Stage 4b smoke-test.
 */

import type {
  PluginHookBeforeAgentStartEvent,
  PluginHookLlmInputResult,
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
 * Builds the `before_agent_start` shortcut-router hook. Returns
 * `undefined` for non-matches so the caller can compose with the Stage 4a
 * audit hook (`createBeforeAgentStartHook`) without extra wiring.
 */
export function createShortcutRouterHook(
  opts: ShortcutRouterHookOptions,
): (
  event: PluginHookBeforeAgentStartEvent,
) => Promise<PluginHookLlmInputResult | undefined> {
  const log = opts.log ?? (() => undefined);
  const router = new ShortcutRouter({
    shortcuts: opts.shortcuts,
    executeTool: opts.executeTool,
    log,
  });

  return async (event: PluginHookBeforeAgentStartEvent) => {
    const userMessage =
      typeof event.userMessage === "string" ? event.userMessage : undefined;
    if (!userMessage || userMessage.trim().length === 0) {
      return undefined;
    }

    let matchResult;
    try {
      matchResult = await router.match(userMessage);
    } catch (err) {
      log("error", "openclaw.shortcut.router_error", {
        error: err instanceof Error ? err.message : String(err),
      });
      return undefined;
    }
    if (!matchResult) return undefined;

    if (matchResult.response.startsWith(ESCALATE_PREFIX)) {
      log("debug", "openclaw.shortcut.escalate_layer2", {
        slug: matchResult.slug,
        runId: event.runId,
      });
      return undefined;
    }

    log("info", "openclaw.shortcut.routed", {
      slug: matchResult.slug,
      runId: event.runId,
      responseChars: matchResult.response.length,
      toolCount: matchResult.toolResults.size,
    });

    return {
      block: true,
      blockReason: matchResult.response,
    };
  };
}
