/**
 * Last validated: 2026-08-01
 * Status: Active
 *
 * Lazy Finyk page chunks + their warm-up plumbing.
 *
 * Split out of `FinykApp.tsx` to keep that module under Hard Rule #18
 * (`max-lines: 600`) and to give the preloading policy one home.
 *
 * AI-CONTEXT: react-router v7 runs navigations inside `React.startTransition`,
 * and a transition deliberately keeps the current screen mounted rather than
 * revealing a newly-mounted Suspense fallback. A tab whose chunk is still cold
 * therefore gives the user *no feedback at all* — no spinner, no page change —
 * for the whole download: the reported «клікаються, але не перемикається
 * сторінка», intermittent because a warm chunk commits instantly (founder
 * report 2026-07-31). Warming on pointer-down and at idle removes the wait in
 * practice; the optimistic highlight in `ModuleBottomNav` covers the rest.
 *
 * Import the concrete page modules, not the folders: the
 * `pages/{transactions,budgets}/index.ts` barrels were removed as dead code in
 * #3504 (Knip can't see dynamic directory imports), which left those imports
 * unresolved and broke the Vercel production build.
 */
import { useEffect } from "react";
import { lazyImport } from "../../../core/lib/lazyImport";
import { CategoryPieChart } from "../components/charts/lazy";

export const Transactions = lazyImport(
  () => import("./transactions/Transactions"),
  "Transactions",
);
export const Budgets = lazyImport(() => import("./budgets/Budgets"), "Budgets");
export const Assets = lazyImport(() => import("./Assets"), "Assets");
export const Analytics = lazyImport(() => import("./Analytics"), "Analytics");

/** Page-id → chunk warmer. `overview` is eagerly imported, so it has no entry. */
const PAGE_PRELOADERS: Record<string, () => void> = {
  transactions: () => Transactions.preload(),
  budgets: () => Budgets.preload(),
  // Analytics page shell AND its nested `CategoryPieChart` chunk (own
  // `React.lazy` boundary, `components/charts/lazy.ts`) both need to be
  // warm before the tab commits — otherwise the page-level chunk lands in
  // time but the donut chart still suspends on mount, so the transition
  // (and the nav pill it runs alongside) hitches on the second, un-warmed
  // chunk fetch+parse. Founder report 2026-08-28: half-second freeze on
  // tap/swipe into "Аналітика".
  analytics: () => {
    Analytics.preload();
    CategoryPieChart.preload();
  },
  assets: () => Assets.preload(),
};

/** Start the chunk fetch for a Finyk page id. No-op for unknown / eager ids. */
export function preloadFinykPage(id: string): void {
  PAGE_PRELOADERS[id]?.();
}

/**
 * Warm every sibling page chunk once the module goes idle, so the first tap on
 * any tab commits instantly. Runs off the critical path —
 * `requestIdleCallback` where available, a short timeout on Safari, which
 * lacks it.
 */
export function useWarmFinykPages(pageIds: readonly string[]): void {
  useEffect(() => {
    if (typeof window === "undefined") return;
    const warm = () => {
      for (const id of pageIds) preloadFinykPage(id);
    };
    if (typeof window.requestIdleCallback === "function") {
      const handle = window.requestIdleCallback(warm, { timeout: 3000 });
      return () => window.cancelIdleCallback?.(handle);
    }
    const timer = window.setTimeout(warm, 1500);
    return () => window.clearTimeout(timer);
  }, [pageIds]);
}
