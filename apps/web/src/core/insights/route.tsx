/**
 * Last validated: 2026-06-15
 * Status: Active
 */
import { SuspenseWithMinDelay } from "@shared/components/ui/SuspenseWithMinDelay";
import { lazyImport } from "../lib/lazyImport";
import { PageLoader } from "../app/PageLoader";

const HubReports = lazyImport(() => import("../hub/HubReports"), "HubReports");

/**
 * Lazy route entry for `/insights/*` (initiative 0006 — migrated off the
 * catch-all `path:"*"` HubPage).
 *
 * Exported as `Component` so React Router 7's `lazy()` picks it up, mirroring
 * the per-module route entries (`modules/<mod>/route.tsx`). The insights
 * surface (`HubReports` + its per-domain lazy cards) loads on demand.
 */
export function Component() {
  return (
    <main
      id="main"
      tabIndex={-1}
      className="max-w-lg mx-auto w-full px-5 pt-3 pb-28 outline-none page-enter"
    >
      <SuspenseWithMinDelay fallback={<PageLoader />}>
        <HubReports />
      </SuspenseWithMinDelay>
    </main>
  );
}
