/**
 * Routine module header bar.
 *
 * Split out of `RoutineApp.tsx` as part of the Phase 2 decomposition
 * (initiative 0001). Renders the standard `<ModuleHeader>` for the
 * Routine module, with either a back-to-Hub button or the static
 * Routine icon as the left slot.
 */

import {
  ModuleHeader,
  ModuleHeaderAssistantButton,
  ModuleHeaderBackButton,
  ModuleHeaderHubButton,
} from "@shared/components/layout";
import { Icon } from "@shared/components/ui/Icon";

export interface RoutineHeaderProps {
  onBackToHub?: (() => void) | undefined;
  onGoToHub?: (() => void) | undefined;
}

export function RoutineHeader({ onBackToHub, onGoToHub }: RoutineHeaderProps) {
  return (
    <ModuleHeader
      module="routine"
      left={
        typeof onBackToHub === "function" ? (
          <div className="flex items-center gap-1">
            <ModuleHeaderBackButton onClick={onBackToHub} />
            {typeof onGoToHub === "function" && (
              <ModuleHeaderHubButton onClick={onGoToHub} />
            )}
          </div>
        ) : (
          <Icon name="calendar" size="xl" className="text-muted" aria-hidden />
        )
      }
      title="Рутина"
      subtitle="Звички й події"
      right={<ModuleHeaderAssistantButton />}
    />
  );
}
