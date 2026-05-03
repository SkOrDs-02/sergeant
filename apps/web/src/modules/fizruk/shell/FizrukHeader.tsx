import type * as React from "react";
import {
  ModuleHeader,
  ModuleHeaderBackButton,
} from "@shared/components/layout";
import { cn } from "@shared/lib/ui/cn";
import type { FizrukPage } from "./fizrukRoute";

interface ActiveProgramHeaderView {
  name: string;
}

export interface FizrukHeaderProps {
  page: FizrukPage;
  activeProgram?: ActiveProgramHeaderView | null;
  onBackToHub?: () => void;
  onBackToDashboard: () => void;
}

function titleFor(page: FizrukPage): string {
  switch (page) {
    case "atlas":
      return "Атлас тіла";
    case "exercise":
      return "Вправа";
    case "plan":
      return "План";
    case "programs":
      return "Програми";
    case "body":
      return "Моє тіло";
    case "progress":
      return "Прогрес і заміри";
    case "measurements":
      return "Заміри тіла";
    default:
      return "ФІЗРУК";
  }
}

/** The nav item label the user came from — used for contextual back title. */
function backLabelFor(page: FizrukPage): string {
  switch (page) {
    case "atlas":
      return "Моє тіло";
    case "exercise":
      return "Тренування";
    case "measurements":
      return "Прогрес і заміри";
    default:
      return "ФІЗРУК";
  }
}

/** Inline back button with contextual label ("← Моє тіло"). */
function ContextualBackButton({
  label,
  onClick,
}: {
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "-ml-1 flex items-center gap-1 rounded-xl px-2 py-2 min-h-[40px]",
        "text-style-label text-muted hover:text-text hover:bg-panelHi transition-colors",
        "focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/50",
      )}
      aria-label={`Назад до ${label}`}
    >
      <svg
        width="18"
        height="18"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden
      >
        <path d="M15 18l-6-6 6-6" />
      </svg>
      <span className="hidden sm:inline">{label}</span>
    </button>
  );
}

function subtitleFor(
  page: FizrukPage,
  activeProgram?: ActiveProgramHeaderView | null,
): string {
  switch (page) {
    case "plan":
      return "Календар · нагадування · відновлення";
    case "programs":
      return activeProgram
        ? `Активна: ${activeProgram.name}`
        : "Оберіть тренувальну програму";
    case "body":
      return "Вага · сон · самопочуття";
    default:
      return "Тренування · прогрес";
  }
}

function DumbbellBadge() {
  return (
    <div
      className={cn(
        "shrink-0 w-10 h-10 rounded-xl flex items-center justify-center",
        "bg-linear-to-br from-teal-100 to-cyan-100",
        "dark:from-teal-900/40 dark:to-cyan-900/30",
        "text-fizruk-strong dark:text-fizruk",
        "border border-fizruk-soft-border/60",
        "shadow-sm",
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
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M6.5 6.5h11M6.5 17.5h11M3 12h18M6 9l-3 3 3 3M18 9l3 3-3 3" />
      </svg>
    </div>
  );
}

export function FizrukHeader({
  page,
  activeProgram,
  onBackToHub,
  onBackToDashboard,
}: FizrukHeaderProps) {
  const isAtlas = page === "atlas";
  const isExercise = page === "exercise";
  const isMeasurements = page === "measurements";
  const showContextualBack = isAtlas || isExercise || isMeasurements;

  // Module-level settings drawer was dropped per user request — all
  // Fizruk settings (backup, reminders, data reset) now live in the
  // Hub-wide Settings screen. The header no longer owns a gear icon,
  // so the right slot is left empty.
  let left: React.ReactNode = null;
  if (showContextualBack) {
    left = (
      <ContextualBackButton
        label={backLabelFor(page)}
        onClick={onBackToDashboard}
      />
    );
  } else if (typeof onBackToHub === "function") {
    left = <ModuleHeaderBackButton onClick={onBackToHub} />;
  } else {
    left = <DumbbellBadge />;
  }

  return (
    <ModuleHeader
      module={showContextualBack ? undefined : "fizruk"}
      left={left}
      title={titleFor(page)}
      subtitle={
        showContextualBack ? undefined : subtitleFor(page, activeProgram)
      }
    />
  );
}
