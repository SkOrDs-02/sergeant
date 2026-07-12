import { ModulePageLoader } from "@shared/components/ui/ModulePageLoader";
import { SuspenseWithMinDelay } from "@shared/components/ui/SuspenseWithMinDelay";
import { lazyDefault } from "../../core/lib/lazyImport";
import { ModuleShell } from "../../core/app/ModuleShell";
import { useHubShell } from "../../core/app/HubShellContext";

const FinykApp = lazyDefault(() => import("./FinykApp"));

/**
 * Lazy route entry for `/finyk/*` (initiative 0006 Phase 5).
 *
 * Exported as `Component` so React Router 7's `lazy()` picks it up.
 * Renders `ModuleShell` (shared UI) + `FinykApp` (domain UI).
 */
export function Component() {
  const { goBackOrHub, goToModuleSettings, pwaAction, clearPwaAction } =
    useHubShell();

  return (
    <ModuleShell moduleId="finyk">
      <SuspenseWithMinDelay fallback={<ModulePageLoader module="finyk" />}>
        <FinykApp
          onBackToHub={goBackOrHub}
          onOpenSettings={() => goToModuleSettings("finyk")}
          pwaAction={pwaAction}
          onPwaActionConsumed={clearPwaAction}
        />
      </SuspenseWithMinDelay>
    </ModuleShell>
  );
}
