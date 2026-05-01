import type { ModuleAccent } from "@sergeant/design-tokens";
import type { AssistantCapability } from "@sergeant/shared";
import { scoreMatch } from "../hubSearchEngine";

/**
 * `module` is the visual grouping/colour key. Real modules use the
 * `ModuleAccent` palette; the two pseudo-modules ("settings" and
 * "assistant") render with their own neutral swatches and route to
 * different navigation targets (`?tab=settings` / `/assistant`).
 */
export type SearchSurface = ModuleAccent | "settings" | "assistant";

export type Hit = {
  id: string;
  module: SearchSurface;
  moduleLabel: string;
  title: string;
  subtitle: string;
  icon: string;
  /** Where the hit dispatches when activated. */
  target:
    | { kind: "module"; moduleId: string }
    | { kind: "settings"; sectionId?: string }
    | { kind: "assistant"; capability?: AssistantCapability };
  _score: number;
};

/**
 * Append a candidate hit to `acc` if it scores ≥ 0 against `tokens`,
 * stopping the caller's loop when the per-source `limit` is reached.
 * Returns `true` once the limit is hit so callers can break early —
 * critical for the Finyk tx cache which can be several MB and would
 * otherwise score every transaction on every keystroke.
 */
export function pushScored(
  acc: Hit[],
  base: Omit<Hit, "_score">,
  tokens: string[],
  limit: number,
): boolean {
  const s = scoreMatch(base, tokens);
  if (s < 0) return acc.length >= limit;
  acc.push({ ...base, _score: s });
  return acc.length >= limit;
}

/** YYYY-MM-DD in local time. Shared by every per-module source. */
export function localDateKey(d = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
