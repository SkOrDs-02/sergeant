/**
 * Stage 5c — `/council <topic>` hook factories.
 *
 * Two hooks split across two events:
 *
 *   - `createCouncilGateHook` (`before_dispatch`): pre-flight budget
 *     gate. If `/council <topic>` is present AND the budget gate
 *     refuses (`daily_cap_exceeded`, `headroom_below_council_cap`, or
 *     `service_error`), the hook claims the dispatch by returning
 *     `{ handled: true, text: <gate.reason> }`. The runtime sends
 *     `text` to the originating channel verbatim AND skips agent
 *     dispatch entirely — zero LLM cost. When the gate allows the
 *     session the hook returns `{ handled: false }` so the runtime
 *     falls through to the agent.
 *
 *   - `createCouncilModeHook` (`before_agent_start`): primer
 *     injection. Mutates the upcoming agent turn so the cofounder
 *     receives `COUNCIL_PRIMER` as `prependContext` and the topic as
 *     `prompt`. Audit logging is handled by the existing audit hook
 *     registered earlier in the lifecycle — by the time strategic-
 *     mode-style hooks run, `event.prompt` is still the original
 *     `/council ...` text (per the audit-precedence note in
 *     `hooks/strategic-mode.ts`).
 *
 * Why two hooks instead of one combined handler:
 *   - `before_dispatch.result` only carries `{ handled, text }` — it
 *     can short-circuit to the channel but cannot mutate the prompt
 *     for downstream stages.
 *   - `before_agent_start.result` carries `{ prompt, prependContext,
 *     appendContext, systemPrompt, modelOverride }` — it cannot
 *     short-circuit; the agent still runs.
 *   - The denial path needs the channel short-circuit (no LLM call
 *     when the budget is empty). The allowed path needs the prompt
 *     mutation. Splitting across the two events is the canonical
 *     openclaw 5.7 pattern (matches `before_dispatch` shortcut router
 *     + `before_agent_start` strategic-mode hook from Stages 4b/5b).
 *
 * Soft posture (matches the rest of the plugin):
 *   - Non-string / empty prompt → no-op pass-through.
 *   - Pattern miss → no-op pass-through (router falls through to the
 *     next `before_dispatch` handler or the agent loop).
 *   - Gate throws → fail-closed: short-circuit dispatch with a
 *     "service_error" reason. The gate factory itself wraps HTTP
 *     errors, so this branch is defence-in-depth only.
 *   - Primer hook throws / matcher throws → caught + logged, no-op
 *     pass-through (a council miss must NEVER block the agent turn).
 */

import type {
  PluginHookBeforeAgentStartEvent,
  PluginHookBeforeDispatchEvent,
  PluginHookBeforeDispatchResult,
} from "openclaw/plugin-sdk/plugin-entry";

import {
  COUNCIL_PATTERN,
  matchCouncil,
  type CouncilGateOutcome,
} from "../council/index.js";

export type CouncilHookLogger = (
  level: "debug" | "info" | "warn" | "error",
  message: string,
  fields?: Record<string, unknown>,
) => void;

// ─────────────────────────────────────────────────────────────────────────
// before_dispatch — budget pre-flight gate
// ─────────────────────────────────────────────────────────────────────────

export interface CouncilGateHookOptions {
  /**
   * Pre-flight gate (built by `createCouncilBudgetGate` in
   * `council/index.ts`). Runs only when the inbound message matches
   * `COUNCIL_PATTERN`; never called for non-`/council` traffic so
   * regular DMs don't incur an extra `/budget` round-trip.
   */
  gate: () => Promise<CouncilGateOutcome>;
  log?: CouncilHookLogger;
}

/**
 * Returns a `before_dispatch` handler that fails fast when the founder
 * tries to start a `/council` session without enough budget headroom.
 *
 * Result contract:
 *   - `/council <topic>` + gate allowed → `{ handled: false }` (fall
 *     through to the agent — `createCouncilModeHook` will inject the
 *     primer in `before_agent_start`).
 *   - `/council <topic>` + gate denied → `{ handled: true, text }`
 *     (short-circuit, zero-cost reply with the gate's UI reason).
 *   - Anything else → `{ handled: false }` (pattern miss or empty
 *     prompt — runtime continues to the next `before_dispatch`
 *     handler or the agent loop).
 */
export function createCouncilGateHook(
  opts: CouncilGateHookOptions,
): (
  event: PluginHookBeforeDispatchEvent,
) => Promise<PluginHookBeforeDispatchResult> {
  const log = opts.log ?? (() => undefined);

  return async (event) => {
    const content =
      typeof event.content === "string" ? event.content : undefined;
    if (!content || content.trim().length === 0) {
      return { handled: false };
    }

    // Cheap regex check before the matcher does the work — keeps the
    // hot path (non-council DMs) one regex test.
    if (!COUNCIL_PATTERN.test(content.trim())) {
      return { handled: false };
    }

    const match = matchCouncil(content);
    if (!match) {
      // Bare `/council` lands here (topic group empty). Per the matcher
      // contract we fall through to the agent so the cofounder can ask
      // for a one-liner — no budget call needed yet.
      return { handled: false };
    }

    let outcome: CouncilGateOutcome;
    try {
      outcome = await opts.gate();
    } catch (err) {
      log("error", "openclaw.council.gate_hook_error", {
        error: err instanceof Error ? err.message : String(err),
      });
      return {
        handled: true,
        text:
          "Council відкладено — fail-closed (gate hook error). " +
          "Спробуй пізніше або окрему /persona.",
      };
    }

    if (!outcome.allowed) {
      log("info", "openclaw.council.gate_denied", {
        kind: outcome.kind,
        remainingUsd: outcome.remainingUsd,
        sessionKey: event.sessionKey,
        channel: event.channel,
      });
      return {
        handled: true,
        text: outcome.reason,
      };
    }

    log("info", "openclaw.council.gate_allowed", {
      remainingUsd: outcome.remainingUsd,
      sessionKey: event.sessionKey,
      channel: event.channel,
    });
    return { handled: false };
  };
}

// ─────────────────────────────────────────────────────────────────────────
// before_agent_start — primer injection
// ─────────────────────────────────────────────────────────────────────────

/**
 * Subset of `before_agent_start` result fields the council mode hook
 * actually emits. Parallel to the strategic-mode hook's
 * `StrategicModeHookResult` (Stage 5b) — sticks to `prompt` + `prependContext`
 * so the contract is obvious from the call-site grep.
 */
export interface CouncilModeHookResult {
  prompt?: string;
  prependContext?: string;
}

export interface CouncilModeHookOptions {
  log?: CouncilHookLogger;
}

/**
 * Returns a `before_agent_start` handler that activates the council
 * round-table. Returns `undefined` when no match so the runtime applies
 * no mutation to the agent turn.
 *
 * Contract:
 *   - `/council <topic>` matches → return
 *     `{ prompt: <topic>, prependContext: COUNCIL_PRIMER }`. The
 *     runtime concatenates `prependContext` in front of the cofounder
 *     persona system prompt, and the agent receives the bare topic as
 *     its user message.
 *   - Bare `/council` (topic empty) → return `undefined`. The agent
 *     gets the original `/council` text and replies with a
 *     "give me a one-liner" prompt per the SKILL.
 *   - Pattern miss / non-string prompt → return `undefined`.
 *   - Matcher throws → caught + logged, return `undefined` (council
 *     miss must NEVER block the agent turn).
 */
export function createCouncilModeHook(
  opts: CouncilModeHookOptions = {},
): (
  event: PluginHookBeforeAgentStartEvent,
) => Promise<CouncilModeHookResult | undefined> {
  const log = opts.log ?? (() => undefined);

  return async (event) => {
    const prompt = typeof event.prompt === "string" ? event.prompt : "";
    if (prompt.length === 0) return undefined;

    let match: ReturnType<typeof matchCouncil>;
    try {
      match = matchCouncil(prompt);
    } catch (err) {
      log("error", "openclaw.council.mode_match_error", {
        error: err instanceof Error ? err.message : String(err),
      });
      return undefined;
    }
    if (!match) return undefined;

    log("info", "openclaw.council.mode_activated", {
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
