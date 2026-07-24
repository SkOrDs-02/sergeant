/**
 * HubSearch — mobile-specific Hit shape.
 *
 * Mirrors `apps/web/src/core/hub/search/searchTypes.ts` minus the
 * `action` / `ai-handoff` web-only target kinds. On mobile we route via
 * Expo Router (see `hubSearchNav.ts`) and resolve module-action intents
 * to the destination route directly — there is no `openHubModuleWithAction`
 * DOM-event bus, so action hits dispatch to the module root with a
 * follow-up `?intent=add_meal`-style search param in a future PR. The
 * current AI rail target maps to `ai-handoff` which calls
 * `apiClient.chat.send` inline.
 */

import type { AssistantCapability } from "@sergeant/shared";

import { scoreMatch } from "./hubSearchRecents";

export type SearchSurface =
  | "finyk"
  | "fizruk"
  | "routine"
  | "nutrition"
  | "settings"
  | "assistant"
  | "actions"
  | "ai";

export type HubModuleId = "finyk" | "fizruk" | "routine" | "nutrition";

export type HubModuleAction =
  | "add_expense"
  | "start_workout"
  | "add_meal"
  | "add_habit";

export type Hit = {
  id: string;
  module: SearchSurface;
  moduleLabel: string;
  title: string;
  subtitle: string;
  icon: string;
  /** Where the hit dispatches when activated. */
  target:
    | { kind: "module"; moduleId: HubModuleId }
    | { kind: "settings"; sectionId?: string }
    | { kind: "assistant"; capability?: AssistantCapability }
    | { kind: "action"; moduleId: HubModuleId; action: HubModuleAction }
    | { kind: "ai-handoff"; query: string };
  _score: number;
};

/**
 * Append a candidate hit to `acc` if it scores ≥ 0 against `tokens`,
 * stopping the caller's loop when the per-source `limit` is reached.
 * Returns `true` once the limit is hit so callers can break early.
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
