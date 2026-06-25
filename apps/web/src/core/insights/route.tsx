/**
 * Last validated: 2026-06-15
 * Status: Active
 */
import { SuspenseWithMinDelay } from "@shared/components/ui/SuspenseWithMinDelay";
import { messages } from "@shared/i18n/uk";
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
      {/*
        Page heading for the standalone `/insights` route. `HubReports`
        leads with the period control and ships no heading of its own
        (it also renders as the "Звіти" tab on Hub home, so the title
        lives here at the route level rather than inside the shared
        component — adding it there would emit a duplicate h1 on the Hub).
        Visually hidden: the design intentionally leads with the period
        segmented control, but screen-reader users still get a labelled
        landmark + an h1 to navigate by.
      */}
      <h1 className="sr-only">{messages.nav.reports}</h1>
      <SuspenseWithMinDelay fallback={<PageLoader />}>
        <HubReports />
      </SuspenseWithMinDelay>
    </main>
  );
}
