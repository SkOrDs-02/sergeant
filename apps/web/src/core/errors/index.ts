/**
 * @scaffolded
 * @owner @Skords-01
 * @nextStep Wire `ServerErrorPage` into the top-level error boundary
 *           (`apps/web/src/core/App.tsx`) and `OfflinePage` into
 *           `StandaloneRoutes.tsx` / the SW offline navigation fallback
 *           (`sw.ts`). Once consumers import through this barrel, drop the
 *           tag.
 *
 * Public entry point for the canonical error/empty-state surfaces. See
 * AGENTS.md → Hard Rule #10.
 */
export { NotFoundPage } from "./NotFoundPage";
export type { NotFoundPageProps } from "./NotFoundPage";
export { ServerErrorPage } from "./ServerErrorPage";
export type { ServerErrorPageProps } from "./ServerErrorPage";
export { OfflinePage } from "./OfflinePage";
