/**
 * Combined `llm_input` hook that integrates:
 *   1. Budget gate (existing) — blocks on budget exceeded
 *   2. Layer 0 shortcut router — blocks with canned response ($0)
 *   3. Layer 1 cheap router — classifies and either:
 *      a) Dispatches to a shortcut (routine_*) → blocks with response
 *      b) Returns chat_response directly → blocks with Haiku reply
 *      c) Escalates to Layer 2 (thinking) → allows through (ok: true)
 *
 * Hook ordering: budget → shortcut → cheap-router. If budget blocks,
 * nothing else runs. If shortcut matches, cheap-router is skipped.
 */

import type { HookHandler } from "./sdk-types.js";
import type { OpenClawHttpClient } from "./http-client.js";
import { createBudgetGate, type BudgetGateOptions } from "./budget.js";
import { ShortcutRouter, type ToolExecutor } from "./shortcut-router.js";
import {
  CheapRouter,
  routineToShortcutSlug,
  isChatResponse,
  type LlmClassifier,
} from "./cheap-router.js";
import { ALL_SHORTCUTS } from "./shortcuts/index.js";

export interface RoutingHookOptions {
  http: OpenClawHttpClient;
  founderUserId: string;
  perCallCapUsd: number;
  /** LLM classifier for Layer 1 (Haiku call). */
  classify: LlmClassifier;
  /** Override cheap-router system prompt (e.g. read from ops/openclaw/cheap-router.system.md). */
  cheapRouterSystemPrompt?: string;
  /** Tool executor for shortcut tool calls. */
  executeTool: ToolExecutor;
  log?: (
    level: "debug" | "info" | "warn" | "error",
    message: string,
    fields?: Record<string, unknown>,
  ) => void;
}

/** Sentinel prefix in `reason` indicating a routed response (not an error). */
export const ROUTED_RESPONSE_PREFIX = "__ROUTED__:";

/** Sentinel prefix indicating Layer 2 escalation. */
export const ESCALATE_PREFIX = "__ESCALATE_LAYER2__:";

export interface RoutingHookResult {
  hook: HookHandler<"llm_input">;
  /** Access to the shortcut router (for testing). */
  shortcutRouter: ShortcutRouter;
  /** Access to the cheap router (for testing). */
  cheapRouter: CheapRouter;
}

/**
 * Creates the combined routing hook.
 *
 * The hook receives the user message from `ctx` (forwarded by the runtime
 * through `LlmInputContext`). We extend the context interface locally to
 * include `userMessage` — the SDK is expected to provide it.
 */
export function createRoutingHook(opts: RoutingHookOptions): RoutingHookResult {
  const log = opts.log ?? (() => undefined);

  const budgetGate = createBudgetGate({
    http: opts.http,
    founderUserId: opts.founderUserId,
    perCallCapUsd: opts.perCallCapUsd,
    log,
  } satisfies BudgetGateOptions);

  const shortcutRouter = new ShortcutRouter({
    shortcuts: ALL_SHORTCUTS,
    executeTool: opts.executeTool,
    log,
  });

  const cheapRouter = new CheapRouter({
    classify: opts.classify,
    ...(opts.cheapRouterSystemPrompt
      ? { systemPrompt: opts.cheapRouterSystemPrompt }
      : {}),
    log,
  });

  const hook: HookHandler<"llm_input"> = async (ctx) => {
    // 1. Budget gate
    const budgetResult = await budgetGate(ctx);
    if (!budgetResult.ok) return budgetResult;

    // Extract user message from context (runtime provides it)
    const userMessage = (ctx as unknown as { userMessage?: string })
      .userMessage;
    if (!userMessage) {
      // No user message available — allow through to full agent
      return { ok: true };
    }

    // 2. Layer 0 — Shortcut match (exact patterns, $0 cost)
    const shortcutMatch = await shortcutRouter.match(userMessage);
    if (shortcutMatch) {
      // Check for Layer 2 escalation signal from /think
      if (shortcutMatch.response.startsWith(ESCALATE_PREFIX)) {
        log("debug", "openclaw.routing.escalate_layer2", {
          slug: shortcutMatch.slug,
        });
        return { ok: true };
      }

      log("info", "openclaw.routing.shortcut_matched", {
        slug: shortcutMatch.slug,
      });
      return {
        ok: false,
        reason: `${ROUTED_RESPONSE_PREFIX}${shortcutMatch.response}`,
      };
    }

    // 3. Layer 1 — Cheap router (Haiku classification, ~$0.0002)
    const { classification } = await cheapRouter.route(userMessage);

    // 3a. Routine → find and execute the shortcut
    const suggestedSlug = routineToShortcutSlug(classification);
    if (suggestedSlug) {
      // Build a synthetic query for the shortcut (use the slash command)
      const syntheticMessage = `/${suggestedSlug}`;
      const routineMatch = await shortcutRouter.match(syntheticMessage);
      if (routineMatch) {
        log("info", "openclaw.routing.cheap_to_shortcut", {
          class: classification.class,
          slug: suggestedSlug,
        });
        return {
          ok: false,
          reason: `${ROUTED_RESPONSE_PREFIX}${routineMatch.response}`,
        };
      }
    }

    // 3b. Chat → Haiku already has a short response
    if (isChatResponse(classification) && classification.chat_response) {
      log("info", "openclaw.routing.chat_response", {});
      return {
        ok: false,
        reason: `${ROUTED_RESPONSE_PREFIX}${classification.chat_response}`,
      };
    }

    // 3c. Thinking → escalate to Layer 2 (full agent)
    log("debug", "openclaw.routing.layer2_passthrough", {
      class: classification.class,
      persona: classification.persona,
    });
    return { ok: true };
  };

  return { hook, shortcutRouter, cheapRouter };
}

/**
 * Check if a hook block reason is a routed response (not an error).
 * The runtime should treat these as successful early-exit responses.
 */
export function isRoutedResponse(reason: string): boolean {
  return reason.startsWith(ROUTED_RESPONSE_PREFIX);
}

/** Extract the actual response text from a routed reason. */
export function extractRoutedResponse(reason: string): string {
  return reason.slice(ROUTED_RESPONSE_PREFIX.length);
}
