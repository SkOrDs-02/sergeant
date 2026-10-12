/**
 * Last validated: 2026-06-05
 * Status: Active
 */
import type * as React from "react";
import {
  ModuleHeader,
  ModuleHeaderAssistantButton,
  ModuleHeaderBackButton,
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
}

function titleFor(_page: FizrukPage): string {
  return "Фізрук";
}

/** The nav item label the user came from — used for contextual back title. */
function backLabelFor(page: FizrukPage): string {
  switch (page) {
    case "atlas":
      return "Моє тіло";
    // PR-Z7: каталог і шаблони приєднані до `exercise`. Раніше на їх місці
    // стояв коментар, що вони лишаються осторонь через власну стрілку
    // `WorkoutsHeader` — але та стрілка малювалась ОДНОЧАСНО з парою
    // «Назад»/«На хаб» із цієї ж шапки, тобто намір «не дублювати» код не
    // виконував: на екрані було три виходи замість одного. Тепер вихід
    // один і живе тут, а `WorkoutsHeader` свою стрілку на маршрутних
    // екранах не малює (`section` != undefined).
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
  onBackToHub,
  onContextualBack,
}: FizrukHeaderProps) {
  // Один вихід на підсторінку, і він завжди тут. До PR-Z7 набір був
  // вужчий (atlas / exercise / measurements), тож на `catalog`,
  // `templates` і `history` шапка малювала пару «Назад» + «На хаб», а
  // сторінка згори докладала власну стрілку — два-три різні виходи поруч;
  // на `programs` при цьому не було жодного.
  const showContextualBack =
    page === "atlas" ||
    page === "exercise" ||
    page === "measurements" ||
    page === "catalog" ||
    page === "templates" ||
    page === "history" ||
    page === "programs";

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
      </div>
    );
  } else {
    left = null;
  }

  return (
    <ModuleHeader
      module={showContextualBack ? undefined : "fizruk"}
      left={left}
      title={titleFor(page)}
      subtitle={showContextualBack ? undefined : messages.fizruk.headerSubtitle}
      subtitleShort={
        showContextualBack ? undefined : messages.fizruk.headerSubtitleShort
      }
      right={
        <div className="flex items-center gap-2">
          <ModuleHeaderAssistantButton />
        </div>
      }
    />
  );
}
