/**
 * Route Prefetch System
 *
 * Intelligently prefetches route chunks on:
 * - Idle time (requestIdleCallback)
 * - Hover/focus over navigation elements
 * - Visibility in viewport (IntersectionObserver)
 *
 * Uses dynamic imports matching lazy() definitions in App.tsx to ensure
 * the same chunks are loaded.
 *
 * Hover/focus handlers for dashboard cards live in
 * `intentPrefetch.ts` — that file holds a runtime registry which we
 * populate below. The split exists so that strict-scope hub files
 * can call `getModulePrefetchProps` without transitively pulling
 * `import("../../modules/fizruk/...")` into their type-check program.
 */

import { setModulePrefetcher } from "./intentPrefetch";

type ModuleKey = "finyk" | "fizruk" | "routine" | "nutrition";
type PageKey =
  | "auth"
  | "profile"
  | "pricing"
  | "assistant"
  | "resetPassword"
  | "design";

// Map of lazy imports matching App.tsx definitions
const moduleImports: Record<ModuleKey, () => Promise<unknown>> = {
  finyk: () => import("../../modules/finyk/FinykApp"),
  fizruk: () => import("../../modules/fizruk/FizrukApp"),
  routine: () => import("../../modules/routine/RoutineApp"),
  nutrition: () => import("../../modules/nutrition/NutritionApp"),
};

const pageImports: Record<PageKey, () => Promise<unknown>> = {
  auth: () => import("../auth/AuthPage"),
  profile: () => import("../profile/ProfilePage"),
  pricing: () => import("../PricingPage"),
  assistant: () => import("../AssistantCataloguePage"),
  resetPassword: () => import("../auth/ResetPasswordPage"),
  design: () => import("../DesignShowcase"),
};

// Track prefetched chunks to avoid redundant loads
const prefetchedChunks = new Set<string>();

/**
 * Prefetch a module chunk by key
 */
export function prefetchModule(module: ModuleKey): void {
  if (prefetchedChunks.has(`module:${module}`)) return;

  const importFn = moduleImports[module];
  if (!importFn) return;

  prefetchedChunks.add(`module:${module}`);

  // Use requestIdleCallback for non-blocking prefetch
  if ("requestIdleCallback" in window) {
    requestIdleCallback(
      () => {
        importFn().catch(() => {
          // Silently fail - user will see normal loading if they navigate
          prefetchedChunks.delete(`module:${module}`);
        });
      },
      { timeout: 2000 },
    );
  } else {
    // Fallback for Safari
    setTimeout(() => {
      importFn().catch(() => {
        prefetchedChunks.delete(`module:${module}`);
      });
    }, 100);
  }
}

/**
 * Prefetch a page chunk by key
 */
export function prefetchPage(page: PageKey): void {
  if (prefetchedChunks.has(`page:${page}`)) return;

  const importFn = pageImports[page];
  if (!importFn) return;

  prefetchedChunks.add(`page:${page}`);

  if ("requestIdleCallback" in window) {
    requestIdleCallback(
      () => {
        importFn().catch(() => {
          prefetchedChunks.delete(`page:${page}`);
        });
      },
      { timeout: 2000 },
    );
  } else {
    setTimeout(() => {
      importFn().catch(() => {
        prefetchedChunks.delete(`page:${page}`);
      });
    }, 100);
  }
}

/**
 * Prefetch all primary modules on idle
 *
 * Schedules each module on its own idle callback rather than wall-clock
 * `setTimeout(index * 500)` slots. Wall-clock staggering hides network
 * congestion at the cost of always-blocking 2 s of bandwidth on every
 * load — even on a snappy main thread. Idle scheduling lets the browser
 * pace the prefetches against real CPU/network pressure: on fast
 * devices the four modules land back-to-back, on slow ones the
 * scheduler defers the tail of the queue until the user actually has
 * spare time. The internal `prefetchModule` already wraps each import
 * in its own `requestIdleCallback`, so this is staggering of
 * staggering — the priority order is preserved by the order of calls,
 * but no module starves on a busy main thread.
 *
 * Falls back to a single `setTimeout(0)` chain on Safari (no
 * `requestIdleCallback`); a 100 ms tail keeps total wall-clock cost
 * under the previous 2 s envelope while still draining the queue
 * eagerly when nothing else is happening.
 */
export function prefetchCriticalModules(): void {
  // Order by usage probability
  const priority: ModuleKey[] = ["finyk", "routine", "fizruk", "nutrition"];

  if ("requestIdleCallback" in window) {
    priority.forEach((module) => {
      requestIdleCallback(() => prefetchModule(module), { timeout: 3000 });
    });
    return;
  }
  priority.forEach((module, index) => {
    setTimeout(() => prefetchModule(module), index * 100);
  });
}

/**
 * Register the intent-prefetch dispatcher so hover/focus handlers in
 * `intentPrefetch.ts` can reach `prefetchModule` without taking a
 * direct import on this file. Runs once at module init — `App.tsx`
 * imports this module synchronously at startup, well before any
 * dashboard card mounts.
 */
setModulePrefetcher((module) => prefetchModule(module));

export function getPagePrefetchProps(page: PageKey) {
  return {
    onMouseEnter: () => prefetchPage(page),
    onFocus: () => prefetchPage(page),
  };
}

/**
 * Check if a chunk is already prefetched
 */
export function isModulePrefetched(module: ModuleKey): boolean {
  return prefetchedChunks.has(`module:${module}`);
}

export function isPagePrefetched(page: PageKey): boolean {
  return prefetchedChunks.has(`page:${page}`);
}
