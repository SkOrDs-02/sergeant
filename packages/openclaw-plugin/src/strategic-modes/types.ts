/**
 * Stage 5b — strategic-mode types.
 *
 * Strategic modes are orthogonal to personas: persona picks WHO thinks
 * (cofounder / eng / growth / …), mode picks HOW to think (free-form
 * dialog vs. structured `/plan` → `/analyze` → `/okr` frameworks).
 *
 * A mode definition matches a slash-prefixed message (`/plan churn-q3`),
 * strips the slash + slug, and exposes the remaining payload (the
 * `topic`) plus a primer paragraph that the host hook prepends to the
 * agent's system prompt. The agent still runs (we are NOT bypassing the
 * LLM the way `before_dispatch` shortcuts do); we just lead it into the
 * structured framework before it produces its first token.
 *
 * The host wiring lives in `src/hooks/strategic-mode.ts` and runs on
 * `before_agent_start` — the canonical hook for prompt + system-prompt
 * mutation in openclaw 5.7. `before_dispatch` cannot mutate the prompt
 * (its result type only carries `{ handled, text }`), so a slash command
 * that should still spin up the agent has to be intercepted later.
 */

/** Canonical slugs for the three Stage 5b strategic modes. */
export type StrategicModeSlug = "plan" | "analyze" | "okr";

/**
 * Audit trigger label written to `openclaw_invocations.trigger` when a
 * strategic mode fires. The legacy audit hook (`hooks/audit.ts`) uses
 * the set `{ dm, morning_ritual, weekly_review, monthly_okr }`; Stage 5b
 * adds the strategic-mode triggers as a parallel namespace so a future
 * cost-per-mode rollup query can `GROUP BY trigger`. PR-1 only wires
 * the primer side of this; the audit-hook update to actually persist
 * the trigger is deferred to the Stage 5b follow-up PR (after `/okr`
 * is merged).
 */
export type StrategicModeTrigger =
  | "strategic_plan"
  | "strategic_analyze"
  | "strategic_okr";

/**
 * Result of matching a user message against a strategic-mode definition.
 * `topic` is what survives after stripping the slash + slug + any
 * leading whitespace; for `/okr` (no required topic) it is an empty
 * string but the match still succeeds.
 */
export interface StrategicModeMatch {
  /** Mode slug (`plan` / `analyze` / `okr`). */
  slug: StrategicModeSlug;
  /** Trigger label for audit-row annotation (Stage 5b follow-up). */
  trigger: StrategicModeTrigger;
  /** Primer paragraph injected into the agent's system prompt. */
  primer: string;
  /** Remainder of the prompt after stripping `/<slug>`. May be empty. */
  topic: string;
}

/**
 * Strategic-mode definition. One per mode file in `src/strategic-modes/`.
 *
 * `pattern` MUST use a `^/<slug>` anchor + word-boundary so siblings
 * never collide (e.g. `/plant` is NOT a `/plan` match). The optional
 * `<topic>` named-capture group is read by `match()` to extract the
 * payload; modes without a required topic (`/okr`) should still expose
 * the group so the host hook can read a consistent shape.
 */
export interface StrategicModeDefinition {
  slug: StrategicModeSlug;
  trigger: StrategicModeTrigger;
  primer: string;
  /**
   * Regex that consumes the entire user message. Use `^/<slug>\b` to
   * anchor the slash command at the start and prevent prefix-collisions
   * with neighbours (e.g. `/plant` ≠ `/plan`).
   */
  pattern: RegExp;
  /** Whether the mode requires a non-empty `<topic>` capture. */
  topicRequired: boolean;
}
