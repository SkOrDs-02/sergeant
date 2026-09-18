/**
 * HubSearch — Hit → Expo-Router href mapper.
 *
 * Web routes hits via `react-router-dom` + an `openHubModuleWithAction`
 * DOM-event bus. On mobile we instead resolve `Hit.target` to a typed
 * Expo-Router `Href` and let the caller `router.push(...)`. Pure +
 * stateless so the routing rules stay unit-testable.
 */

import type { Href } from "expo-router";

import type { Hit, HubModuleId } from "./searchTypes";

const MODULE_ROUTES: Record<HubModuleId, string> = {
  finyk: "/(tabs)/finyk",
  fizruk: "/(tabs)/fizruk",
  routine: "/(tabs)/routine",
  nutrition: "/(tabs)/nutrition",
};

/**
 * Resolve a hit's target to a typed Expo Router `Href` so the caller can
 * `router.push(...)`. Returns `null` when no route push is needed (the
 * inline AI rail handles `ai-handoff` without a navigation event).
 *
 * `action` hits land the user on the module root for now — surfacing
 * the same primary-action modal the bento's «+ Витрата» / «+ Тренування»
 * buttons trigger lives in a follow-up, once the modules expose a
 * stable intent contract.
 */
export function hrefForHit(hit: Hit): Href | null {
  switch (hit.target.kind) {
    case "module":
      return MODULE_ROUTES[hit.target.moduleId] as Href;
    case "action":
      return MODULE_ROUTES[hit.target.moduleId] as Href;
    case "settings":
      return "/settings" as Href;
    case "assistant":
      return "/assistant" as Href;
    case "ai-handoff":
      // Inline rail handles `ai-handoff` without navigating away.
      return null;
  }
}
