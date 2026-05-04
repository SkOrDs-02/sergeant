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
} from "@shared/components/layout";
import { cn } from "@shared/lib/ui/cn";
import { ROUTINE_THEME as C } from "./lib/routineConstants";

export interface RoutineHeaderProps {
  onBackToHub?: () => void;
}

export function RoutineHeader({ onBackToHub }: RoutineHeaderProps) {
  return (
    <ModuleHeader
      module="routine"
      left={
        typeof onBackToHub === "function" ? (
          <ModuleHeaderBackButton onClick={onBackToHub} />
        ) : (
          <div
            className={cn(
              "shrink-0 w-10 h-10 rounded-xl flex items-center justify-center border",
              C.iconBox,
            )}
            aria-hidden
          >
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.6"
              aria-hidden
            >
              <rect x="3" y="4" width="18" height="18" rx="2" />
              <path d="M8 14h.01M12 14h.01M16 14h.01" />
            </svg>
          </div>
        )
      }
      title="РУТИНА"
      subtitle="Звички · план Фізрука · один розклад"
      right={<ModuleHeaderAssistantButton />}
    />
  );
}
