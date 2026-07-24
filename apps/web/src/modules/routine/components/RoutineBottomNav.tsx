import type { ReactNode } from "react";
import { useVisualKeyboardInset } from "@sergeant/shared";
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
  onAddHabit?: () => void;
}

export function RoutineBottomNav({
  mainTab,
  onSelectTab,
  onAddHabit,
}: RoutineBottomNavProps) {
  // Sergeant v2 (PR-8) — center FAB rendered as a sibling of the
  // floating-pill `ModuleBottomNav`, NOT nested inside it. The nav now
  // owns its own glass pill + safe-area-pb; positioning the FAB inside
  // would clip it under `overflow-hidden` and double-shadow it on the
  // pill bezel. As a sibling at `z-40` it sits above the nav's stacking
  // context and overlaps the pill's top edge by ~22 px so it reads as
  // "floating above the dock", matching the v2 module-hero language.
  //
  // Keyboard-open hide (keyboard-and-scroll.md § design decision 2):
  // `ModuleBottomNav` hides itself, but the FAB is a sibling — not a
  // child — of that nav, so it needs the same signal to slide away
  // together instead of floating alone once the pill it sits above is
  // gone.
  const kbInsetPx = useVisualKeyboardInset(true);
  const hidden = kbInsetPx > 0;

  return (
    <div className="relative shrink-0">
      <ModuleBottomNav
        items={NAV}
        activeId={mainTab}
        onChange={(id) => onSelectTab(id as RoutineMainTab)}
        module="routine"
        role="tablist"
        ariaLabel={messages.nav.routineSections}
      />
      {onAddHabit && (
        <button
          type="button"
          onClick={onAddHabit}
          aria-label="Додати звичку"
          aria-hidden={hidden || undefined}
          tabIndex={hidden ? -1 : undefined}
          className={[
            // `-top-[22px]` lifts the FAB above the pill's top edge by
            // 22 px (per locked spec §3.2). `z-40` clears the nav's
            // `z-30` wrapper. `border-bg` punches a halo through the
            // glass pill so the coral disk doesn't read as merged.
            "absolute left-1/2 -translate-x-1/2 -top-[22px]",
            "w-14 h-14 rounded-full z-40",
            "bg-linear-to-br from-coral-600 to-coral-700 text-white",
            // Light keeps the drop shadow; dark «Чорнило» swaps it for a
            // luminescent coral glow (spec § 4: FAB = accent + glow 24px/40%).
            "shadow-float dark:shadow-glow-fab-coral border-4 border-bg",
            "flex items-center justify-center",
            "transition-transform duration-150 active:scale-95 hover:scale-[1.04]",
            "focus:outline-none focus-visible:ring-2 focus-visible:ring-focus/50 focus-visible:ring-offset-2 focus-visible:ring-offset-panel",
            hidden && "translate-y-full pointer-events-none",
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
