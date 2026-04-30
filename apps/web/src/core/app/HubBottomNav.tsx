import { useEffect, useRef, useState } from "react";
import { cn } from "@shared/lib/cn";
import { Icon } from "@shared/components/ui/Icon";
import { useToast } from "@shared/hooks/useToast";
import { safeReadStringLS, safeWriteLS } from "@shared/lib/storage";
import type { HubView } from "../hooks/useHubUIState";

/**
 * Sergeant Design System — `HubBottomNav`
 *
 * Hub-level bottom navigation. Replaces the earlier top-positioned
 * `HubTabs` so the whole app lives under a single navigation pattern:
 * everything (hub + 4 modules) reads bottom-up, not bottom-down for
 * modules and top-down for the hub.
 *
 * Shape mirrors `ModuleBottomNav` for visual consistency:
 * - 60 px height (64 px on coarse-pointer devices).
 * - `safe-area-pb` so iOS home-indicator clears.
 * - Active indicator pill (`w-10 h-1`) at the top, brand-colored
 *   instead of module-colored (the hub is module-agnostic).
 * - `role="tablist"` + `aria-selected` for AT.
 *
 * Layout contract:
 * - Rendered at the bottom of the hub `<div h-dvh flex-col>` shell, so
 *   FABs (`HubFloatingActions`) and `ActiveWorkoutBanner` must offset
 *   their `bottom:` by 76 px + safe-area-inset-bottom to sit above it.
 *
 * The reports-tab reveal behavior (animate + one-time toast) is
 * preserved from the old `HubTabs` — see comments on `safeReadStringLS`
 * usage below. Storage key is unchanged so existing users aren't
 * re-onboarded through the reveal toast.
 */

const REPORTS_TAB_REVEALED_AT_KEY = "sergeant.hub.reportsTabRevealedAt";

interface HubBottomNavTabProps {
  active: boolean;
  onClick: () => void;
  label: string;
  iconName: string;
  className?: string;
  panelId: string;
  id: string;
}

function HubBottomNavTab({
  active,
  onClick,
  label,
  iconName,
  className,
  panelId,
  id,
}: HubBottomNavTabProps) {
  return (
    <button
      type="button"
      role="tab"
      id={`hub-tab-${id}`}
      aria-selected={active}
      aria-controls={panelId}
      tabIndex={active ? 0 : -1}
      onClick={onClick}
      className={cn(
        "relative flex-1 flex flex-col items-center justify-center gap-1",
        "transition-all duration-200 min-h-[48px] [@media(pointer:coarse)]:min-h-[52px]",
        "active:scale-95 [@media(pointer:coarse)]:active:bg-panelHi/50",
        "focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/45 focus-visible:ring-offset-2 focus-visible:ring-offset-panel",
        active ? "text-text" : "text-muted hover:text-text/70",
        className,
      )}
    >
      {active && (
        <span
          className={cn(
            "absolute top-0 left-1/2 -translate-x-1/2",
            "w-10 h-1 rounded-full shadow-sm",
            // Brand accent (hub is module-agnostic — never module-colored).
            "bg-gradient-to-r from-brand-400 to-brand-500",
          )}
          aria-hidden
        />
      )}
      <span
        className={cn(
          "relative transition-all duration-200",
          active && "text-brand-strong",
        )}
        aria-hidden
      >
        <Icon name={iconName} size={20} strokeWidth={2} />
      </span>
      <span className="text-2xs font-semibold leading-none">{label}</span>
    </button>
  );
}

export interface HubBottomNavProps {
  hubView: HubView;
  onChange: (view: HubView) => void;
  /**
   * «Звіти» прибрана з tab-strip-а, поки у користувача немає жодного
   * реального запису. Порожній звіт — найгірший FTUX-стан: юзер тапне,
   * побачить «— ₴» і втратить довіру до модуля. Тому tab з'являється
   * лише коли `hasAnyRealEntry()` повертає `true` (див. `firstRealEntry.ts`).
   */
  showReports?: boolean;
  /**
   * «Профіль» tab is only rendered when the user is signed in. Guests
   * reach auth via the header button — a profile tab that bounces
   * anonymous visitors to sign-in would clutter the FTUX strip.
   */
  showProfile?: boolean;
}

export function HubBottomNav({
  hubView,
  onChange,
  showReports = true,
  showProfile = false,
}: HubBottomNavProps) {
  const toast = useToast();
  // Чи був перехід `showReports: false → true` в межах поточного маунту.
  // Тільки в цьому випадку ми вмикаємо bounce-анімацію + one-time toast.
  // Якщо компонент маунтиться вже з `showReports === true` без флага в
  // localStorage — це або легасі-користувач (виставлявся ще до цього
  // прапора), або повне перезавантаження після розблокування. В обох
  // сценаріях celebrate-toast у момент перезавантаження виглядав би
  // невчасно, тож тихо ставимо флаг і нічого не показуємо.
  const prevShowReportsRef = useRef(showReports);
  const [animateReveal, setAnimateReveal] = useState(false);

  useEffect(() => {
    const prevShowReports = prevShowReportsRef.current;
    prevShowReportsRef.current = showReports;

    if (!showReports) return;
    if (safeReadStringLS(REPORTS_TAB_REVEALED_AT_KEY)) return;

    if (!prevShowReports) {
      // Це справжнє розблокування «в реальному часі»: користувач
      // зробив свій перший реальний запис у поточному сеансі, і
      // `hasAnyRealEntry()` щойно flip-нув. Запускаємо bounce +
      // показуємо нав'язливий, але дружній toast із прямою CTA на
      // вкладку. Toast самозникає за 6с — звідси не лишається
      // постійного chrome-у, тому ризик заглушити подальші важливі
      // toast-и низький.
      safeWriteLS(REPORTS_TAB_REVEALED_AT_KEY, String(Date.now()));
      setAnimateReveal(true);
      toast.info(
        "«Звіти» тепер доступні — короткі зведення по всіх модулях.",
        6000,
        {
          label: "Відкрити",
          onClick: () => onChange("reports"),
        },
      );
      return;
    }

    // Migration / cold-start path: tab уже мав бути розблокований
    // (минулий маунт), просто на ньому не було флага. Ставимо тихо.
    safeWriteLS(REPORTS_TAB_REVEALED_AT_KEY, String(Date.now()));
  }, [showReports, onChange, toast]);

  return (
    <nav
      aria-label="Розділи хабу"
      className={cn(
        "shrink-0 relative z-30 safe-area-pb",
        "bg-panel/95 backdrop-blur-xl",
        "border-t border-line",
      )}
    >
      <div
        role="tablist"
        className="flex h-[60px] [@media(pointer:coarse)]:h-[64px]"
      >
        <HubBottomNavTab
          id="dashboard"
          panelId="hub-panel-dashboard"
          active={hubView === "dashboard"}
          onClick={() => onChange("dashboard")}
          iconName="grid"
          label="Головна"
        />

        {showReports && (
          <HubBottomNavTab
            id="reports"
            panelId="hub-panel-reports"
            active={hubView === "reports"}
            onClick={() => onChange("reports")}
            iconName="bar-chart"
            label="Звіти"
            className={animateReveal ? "animate-bounce-in" : undefined}
          />
        )}

        {showProfile && (
          <HubBottomNavTab
            id="profile"
            panelId="hub-panel-profile"
            active={hubView === "profile"}
            onClick={() => onChange("profile")}
            iconName="user"
            label="Профіль"
          />
        )}

        <HubBottomNavTab
          id="settings"
          panelId="hub-panel-settings"
          active={hubView === "settings"}
          onClick={() => onChange("settings")}
          iconName="settings"
          label="Налаштування"
        />
      </div>
    </nav>
  );
}
