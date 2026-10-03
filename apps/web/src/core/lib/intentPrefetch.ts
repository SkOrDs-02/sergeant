/**
 * Intent-prefetch handlers (decoupled).
 *
 * `useRoutePrefetch.ts` owns the static `import("../../modules/...")`
 * factories. Hub dashboard cards need hover/focus prefetch handlers
 * but must not import the module subgraph statically — that would
 * defeat the route-level code split (Workouts/FizrukHeader/etc. would
 * land in the hub chunk).
 *
 * To add intent-prefetch on dashboard cards without dragging module
 * code into the hub bundle, this file:
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
  "finyk" | "fizruk" | "routine" | "nutrition";

type Prefetcher = (id: IntentPrefetchModuleId) => void;

let registered: Prefetcher | null = null;

export function setModulePrefetcher(fn: Prefetcher): void {
  registered = fn;
}

export interface ModuleIntentProps {
  onMouseEnter: () => void;
  onFocus: () => void;
  /**
   * Touch entry point. `onMouseEnter`/`onFocus` never fire on a coarse
   * (touch) pointer, so without this a hub tile tapped on mobile — the
   * majority of module entries — got zero prefetch head start: the tap
   * goes straight to `onClick`/navigate against a cold module chunk,
   * and since react-router v7 wraps the update in `startTransition`,
   * the screen shows no visible change until the chunk lands ("кнопки
   * клікаються, але сторінка не перемикається" — see the AI-CONTEXT
   * note on `lazyImport.ts`). `pointerdown` fires ~100 ms before
   * `click`, same mitigation `getPagePrefetchProps` already uses.
   */
  onPointerDown: () => void;
}

export function getModulePrefetchProps(
  id: IntentPrefetchModuleId,
): ModuleIntentProps {
  return {
    onMouseEnter: () => registered?.(id),
    onFocus: () => registered?.(id),
    onPointerDown: () => registered?.(id),
  };
}
