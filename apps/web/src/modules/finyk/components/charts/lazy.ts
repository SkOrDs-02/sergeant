import { lazyImport } from "../../../../core/lib/lazyImport";

// Lazy-loaded chart components for the finyk module.
// Keeps heavy chart code out of the initial dashboard bundle so the first
// render of Overview / Analytics / Budgets is faster. Each wrapper re-exports
// the original named component via a default export adapter so existing props
// and rendering logic stay untouched.

export const NetworthChart = lazyImport(
  () => import("../NetworthChart"),
  "NetworthChart",
);

export const CategoryPieChart = lazyImport(
  () => import("../analytics/CategoryPieChart"),
  "CategoryPieChart",
);
