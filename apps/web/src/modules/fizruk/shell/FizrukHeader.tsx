/**
 * Last validated: 2026-06-05
 * Status: Active
 */
import type * as React from "react";
import {
  ModuleHeader,
  ModuleHeaderAssistantButton,
  ModuleHeaderBackButton,
  ModuleHeaderHubButton,
  ModuleHeaderSettingsButton,
} from "@shared/components/layout";
import { cn } from "@shared/lib/ui/cn";
import { messages } from "@shared/i18n/uk";
import type { FizrukPage } from "./fizrukRoute";

interface ActiveProgramHeaderView {
  name: string;
}

export interface FizrukHeaderProps {
  page: FizrukPage;
  activeProgram?: ActiveProgramHeaderView | null | undefined;
  onBackToHub?: (() => void) | undefined;
  onGoToHub?: (() => void) | undefined;
  /**
   * Called when the user taps the contextual back arrow on a sub-page
   * (atlas / exercise / measurements). The parent decides where each
   * sub-page should go back to so the label and the destination stay
   * in sync — see `FizrukApp.contextualBackTarget`.
   */
  onContextualBack: () => void;
  onOpenSettings?: (() => void) | undefined;
}

function titleFor(_page: FizrukPage): string {
  return "Фізрук";
}

/** The nav item label the user came from — used for contextual back title. */
function backLabelFor(page: FizrukPage): string {
  switch (page) {
    case "atlas":
      return "Моє тіло";
    case "exercise":
      return "Тренування";
    case "measurements":
      // Measurements is entered exclusively from the «Прогрес і заміри»
      // stat, so the back arrow leads there (mirrors
      // FizrukApp.contextualBackTarget for "measurements").
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
        "-ml-1 flex items-center gap-1 rounded-xl px-2 py-2 min-h-[44px] min-w-[44px]",
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

function DumbbellBadge() {
  return (
    <div
      className={cn(
        "shrink-0 w-10 h-10 rounded-xl flex items-center justify-center",
        "bg-linear-to-br from-cyan-100 to-cyan-200",
        "dark:from-cyan-900/40 dark:to-cyan-900/30",
        "text-fizruk-strong dark:text-fizruk-300",
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
  onBackToHub,
  onGoToHub,
  onContextualBack,
  onOpenSettings,
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
        onClick={onContextualBack}
      />
    );
  } else if (typeof onBackToHub === "function") {
    left = (
      <div className="flex items-center gap-1">
        <ModuleHeaderBackButton onClick={onBackToHub} />
        {typeof onGoToHub === "function" && (
          <ModuleHeaderHubButton onClick={onGoToHub} />
        )}
      </div>
    );
  } else {
    left = <DumbbellBadge />;
  }

  return (
    <ModuleHeader
      module={showContextualBack ? undefined : "fizruk"}
      left={left}
      title={titleFor(page)}
      subtitle={showContextualBack ? undefined : messages.fizruk.headerSubtitle}
      right={
        <div className="flex items-center gap-2">
          <ModuleHeaderAssistantButton />
          {onOpenSettings && (
            <ModuleHeaderSettingsButton onClick={onOpenSettings} />
          )}
        </div>
      }
    />
  );
}
