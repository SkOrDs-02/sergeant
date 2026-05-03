import { useMemo } from "react";
import { cn } from "@shared/lib/ui/cn";
import { Icon } from "@shared/components/ui/Icon";
import { Tooltip } from "@shared/components/ui/Tooltip";
import { useScrollHeader } from "@shared/hooks/useScrollHeader";
import { BrandLogo } from "./BrandLogo";
import { DarkModeToggle } from "./DarkModeToggle";
import type { User } from "@sergeant/shared";

// WCAG 2.5.5 AAA «Target Size (Enhanced)» рекомендує ≥44×44 пкс для hit-areas;
// Material 3 / iOS HIG — 48 dp / 44 pt як thumb-comfort бейзлайн. На мобільному
// (палець, без хіт-зони курсору) робимо 48 пкс; ≥sm — 44 пкс достатньо.
// Focus-ring: суцільний brand-500 (без /45 альфи), щоб гарантовано холдити
// ≥3:1 контраст до bg в dark-mode (alpha на panelHi-підкладках просідала).
const ICON_BUTTON_CLS =
  "w-12 h-12 sm:w-11 sm:h-11 flex items-center justify-center rounded-2xl text-muted hover:text-text hover:bg-panelHi transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2 focus-visible:ring-offset-bg";

const GREETINGS: Record<string, string> = {
  morning: "Доброго ранку",
  afternoon: "Доброго дня",
  evening: "Доброго вечора",
  night: "Доброї ночі",
};

function getTimeOfDay(): keyof typeof GREETINGS {
  const h = new Date().getHours();
  if (h >= 5 && h < 12) return "morning";
  if (h >= 12 && h < 17) return "afternoon";
  if (h >= 17 && h < 22) return "evening";
  return "night";
}

function formatUkrainianDate(): string {
  const now = new Date();
  try {
    const weekday = now.toLocaleDateString("uk-UA", { weekday: "long" });
    const rest = now.toLocaleDateString("uk-UA", {
      day: "numeric",
      month: "long",
    });
    return `${weekday.charAt(0).toUpperCase()}${weekday.slice(1)}, ${rest}`;
  } catch {
    return "";
  }
}

interface HubHeaderProps {
  onOpenSearch: () => void;
  user: User | null;
  authLoading?: boolean;
  onShowAuth?: () => void;
  dark?: boolean;
  onToggleDark?: () => void;
  hideAuthButton?: boolean;
}

export function HubHeader({
  onOpenSearch,
  user,
  authLoading,
  onShowAuth,
  dark,
  onToggleDark,
  hideAuthButton = false,
}: HubHeaderProps) {
  const { isHidden, isShrunk, hasBlur } = useScrollHeader({
    shrinkThreshold: 40,
    hideThreshold: 120,
    minDelta: 8,
  });

  const greetingText = useMemo(() => {
    const tod = getTimeOfDay();
    const base = GREETINGS[tod];
    const name = user?.name?.split(" ")[0];
    return name ? `${base}, ${name}` : base;
  }, [user?.name]);

  const dateStr = useMemo(formatUkrainianDate, []);

  return (
    <header
      className={cn(
        "px-5 max-w-lg mx-auto w-full",
        "sticky top-0 z-40",
        "transition-all duration-300 ease-out",
        // Progressive header states
        isHidden && "-translate-y-full",
        isShrunk ? "pt-2 pb-2" : "pt-6 pb-2.5",
        hasBlur && "bg-bg/80 backdrop-blur-md border-b border-line/50",
      )}
      style={{
        // Prefer the OS-reported safe-area inset on devices that have one
        // (notched/dynamic-island phones, PWA standalone with status-bar);
        // fall back to a tighter 1.5rem (24px) baseline on the web instead
        // of the previous 2.5rem (40px), which ate ~16px of dashboard
        // real estate on every cold start without serving any system chrome.
        paddingTop: isShrunk
          ? undefined
          : "max(1.5rem, env(safe-area-inset-top))",
      }}
    >
      {/* ── Row 1: Mark + Wordmark + Action icons ─────────────── */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <BrandLogo as="span" size="lg" variant="mark" />
          <h1 className="text-xl leading-none font-extrabold tracking-tight text-text select-none">
            Sergeant
          </h1>
        </div>

        <div className="flex items-center gap-1 shrink-0">
          <Tooltip
            content="Пошук по всіх модулях (⌘K)"
            placement="bottom-center"
          >
            <button
              type="button"
              onClick={onOpenSearch}
              aria-label="Пошук"
              className={ICON_BUTTON_CLS}
            >
              <Icon name="search" size="lg" />
            </button>
          </Tooltip>

          {/* AI-assistant entry was previously surfaced here as a sparkle
              icon (#1507) after the floating FAB was retired in #1357. It
              was reverted: the header now stays focused on Search +
              theme/auth chrome, and the assistant is reachable via the
              dashboard FAB rendered by `HubHomeView`. ⌘K → «Запитати
              асистента» and the `/chat` deep-link continue to work. */}

          {/* Dark-mode toggle: surfaced as a single-tap header affordance for
              both signed-in and guest users. Previously buried inside the
              `UserMenuButton` dropdown (3-tap path); profile actions now
              live behind the bottom-nav `Профіль` tab, so the dropdown
              was retired. */}
          {dark !== undefined && onToggleDark && (
            <DarkModeToggle dark={dark} onToggle={onToggleDark} />
          )}

          {/* Sign-in entry-point for guests only. Signed-in users reach
              their account via the `Профіль` bottom-nav tab. */}
          {!user && !authLoading && !hideAuthButton && onShowAuth && (
            <Tooltip content="Увійти" placement="bottom-center">
              <button
                type="button"
                onClick={onShowAuth}
                aria-label="Увійти в акаунт"
                className={ICON_BUTTON_CLS}
              >
                <Icon name="user" size="lg" />
              </button>
            </Tooltip>
          )}
        </div>
      </div>

      {/* ── Row 2: Greeting · date (hidden when shrunk) ───────── */}
      {/* Раніше тут було ще rows-2 з підписом «ОПЕРАТИВНИЙ ЦЕНТР» — */}
      {/* він дублював wordmark «Sergeant» зверху. Лишаємо лише */}
      {/* greeting+date, бо це справжній сигнальний шар (час доби, */}
      {/* персональне звернення), а тег «оперативний центр» — */}
      {/* брендовий шум, який забирав вертикальний простір. */}
      <p
        className={cn(
          "mt-1.5 ml-[3px] text-sm leading-snug text-muted truncate",
          "transition-all duration-300",
          isShrunk && "opacity-0 h-0 mt-0 overflow-hidden",
        )}
      >
        {greetingText}
        {dateStr && (
          <>
            <span className="mx-1.5 text-subtle" aria-hidden="true">
              ·
            </span>
            <span className="text-subtle">{dateStr}</span>
          </>
        )}
      </p>
    </header>
  );
}
