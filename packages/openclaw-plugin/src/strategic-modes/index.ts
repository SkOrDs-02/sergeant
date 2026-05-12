/**
 * Stage 5b — strategic-mode catalogue.
 *
 * Order matters: the host hook (`hooks/strategic-mode.ts`) iterates this
 * list and the first pattern match wins. Each entry has its own anchored
 * slash prefix so the order is currently irrelevant in practice — PR-1
 * ships only `/plan`, the `/analyze` and `/okr` entries land in their
 * own PRs (Stage 5b PR-2 / PR-3).
 */

import { planMode } from "./plan.js";
import type {
  StrategicModeDefinition,
  StrategicModeMatch,
  StrategicModeSlug,
  StrategicModeTrigger,
} from "./types.js";

export const ALL_STRATEGIC_MODES: StrategicModeDefinition[] = [planMode];

/**
 * Attempts to match the user message against every registered strategic
 * mode. Returns `null` when no mode applies, including the case where a
 * mode's `topicRequired` is true but the captured `topic` is empty —
 * the message then falls through to the agent untouched.
 */
export function matchStrategicMode(
  userMessage: string,
  modes: readonly StrategicModeDefinition[] = ALL_STRATEGIC_MODES,
): StrategicModeMatch | null {
  if (typeof userMessage !== "string") return null;
  const trimmed = userMessage.trim();
  if (trimmed.length === 0) return null;

  for (const mode of modes) {
    const m = mode.pattern.exec(trimmed);
    if (!m) continue;
    const topic = (m.groups?.["topic"] ?? "").trim();
    if (mode.topicRequired && topic.length === 0) continue;
    return {
      slug: mode.slug,
      trigger: mode.trigger,
      primer: mode.primer,
      topic,
    };
  }

  return null;
}

export { planMode };
export type {
  StrategicModeDefinition,
  StrategicModeMatch,
  StrategicModeSlug,
  StrategicModeTrigger,
};
