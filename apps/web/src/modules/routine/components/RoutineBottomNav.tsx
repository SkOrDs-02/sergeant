import type { ReactNode } from "react";
import {
  ModuleBottomNav,
  type ModuleBottomNavItem,
} from "@shared/components/ui/ModuleBottomNav";
import { messages } from "@shared/i18n/uk";
// `RoutineMainTab` живе у `../context/RoutineCalendarContext` (там решта
// routine view-state типів). Імпортуємо звідти, щоб не дублювати оголошення
// (aislop `ai-slop/duplicate-type-declaration`).
import type { RoutineMainTab } from "../context/RoutineCalendarContext";

interface RoutineNavItem extends ModuleBottomNavItem {
  id: RoutineMainTab;
  icon: ReactNode;
}

const NAV: readonly RoutineNavItem[] = [
  {
    id: "calendar",
    label: "Огляд",
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
}

export function RoutineBottomNav({
  mainTab,
  onSelectTab,
}: RoutineBottomNavProps) {
  // The bespoke center-docked "+" FAB (Sergeant v2 PR-8, locked spec §3.2),
  // including its keyboard-open hide wiring, was replaced by the shared
  // `FloatingActionButton` (variant="v2-routine", bottom-right, mounted in
  // `RoutineActions.tsx`) as part of the fab-and-manual-income spec's
  // cross-module FAB placement unification — Routine's center-over-nav
  // position was exactly the "неконсистентне розміщення" that spec calls
  // out. The keyboard-hide behaviour itself now lives in the shared FAB
  // component (mirrors `ModuleBottomNav`'s own `useVisualKeyboardInset`),
  // so every module gets it, not just Routine.
  return (
    <ModuleBottomNav
      items={NAV}
      activeId={mainTab}
      onChange={(id) => onSelectTab(id as RoutineMainTab)}
      module="routine"
      role="tablist"
      ariaLabel={messages.nav.routineSections}
    />
  );
}
