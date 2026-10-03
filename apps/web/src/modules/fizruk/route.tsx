import { ModulePageLoader } from "@shared/components/ui/ModulePageLoader";
import { SuspenseWithMinDelay } from "@shared/components/ui/SuspenseWithMinDelay";
import { lazyDefault } from "../../core/lib/lazyImport";
import { ModuleShell } from "../../core/app/ModuleShell";
import { useHubShell } from "../../core/app/HubShellContext";

const FizrukApp = lazyDefault(() => import("./FizrukApp"));

/**
 * Lazy route entry for `/fizruk/*` (initiative 0006 Phase 5).
 */
export function Component() {
  const {
    goBackOrHub,
    goToHub,
    goToModuleSettings,
    openModule,
    pwaAction,
    clearPwaAction,
  } = useHubShell();

  return (
    <ModuleShell moduleId="fizruk">
      <SuspenseWithMinDelay
        fallback={<ModulePageLoader module="fizruk" />}
        className="flex-1 min-h-0 flex flex-col"
      >
        <FizrukApp
          onBackToHub={goBackOrHub}
          onGoToHub={goToHub}
          onOpenSettings={() => goToModuleSettings("fizruk")}
          onOpenModule={openModule}
          pwaAction={pwaAction}
          onPwaActionConsumed={clearPwaAction}
        />
      </SuspenseWithMinDelay>
    </ModuleShell>
  );
}
