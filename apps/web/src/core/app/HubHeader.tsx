/**
 * Last validated: 2026-05-14
 * Status: Active
 */
import { useMemo } from "react";
import { cn } from "@shared/lib/ui/cn";
import { useShortcutGlyph } from "@shared/hooks";
import { Icon } from "@shared/components/ui/Icon";
import { Tooltip } from "@shared/components/ui/Tooltip";
import { BrandLogo } from "./BrandLogo";
import { HubHeaderMenu } from "./HubHeaderMenu";
import { messages } from "@shared/i18n/uk";
import { emitHubBus } from "@shared/lib/modules/hubBus";
import { hapticTap } from "@shared/lib/adapters/haptic";
import type { User } from "@sergeant/shared";
import { getKyivDateParts } from "@shared/lib/time/kyivTime";
import { NotificationBell, type HubNotification } from "./NotificationBell";

// WCAG 2.5.5 AAA «Target Size (Enhanced)» рекомендує ≥44×44 пкс для hit-areas;
// Material 3 / iOS HIG — 48 dp / 44 pt як thumb-comfort бейзлайн. На мобільному
// (палець, без хіт-зони курсору) робимо 48 пкс; ≥sm — 44 пкс достатньо.
// Focus-ring: суцільний brand-500 (без /45 альфи), щоб гарантовано холдити
// ≥3:1 контраст до bg в dark-mode (alpha на panelHi-підкладках просідала).
// Sergeant v2 redesign (2026-05, PR-5) — icon button radius tightened
// `rounded-2xl` (16 px) → `rounded-xl` (12 px) per handoff spec. The
// 12 px CONTROL tier matches Button/Badge sizing and aligns the header
// chrome with the new floating-glass HubBottomNav pill (which uses
// `rounded-r-2xl` on the outer container).
const ICON_BUTTON_CLS =
  "w-12 h-12 sm:w-11 sm:h-11 flex items-center justify-center rounded-xl text-muted hover:text-text hover:bg-panelHi transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2 focus-visible:ring-offset-bg";

const GREETINGS: Record<string, string> = {
  morning: "Доброго ранку",
  afternoon: "Доброго дня",
  evening: "Доброго вечора",
  night: "Доброї ночі",
};

function getTimeOfDay(): keyof typeof GREETINGS {
  // Use Kyiv-local hour so greeting stays consistent for users abroad —
  // domain invariant: Europe/Kyiv is the anchor clock (audit Theme 1).
  const { hour: h } = getKyivDateParts();
  if (h >= 5 && h < 12) return "morning";
  if (h >= 12 && h < 17) return "afternoon";
  if (h >= 17 && h < 22) return "evening";
  return "night";
}

function formatUkrainianDate(): string {
  // Show the Kyiv-local calendar date so the header reads correctly on
  // devices in a different timezone (audit Theme 1 — Europe/Kyiv anchor).
  const { year, month, day } = getKyivDateParts();
  try {
    // Reconstruct a UTC instant at Kyiv midday so Intl formats the right
    // calendar date regardless of the host timezone.
    // `new Date(Date.UTC(...))` is a UTC-safe instant construction —
    // no host-local offset is involved here.
    const inst = new Date(Date.UTC(year, month - 1, day, 9, 0, 0));
    const weekdayStr = inst.toLocaleDateString("uk-UA", {
      weekday: "long",
      timeZone: "Europe/Kyiv",
    });
    const rest = inst.toLocaleDateString("uk-UA", {
      day: "numeric",
      month: "long",
      timeZone: "Europe/Kyiv",
    });
    return `${weekdayStr.charAt(0).toUpperCase()}${weekdayStr.slice(1)}, ${rest}`;
  } catch {
    return "";
  }
}

interface HubHeaderProps {
  onOpenSearch: () => void;
  onOpenPrivacy?: () => void;
  user: User | null;
  authLoading?: boolean;
  onShowAuth?: () => void;
  hideAuthButton?: boolean;
  /** System notifications (SW update / PWA install) surfaced in the bell. */
  notifications?: readonly HubNotification[];
}

export function HubHeader({
  onOpenSearch,
  onOpenPrivacy,
  user,
  authLoading,
  onShowAuth,
  hideAuthButton = false,
  notifications,
}: HubHeaderProps) {
  const greetingText = useMemo(() => {
    const tod = getTimeOfDay();
    const base = GREETINGS[tod];
    const name = user?.name?.split(" ")[0];
    return name ? `${base}, ${name}` : base;
  }, [user?.name]);

  const dateStr = useMemo(() => formatUkrainianDate(), []);
  const { modK } = useShortcutGlyph();

  return (
    <header
      className={cn(
        "px-5 max-w-lg md:max-w-2xl lg:max-w-3xl mx-auto w-full",
        "shrink-0 z-40",
        "pt-6 pb-2.5",
      )}
    >
      {/* ── Row 1: Mark + Wordmark + Action icons ─────────────── */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2.5">
          <BrandLogo as="span" size="lg" variant="mark" />
          <span className="truncate text-xl leading-none font-extrabold tracking-tight text-text select-none">
            Sergeant
          </span>
        </div>

        <div className="flex items-center gap-1 shrink-0">
          {/* Global AI-assistant entry. Lives in the hub top-bar so it is
              reachable from every hub tab and does not depend on the
              dashboard-only FTUX-gated FAB (which vanished on the empty
              home + on the reports/profile tabs — user report 2026-07-03).
              Brand-tinted so it reads as the primary AI affordance rather
              than neutral chrome. Opens the chat bottom-sheet via the hub
              bus, same contract as the module-shell assistant buttons. */}
          <Tooltip
            content={messages.nav.openAssistant}
            placement="bottom-center"
          >
            <button
              type="button"
              onClick={() => {
                hapticTap();
                emitHubBus("openChat", { message: null, autoSend: false });
              }}
              aria-label={messages.nav.openAssistant}
              className={cn(
                "w-12 h-12 sm:w-11 sm:h-11 flex items-center justify-center rounded-xl",
                "bg-brand-soft text-brand-strong hover:bg-brand-soft-hover transition-colors",
                "focus:outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2 focus-visible:ring-offset-bg",
              )}
            >
              <Icon name="sparkle" size="lg" />
            </button>
          </Tooltip>

          <Tooltip
            content={`Пошук по всіх модулях (${modK})`}
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

          <NotificationBell notifications={notifications ?? []} />

          {/* Secondary controls fold into a single "⋯" overflow menu so the
              top-bar stays to ≤5 affordances on 375px phones (mobile-audit
              A3): theme and the privacy status row. Calm mode moved to
              Settings → Дашборд → Вигляд. */}
          <HubHeaderMenu
            triggerClassName={ICON_BUTTON_CLS}
            onOpenPrivacy={onOpenPrivacy}
            labels={{
              trigger: "Більше",
              menu: "Швидкі налаштування",
              theme: "Тема",
              privacy: messages.privacy.chip,
              privacyDetail: messages.privacy.chipTooltip,
            }}
          />

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
      <p className="mt-1.5 ml-[3px] text-sm leading-snug text-muted truncate">
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
