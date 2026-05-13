/**
 * @status Deprecated
 * @owner @Skords-01
 *
 * Re-export shim — the canonical implementation moved to
 * `apps/web/src/core/errors/NotFoundPage.tsx` (Track 8, EmptyState polish).
 * Kept so existing lazy-import sites (`StandaloneRoutes.tsx`, etc.) resolve
 * without a coordinated rename.
 */
export { NotFoundPage } from "./errors/NotFoundPage";
