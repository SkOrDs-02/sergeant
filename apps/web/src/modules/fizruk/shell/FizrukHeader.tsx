/**
 * Last validated: 2026-06-05
 * Status: Active
 */
import {
  ModuleHeader,
  ModuleHeaderAssistantButton,
  ModuleHeaderHubButton,
} from "@shared/components/layout";
import { cn } from "@shared/lib/ui/cn";
import type { FizrukPage } from "./fizrukRoute";

interface ActiveProgramHeaderView {
  name: string;
}

export interface FizrukHeaderProps {
  page: FizrukPage;
  activeProgram?: ActiveProgramHeaderView | null | undefined;
  onGoToHub?: (() => void) | undefined;
  /** Останній рядок аркуша «Модулі»: налаштування Фізрука в хабі. */
  onOpenSettings?: (() => void) | undefined;
  /**
   * Called when the user taps the contextual back arrow on a sub-page
   * (atlas / exercise / measurements). The parent decides where each
   * sub-page should go back to so the label and the destination stay
   * in sync — see `FizrukApp.contextualBackTarget`.
   */
  onContextualBack: () => void;
}

function titleFor(_page: FizrukPage): string {
  return "Фізрук";
}

/** The nav item label the user came from — used for contextual back title. */
function backLabelFor(page: FizrukPage): string {
  switch (page) {
    case "atlas":
      return "Моє тіло";
    // Контекстна стрілка одна, у шапці. Окрема «На хаб» виходить із
    // модуля незалежно від історії; це інша дія, а не друга стрілка назад.
    case "exercise":
    case "catalog":
    case "templates":
      return "Тренування";
    case "history":
    case "programs":
      return "Огляд";
    case "measurements":
      // Measurements is entered exclusively from the «Прогрес» stat, so the
      // back arrow leads there (mirrors FizrukApp.contextualBackTarget for
      // "measurements"). Текст дзеркалить підпис вкладки в
      // `FIZRUK_NAV` — обіцянка стрілки має збігатися з тим, куди людина
      // потрапляє, тож ці два рядки міняються разом.
      return "Прогрес";
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
        "-ml-1 flex items-center gap-1 rounded-lg px-2 py-2 pointer-coarse:min-h-[44px] pointer-coarse:min-w-[44px]",
        "text-style-label text-muted hover:text-text hover:bg-panelHi transition-colors",
        "focus:outline-none focus-visible:ring-2 focus-visible:ring-focus/45 focus-visible:ring-offset-2 focus-visible:ring-offset-bg",
      )}
      // «Назад до Огляд» було без відмінка; двокрапка тримає видимий підпис
      // у назві й не вимагає родового відмінка для кожної вкладки.
      aria-label={`Назад: ${label}`}
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

export function FizrukHeader({
  page,
  onGoToHub,
  onOpenSettings,
  onContextualBack,
}: FizrukHeaderProps) {
  // «Назад» лише на вкладених сторінках, і він веде на сторінку вище; на
  // вкладках модуля ліворуч тільки «додому» (redesign v3.1, В1). Контекстний
  // back не замінює прямий вихід на хаб (#1517): обидва видно поруч.
  const showContextualBack =
    page === "atlas" ||
    page === "exercise" ||
    page === "measurements" ||
    page === "catalog" ||
    page === "templates" ||
    page === "history" ||
    page === "programs";

  return (
    <ModuleHeader
      module={showContextualBack ? undefined : "fizruk"}
      // Перемикач лише на вкладках модуля; на вкладеній сторінці заголовок
      // звичайний, поруч «назад» на сторінку вище й «додому».
      switcher={showContextualBack ? undefined : "fizruk"}
      onOpenSettings={onOpenSettings}
      left={
        showContextualBack || onGoToHub ? (
          <div className="flex items-center gap-1">
            {showContextualBack && (
              <ContextualBackButton
                label={backLabelFor(page)}
                onClick={onContextualBack}
              />
            )}
            {onGoToHub && <ModuleHeaderHubButton onClick={onGoToHub} />}
          </div>
        ) : null
      }
      title={titleFor(page)}
      right={<ModuleHeaderAssistantButton />}
    />
  );
}
