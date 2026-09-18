import { ModulePageLoader } from "@shared/components/ui/ModulePageLoader";
import { SuspenseWithMinDelay } from "@shared/components/ui/SuspenseWithMinDelay";
import { lazyDefault } from "../../core/lib/lazyImport";
import { ModuleShell } from "../../core/app/ModuleShell";
import { useHubShell } from "../../core/app/HubShellContext";

const RoutineApp = lazyDefault(() => import("./RoutineApp"));

/**
 * Lazy route entry for `/routine/*` (initiative 0006 Phase 5).
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
    <ModuleShell moduleId="routine">
      <SuspenseWithMinDelay
        fallback={<ModulePageLoader module="routine" />}
        className="flex-1 min-h-0 flex flex-col"
      >
        <RoutineApp
          onBackToHub={goBackOrHub}
          onGoToHub={goToHub}
          onOpenSettings={() => goToModuleSettings("routine")}
          onOpenModule={openModule}
          pwaAction={pwaAction}
          onPwaActionConsumed={clearPwaAction}
        />
      </SuspenseWithMinDelay>
    </ModuleShell>
  );
}
