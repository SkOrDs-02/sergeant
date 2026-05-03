import type { ReactNode } from "react";
import {
  ModuleBottomNav,
  type ModuleBottomNavItem,
} from "@shared/components/ui/ModuleBottomNav";

export type RoutineMainTab = "calendar" | "stats";

interface RoutineNavItem extends ModuleBottomNavItem {
  id: RoutineMainTab;
  icon: ReactNode;
}

const NAV: readonly RoutineNavItem[] = [
  {
    id: "calendar",
    label: "Календар",
    panelId: "routine-panel-calendar",
    icon: (
      <svg
        width="22"
        height="22"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden
      >
        <rect x="3" y="4" width="18" height="18" rx="2" />
        <line x1="16" y1="2" x2="16" y2="6" />
        <line x1="8" y1="2" x2="8" y2="6" />
        <line x1="3" y1="10" x2="21" y2="10" />
      </svg>
    ),
  },
  {
    id: "stats",
    label: "Статистика",
    panelId: "routine-panel-stats",
    icon: (
      <svg
        width="22"
        height="22"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden
      >
        <line x1="6" y1="20" x2="6" y2="12" />
        <line x1="12" y1="20" x2="12" y2="4" />
        <line x1="18" y1="20" x2="18" y2="9" />
      </svg>
    ),
  },
];

export interface RoutineBottomNavProps {
  mainTab: RoutineMainTab;
  onSelectTab: (tab: RoutineMainTab) => void;
  onAddHabit?: () => void;
}

export function RoutineBottomNav({
  mainTab,
  onSelectTab,
  onAddHabit,
}: RoutineBottomNavProps) {
  return (
    <div className="relative shrink-0">
      <ModuleBottomNav
        items={NAV}
        activeId={mainTab}
        onChange={(id) => onSelectTab(id as RoutineMainTab)}
        module="routine"
        role="tablist"
        ariaLabel="Розділи Рутини"
      />
      {onAddHabit && (
        <button
          type="button"
          onClick={onAddHabit}
          aria-label="Додати звичку"
          className={[
            "absolute left-1/2 -translate-x-1/2 -top-6",
            "w-14 h-14 rounded-full z-40",
            "bg-linear-to-br from-coral-400 to-coral-500 text-white",
            "shadow-float border-4 border-bg",
            "flex items-center justify-center",
            "transition-transform duration-150 active:scale-95 hover:scale-[1.04]",
            "focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/50 focus-visible:ring-offset-2 focus-visible:ring-offset-panel",
          ].join(" ")}
        >
          <svg
            width="26"
            height="26"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.4"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden
          >
            <line x1="12" y1="5" x2="12" y2="19" />
            <line x1="5" y1="12" x2="19" y2="12" />
          </svg>
        </button>
      )}
    </div>
  );
}
