/**
 * Stage 5b — strategic-mode catalogue.
 *
 * Order matters: the host hook (`hooks/strategic-mode.ts`) iterates this
 * list and the first pattern match wins. Each entry has its own anchored
 * slash prefix so the order is currently irrelevant in practice — PR-1
 * shipped `/plan`, PR-2 added `/analyze`, PR-4 adds `/okr` (the optional
 * docs-split PR-3 introduced no code change). Once all three modes
 * register, Stage 5b is complete and the legacy console primers in
 * `tools/console/src/agents/strategic-modes.ts` can be retired in
 * Stage 7 alongside the drift-gate tests.
 */

import { analyzeMode } from "./analyze.js";
import { okrMode } from "./okr.js";
import { planMode } from "./plan.js";
import type {
  StrategicModeDefinition,
  StrategicModeMatch,
  StrategicModeSlug,
  StrategicModeTrigger,
} from "./types.js";

export const ALL_STRATEGIC_MODES: StrategicModeDefinition[] = [
  planMode,
  analyzeMode,
  okrMode,
];

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

export { analyzeMode, okrMode, planMode };
export type {
  StrategicModeDefinition,
  StrategicModeMatch,
  StrategicModeSlug,
  StrategicModeTrigger,
};
