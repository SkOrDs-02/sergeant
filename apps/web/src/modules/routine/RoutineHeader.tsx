/**
 * Routine module header bar.
 *
 * Split out of `RoutineApp.tsx` as part of the Phase 2 decomposition
 * (initiative 0001). Renders the standard `<ModuleHeader>` for the
 * Routine module: «додому» ліворуч (або статична іконка без хаба), назва
 * як перемикач модулів, праворуч Сержант.
 */

import {
  ModuleHeader,
  ModuleHeaderAssistantButton,
  ModuleHeaderHubButton,
} from "@shared/components/layout";
import { Icon } from "@shared/components/ui/Icon";

export interface RoutineHeaderProps {
  onGoToHub?: (() => void) | undefined;
  onOpenSettings?: (() => void) | undefined;
}

export function RoutineHeader({
  onGoToHub,
  onOpenSettings,
}: RoutineHeaderProps) {
  return (
    <ModuleHeader
      module="routine"
      switcher="routine"
      onOpenSettings={onOpenSettings}
      left={
        typeof onGoToHub === "function" ? (
          <ModuleHeaderHubButton onClick={onGoToHub} />
        ) : (
          <Icon name="calendar" size="xl" className="text-muted" aria-hidden />
        )
      }
      title="Рутина"
      right={<ModuleHeaderAssistantButton />}
    />
  );
}
