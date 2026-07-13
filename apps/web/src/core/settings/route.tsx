/**
 * Last validated: 2026-06-15
 * Status: Active
 */
import { useState } from "react";
import { SuspenseWithMinDelay } from "@shared/components/ui/SuspenseWithMinDelay";
import { lazyImport } from "../lib/lazyImport";
import { PageLoader } from "../app/PageLoader";
import { useHubShell } from "../app/HubShellContext";

const HubSettingsPage = lazyImport(
  () => import("../hub/HubSettingsPage"),
  "HubSettingsPage",
);

/**
 * Lazy route entry for `/settings/*` (initiative 0006 — migrated off the
 * catch-all `path:"*"` HubPage).
 *
 * Exported as `Component` so React Router 7's `lazy()` picks it up, mirroring
 * the per-module route entries (`modules/<mod>/route.tsx`). The heavy settings
 * surface (`HubSettingsPage` + its lazy module sections) loads on demand; the
 * thin gate here pulls shared state from `useHubShell()`.
 */
export function Component() {
  const { user } = useHubShell();
  const [scrollContainer, setScrollContainer] = useState<HTMLElement | null>(
    null,
  );

  return (
    <main
      ref={setScrollContainer}
      id="main"
      tabIndex={-1}
      className="h-app-dvh overflow-y-auto max-w-lg mx-auto w-full px-5 pb-28 outline-none"
    >
      <SuspenseWithMinDelay fallback={<PageLoader />}>
        <HubSettingsPage user={user} scrollContainer={scrollContainer} />
      </SuspenseWithMinDelay>
    </main>
  );
}
