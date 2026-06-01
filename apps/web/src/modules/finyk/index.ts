/**
 * Public entry point for the Finyk module — declared API surface for
 * cross-module consumers. See AGENTS.md → Hard Rule #10. Status: Active.
 *
 * Cross-module consumers (hub-reports aggregation, ExpensesCard, insights,
 * coach, weekly digest) already import via `@finyk/utils`,
 * `@finyk/constants`, `@finyk/lib/*`. The App router (`ActiveModuleView`)
 * keeps the deep `./FinykApp` import as a `React.lazy()` chunk-boundary
 * anchor — routing via `@finyk` would pull the whole barrel into the
 * lazy chunk and broaden the per-route code-split. Intentional asymmetry,
 * not pending work.
 *
 * Deep imports (`@finyk/utils`, `@finyk/constants`) remain recommended
 * for intra-module use and tree-shaking-sensitive call sites.
 */

export { default as FinykApp } from "./FinykApp";
