/**
 * Intent-prefetch handlers (decoupled).
 *
 * `useRoutePrefetch.ts` owns the static `import("../../modules/...")`
 * factories. Importing it from a strict-scope file (e.g. anything under
 * `src/core/hub/**`) drags the entire module subgraph — including
 * `Workouts.tsx` and `FizrukHeader.tsx` — into `tsconfig.strict.json`'s
 * type-check program, surfacing pre-existing strict-null errors that
 * the per-module `include` whitelist deliberately keeps out of scope.
 *
 * To add intent-prefetch on dashboard cards without dragging fizruk
 * types into hub's strict program, this file:
 *
 *  1. Holds a runtime registry of the actual prefetch function.
 *  2. Exposes `getModulePrefetchProps(id)` returning hover/focus
 *     handlers that consult the registry at event time.
 *
 * `useRoutePrefetch.ts` is the only registrar (called once at module
 * init); it is loaded synchronously by `App.tsx`, so the registry is
 * populated before any dashboard card mounts. If for any reason the
 * registrar hasn't run yet, the handlers no-op silently — intent-
 * prefetch is best-effort, not a correctness guarantee.
 */

export type IntentPrefetchModuleId =
  | "finyk"
  | "fizruk"
  | "routine"
  | "nutrition";

type Prefetcher = (id: IntentPrefetchModuleId) => void;

let registered: Prefetcher | null = null;

export function setModulePrefetcher(fn: Prefetcher): void {
  registered = fn;
}

export interface ModuleIntentProps {
  onMouseEnter: () => void;
  onFocus: () => void;
}

export function getModulePrefetchProps(
  id: IntentPrefetchModuleId,
): ModuleIntentProps {
  return {
    onMouseEnter: () => registered?.(id),
    onFocus: () => registered?.(id),
  };
}
