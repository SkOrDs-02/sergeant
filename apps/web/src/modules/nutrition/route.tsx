import { ModulePageLoader } from "@shared/components/ui/ModulePageLoader";
import { SuspenseWithMinDelay } from "@shared/components/ui/SuspenseWithMinDelay";
import { lazyDefault } from "../../core/lib/lazyImport";
import { ModuleShell } from "../../core/app/ModuleShell";
import { useHubShell } from "../../core/app/HubShellContext";

const NutritionApp = lazyDefault(() => import("./NutritionApp"));

/**
 * Lazy route entry for `/nutrition/*` (initiative 0006 Phase 5).
 */
export function Component() {
  const { goToHub, goToModuleSettings, pwaAction, clearPwaAction } =
    useHubShell();

  return (
    <ModuleShell moduleId="nutrition">
      <SuspenseWithMinDelay fallback={<ModulePageLoader module="nutrition" />}>
        <NutritionApp
          onBackToHub={goToHub}
          onOpenSettings={() => goToModuleSettings("nutrition")}
          pwaAction={pwaAction}
          onPwaActionConsumed={clearPwaAction}
        />
      </SuspenseWithMinDelay>
    </ModuleShell>
  );
}
