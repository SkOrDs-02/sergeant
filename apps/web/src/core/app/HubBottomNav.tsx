/**
 * Last validated: 2026-05-14
 * Status: Active
 */
import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { cn } from "@shared/lib/ui/cn";
import { Icon } from "@shared/components/ui/Icon";
import { safeReadStringLS, safeWriteLS } from "@shared/lib/storage/storage";
import type { HubView } from "../hooks/useHubUIState";
import { getPagePrefetchProps, type PageKey } from "../lib/useRoutePrefetch";
import { messages } from "@shared/i18n/uk";

/**
 * Sergeant Design System — `HubBottomNav`
 *
 * Hub-level bottom navigation. Renders as a floating pill — inset from
 * the screen edges (`mx-3` + bottom margin clearing the home indicator)
 * with the page mesh background continuing behind and below it, matching
 * `ModuleBottomNav` so the whole app reads under one navigation pattern.
 *
 * Canonical shape:
 * - 60 px height (64 px on coarse-pointer devices).
 * - Browser: floating pill via `bottom-nav-shell` utility — `mx-3`,
 *   `mb-[calc(env(safe-area-inset-bottom)+0.5rem)]`, `rounded-3xl`.
 *   Inset + rounded so it reads as a distinct panel "lying on" the
 *   page background.
 * - PWA standalone: `bottom-nav-shell` docks the nav edge-to-edge
 *   against the screen bottom — no horizontal margins, flat bottom,
 *   rounded only at the top. The panel background fills the safe-area
 *   strip so there's no page-coloured dead space below the labels
 *   (user report 2026-06-05 / bottom-nav-gap).
 * - Active indicator:
 *   - Light (default): a rounded outline (`rounded-2xl border
 *     border-ink-strong/25`) framing the active tab — outline only, no
 *     fill. Active label + icon `text-ink-strong`.
 *   - Dark («Чорнило»): a solid emerald (`brand-400`, the hub's default
 *     accent) square with an ink foreground (`dark:text-bg` → #0d1512),
 *     per spec § 4. Module-agnostic — the hub carries emerald, not a
 *     per-module accent. The `dark:` fill leaves the light default intact.
 * - `role="tablist"` + `aria-selected` for AT.
 *
 * Layout contract:
 * - Rendered at the bottom of the hub `<div h-dvh flex-col>` shell, so
 *   `ActiveWorkoutBanner` and other floating chrome must offset
 *   their `bottom:` by 60 px + safe-area-inset-bottom to sit above it.
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
  className?: string | undefined;
  panelId: string;
  id: string;
  prefetchPage?: PageKey | undefined;
  /**
   * Слот рендериться у DOM, але приховується від користувача й AT.
   * Використовується для збереження геометрії tab-strip-у в момент,
   * коли «Звіти» ще не розблоковані (FTUX без жодного запису). Без цього
   * перехід `showReports: false → true` спричиняє reflow усього `flex`-grid-а
   * і CLS під час першого реального запису (UX-roast 2026-Q2 §7.2 / PR-23).
   */
  hiddenSlot?: boolean | undefined;
  /**
   * Навігаційна дія (наприклад, гостьове «Увійти» → /sign-in), а не
   * перемикач hub-панелі. Рендериться як звичайна кнопка без
   * `role="tab"`/`aria-selected`/`aria-controls`: AT-семантика «вкладка,
   * не вибрано», що насправді виконує навігацію, вводить в оману
   * screen-reader-користувачів.
   */
  action?: boolean | undefined;
  onKeyDown?: ((event: KeyboardEvent<HTMLButtonElement>) => void) | undefined;
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
  prefetchPage,
  hiddenSlot = false,
  action = false,
  onKeyDown,
}: HubBottomNavTabProps) {
  const prefetchProps =
    !hiddenSlot && prefetchPage ? getPagePrefetchProps(prefetchPage) : {};
  const tabAria = action
    ? {}
    : ({
        role: "tab",
        "aria-selected": active,
        "aria-controls": panelId,
      } as const);

  return (
    <button
      type="button"
      id={`hub-tab-${id}`}
      {...tabAria}
      tabIndex={hiddenSlot ? -1 : active || action ? 0 : -1}
      onClick={hiddenSlot ? undefined : onClick}
      onKeyDown={hiddenSlot || action ? undefined : onKeyDown}
      {...prefetchProps}
      // `visibility: hidden` (а не `aria-hidden`) — щоб accessibility-tree
      // ховала слот за computed-стилем, але RTL міг знайти його через
      // `getByRole(..., { hidden: true })`. `aria-hidden` стер би
      // accessible name (`label`), і тести з `name: /Звіти/` падали б.
      style={hiddenSlot ? { visibility: "hidden" } : undefined}
      className={cn(
        "relative flex-1 flex flex-col items-center justify-end gap-1 pb-1.5",
        "my-1.5 rounded-2xl border transition-all duration-200 min-h-[48px] pointer-coarse:min-h-[52px]",
        "active:scale-95",
        "focus:outline-none focus-visible:ring-2 focus-visible:ring-focus/45 focus-visible:ring-offset-2 focus-visible:ring-offset-panel",
        active
          ? "text-ink-strong border-ink-strong/25 dark:bg-brand-400 dark:border-transparent dark:text-bg"
          : "text-text border-transparent hover:text-text/80",
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
  showReports?: boolean | undefined;
  /**
   * When `true`, renders a «Профіль» tab for the signed-in user.
   * When `false` and `onShowAuth` is provided, renders an «Увійти» tab
   * for guests so sign-in is reachable from the bottom nav (one-tap
   * instead of hunting for the header icon).
   */
  showProfile?: boolean | undefined;
  /**
   * Callback to open the auth sheet. When provided and `showProfile`
   * is `false`, the nav shows an «Увійти» tab for guests.
   */
  onShowAuth?: (() => void) | undefined;
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
  const tablistRef = useRef<HTMLDivElement>(null);

  // Roving tabindex (інактивні таби tabIndex=-1) без стрілок робив
  // «Звіти»/«Налаштування» недосяжними з клавіатури — WAI-ARIA tabs
  // pattern вимагає Left/Right (+Home/End) переміщення фокуса.
  const handleTablistKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) {
      return;
    }
    const root = tablistRef.current;
    if (!root) return;
    const visibleTabs = Array.from(
      root.querySelectorAll<HTMLButtonElement>('[role="tab"]'),
    ).filter((el) => el.style.visibility !== "hidden");
    if (visibleTabs.length === 0) return;
    const currentIndex = visibleTabs.indexOf(
      document.activeElement as HTMLButtonElement,
    );
    let nextIndex: number;
    if (event.key === "Home") {
      nextIndex = 0;
    } else if (event.key === "End") {
      nextIndex = visibleTabs.length - 1;
    } else {
      const delta = event.key === "ArrowRight" ? 1 : -1;
      nextIndex =
        currentIndex === -1
          ? 0
          : (currentIndex + delta + visibleTabs.length) % visibleTabs.length;
    }
    event.preventDefault();
    visibleTabs[nextIndex]?.focus();
  };

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
    prefetchPage: "reports",
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
      prefetchPage: "profile",
      label: "Профіль",
    });
  }

  const authAction: HubBottomNavItem | null =
    !showProfile && onShowAuth
      ? {
          key: "auth",
          id: "auth",
          panelId: "hub-panel-profile",
          active: false,
          onClick: onShowAuth,
          iconName: "user",
          prefetchPage: "auth",
          label: "Увійти",
          action: true,
        }
      : null;

  tabs.push({
    key: "settings",
    id: "settings",
    panelId: "hub-panel-settings",
    active: hubView === "settings",
    onClick: () => onChange("settings"),
    iconName: "settings",
    prefetchPage: "settings",
    label: "Налаштування",
  });

  return (
    <nav
      aria-label={messages.nav.hubSections}
      className={cn(
        "shrink-0 relative z-30",
        "bottom-nav-shell border border-line bg-panel shadow-lg",
      )}
    >
      <div className="relative flex h-[60px] pointer-coarse:h-[64px] gap-1 px-1">
        <div role="tablist" ref={tablistRef} className="contents">
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
              prefetchPage={tab.prefetchPage}
              hiddenSlot={tab.hiddenSlot}
              action={tab.action}
              onKeyDown={handleTablistKeyDown}
            />
          ))}
        </div>
        {authAction && (
          <HubBottomNavTab
            key={authAction.key}
            id={authAction.id}
            panelId={authAction.panelId}
            active={authAction.active}
            onClick={authAction.onClick}
            iconName={authAction.iconName}
            label={authAction.label}
            className={authAction.className}
            prefetchPage={authAction.prefetchPage}
            hiddenSlot={authAction.hiddenSlot}
            action={authAction.action}
          />
        )}
      </div>
    </nav>
  );
}
