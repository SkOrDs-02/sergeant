/**
 * @scaffolded
 * @status Scaffolded
 * @owner @Skords-01
 * @nextStep Have the App router import `FinykApp` from `@finyk` (instead of
 *           the deep `./FinykApp` lazy anchor) and delete this tag. See
 *           AGENTS.md → Hard Rule #10.
 *
 * Scaffolded barrel — knip reports zero importers because cross-module
 * consumers go through `@finyk/utils` / `@finyk/constants` deep paths and
 * the router keeps its `React.lazy()` chunk anchor. Do NOT delete as part
 * of dead-code cleanup — see Hard Rule #10 in AGENTS.md.
 *
 * Public entry point for the Finyk module — declared API surface for
 * cross-module consumers. See AGENTS.md → Hard Rule #10.
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
