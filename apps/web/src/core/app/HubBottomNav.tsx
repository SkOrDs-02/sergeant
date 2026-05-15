/**
 * Last validated: 2026-05-14
 * Status: Active
 */
import { useEffect, useRef, useState } from "react";
import { cn } from "@shared/lib/ui/cn";
import { Icon } from "@shared/components/ui/Icon";
import { safeReadStringLS, safeWriteLS } from "@shared/lib/storage/storage";
import type { HubView } from "../hooks/useHubUIState";
import { messages } from "@shared/i18n/uk";

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
 *   `ActiveWorkoutBanner` and other floating chrome must offset
 *   their `bottom:` by 76 px + safe-area-inset-bottom to sit above it.
 *
 * The reports-tab reveal behavior (a single bounce-in animation when
 * the tab first appears) is preserved from the old `HubTabs` — see
 * comments on `safeReadStringLS` usage below. The previous one-time
 * toast was removed per UX-roast 2026-Q2 R1 (it overlapped with the
 * Re-engagement card and the install banner that appear in the same
 * frame and overwhelmed the FTUX). Storage key is unchanged so
 * existing users aren't re-animated.
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
  /**
   * Слот рендериться у DOM, але приховується від користувача й AT.
   * Використовується для збереження геометрії tab-strip-у в момент,
   * коли «Звіти» ще не розблоковані (FTUX без жодного запису). Без цього
   * перехід `showReports: false → true` спричиняє reflow усього `flex`-grid-а
   * і CLS під час першого реального запису (UX-roast 2026-Q2 §7.2 / PR-23).
   */
  hiddenSlot?: boolean;
}

interface HubBottomNavItem extends HubBottomNavTabProps {
  key: string;
}

function HubBottomNavTab({
  active,
  onClick,
  label,
  iconName,
  className,
  panelId,
  id,
  hiddenSlot = false,
}: HubBottomNavTabProps) {
  return (
    <button
      type="button"
      role="tab"
      id={`hub-tab-${id}`}
      aria-selected={active}
      aria-controls={panelId}
      tabIndex={hiddenSlot ? -1 : active ? 0 : -1}
      onClick={hiddenSlot ? undefined : onClick}
      // `visibility: hidden` (а не `aria-hidden`) — щоб accessibility-tree
      // ховала слот за computed-стилем, але RTL міг знайти його через
      // `getByRole(..., { hidden: true })`. `aria-hidden` стер би
      // accessible name (`label`), і тести з `name: /Звіти/` падали б.
      style={hiddenSlot ? { visibility: "hidden" } : undefined}
      className={cn(
        // `z-10` ставить кнопку поверх absolutely-positioned active-tab
        // background pill (added in PR-5 v2 redesign).
        "relative z-10 flex-1 flex flex-col items-center justify-center gap-1",
        "transition-all duration-200 min-h-[48px] pointer-coarse:min-h-[52px]",
        "active:scale-95",
        "focus:outline-none focus-visible:ring-2 focus-visible:ring-focus/45 focus-visible:ring-offset-2 focus-visible:ring-offset-panel",
        // v2 redesign: active tab reads on the ink-strong background pill
        // → text inverts to `bg-base` (warm cream in light, dark in dark);
        // inactive stays muted on the glass surface.
        active ? "text-bg-base" : "text-muted hover:text-text/70",
        hiddenSlot && "invisible pointer-events-none",
        className,
      )}
    >
      <span
        className="relative transition-all duration-200 w-10 h-7 flex items-center justify-center"
        aria-hidden
      >
        <Icon name={iconName} size={20} strokeWidth={2} />
      </span>
      <span className="text-style-caption font-semibold leading-none">
        {label}
      </span>
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
   * When `true`, renders a «Профіль» tab for the signed-in user.
   * When `false` and `onShowAuth` is provided, renders an «Увійти» tab
   * for guests so sign-in is reachable from the bottom nav (one-tap
   * instead of hunting for the header icon).
   */
  showProfile?: boolean;
  /**
   * Callback to open the auth sheet. When provided and `showProfile`
   * is `false`, the nav shows an «Увійти» tab for guests.
   */
  onShowAuth?: () => void;
}

export function HubBottomNav({
  hubView,
  onChange,
  showReports = true,
  showProfile = false,
  onShowAuth,
}: HubBottomNavProps) {
  // Чи був перехід `showReports: false → true` в межах поточного маунту.
  // Тільки в цьому випадку ми вмикаємо bounce-анімацію (без toast — див.
  // UX-roast 2026-Q2 R1: одночасні «нова вкладка»-toast + Re-engagement
  // card + install banner перевантажували перший запис).
  // Якщо компонент маунтиться вже з `showReports === true` без флага в
  // localStorage — це або легасі-користувач (виставлявся ще до цього
  // прапора), або повне перезавантаження після розблокування. В обох
  // сценаріях bounce у момент перезавантаження виглядав би невчасно,
  // тож тихо ставимо флаг і нічого не показуємо.
  const prevShowReportsRef = useRef(showReports);
  const [animateReveal, setAnimateReveal] = useState(false);

  useEffect(() => {
    const prevShowReports = prevShowReportsRef.current;
    prevShowReportsRef.current = showReports;

    if (!showReports) return;
    if (safeReadStringLS(REPORTS_TAB_REVEALED_AT_KEY)) return;

    if (!prevShowReports) {
      // Справжнє розблокування «в реальному часі»: користувач щойно
      // зробив перший реальний запис, і `hasAnyRealEntry()` flip-нув.
      // Bounce-анімація сама по собі звертає увагу на нову вкладку
      // без додаткового toast.
      safeWriteLS(REPORTS_TAB_REVEALED_AT_KEY, String(Date.now()));
      setAnimateReveal(true);
      return;
    }

    // Migration / cold-start path: tab уже мав бути розблокований
    // (минулий маунт), просто на ньому не було флага. Ставимо тихо.
    safeWriteLS(REPORTS_TAB_REVEALED_AT_KEY, String(Date.now()));
  }, [showReports]);

  const tabs: HubBottomNavItem[] = [
    {
      key: "dashboard",
      id: "dashboard",
      panelId: "hub-panel-dashboard",
      active: hubView === "dashboard",
      onClick: () => onChange("dashboard"),
      iconName: "grid",
      label: "Головна",
    },
  ];

  // Слот «Звіти» завжди є у DOM, навіть коли вкладка ще не розблокована
  // (FTUX без жодного запису). Це фіксує геометрію tab-strip-у і прибирає
  // CLS у момент `showReports: false → true` (UX-roast 2026-Q2 §7.2 /
  // PR-23). Поки `showReports === false`, слот рендериться з
  // `aria-hidden="true"`/`visibility: hidden`, тому AT і користувач його
  // не бачать і не таплять — RTL `getByRole` теж його ігнорує.
  tabs.push({
    key: "reports",
    id: "reports",
    panelId: "hub-panel-reports",
    active: showReports && hubView === "reports",
    onClick: () => onChange("reports"),
    iconName: "bar-chart",
    label: "Звіти",
    hiddenSlot: !showReports,
    className: animateReveal ? "animate-bounce-in" : undefined,
  });

  if (showProfile) {
    tabs.push({
      key: "profile",
      id: "profile",
      panelId: "hub-panel-profile",
      active: hubView === "profile",
      onClick: () => onChange("profile"),
      iconName: "user",
      label: "Профіль",
    });
  } else if (onShowAuth) {
    tabs.push({
      key: "auth",
      id: "auth",
      panelId: "hub-panel-profile",
      active: false,
      onClick: onShowAuth,
      iconName: "user",
      label: "Увійти",
    });
  }

  tabs.push({
    key: "settings",
    id: "settings",
    panelId: "hub-panel-settings",
    active: hubView === "settings",
    onClick: () => onChange("settings"),
    iconName: "settings",
    label: "Налаштування",
  });

  const activeIndex = tabs.findIndex((tab) => tab.active);

  return (
    // Sergeant v2 redesign (2026-05, PR-5) — transformed from flat
    // `border-t` panel to a floating glass pill (`mx-3 mb-3`,
    // `rounded-r-2xl`, `shadow-nav`). The outer wrapper preserves
    // `safe-area-pb` so iOS home-indicator clears; the inner `<nav>`
    // becomes the visible pill. Active indicator changed from a top
    // 1-px stripe to a full-cell `bg-ink-strong` background pill
    // sitting BEHIND the active tab content.
    <div
      className="shrink-0 relative z-30 safe-area-pb"
      aria-hidden={false}
    >
      <nav
        aria-label={messages.nav.hubSections}
        className={cn(
          "mx-3 mb-3",
          "bg-surface-strong-glass backdrop-blur-md",
          "border border-line",
          "rounded-r-2xl",
          "shadow-nav",
        )}
      >
        <div
          role="tablist"
          className="relative flex h-[60px] pointer-coarse:h-[64px] p-1"
        >
          {activeIndex >= 0 && (
            <span
              data-testid="hub-bottom-nav-active-indicator"
              className={cn(
                "absolute inset-y-1 pointer-events-none",
                "rounded-xl bg-ink-strong",
                "transition-[left] duration-200 ease-out",
              )}
              style={{
                left: `calc(${activeIndex} * (100% / ${tabs.length}) + 0.25rem)`,
                width: `calc(100% / ${tabs.length} - 0.5rem)`,
              }}
              aria-hidden
            />
          )}

          {tabs.map((tab) => (
            <HubBottomNavTab
              key={tab.key}
              id={tab.id}
              panelId={tab.panelId}
              active={tab.active}
              onClick={tab.onClick}
              iconName={tab.iconName}
              label={tab.label}
              className={tab.className}
              hiddenSlot={tab.hiddenSlot}
            />
          ))}
        </div>
      </nav>
    </div>
  );
}
