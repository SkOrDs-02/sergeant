import {
  memo,
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import { useVisualKeyboardInset } from "@sergeant/shared";
import { cn } from "../../lib/ui/cn";
import {
  BOTTOM_NAV_INSET_VAR,
  useBottomInsetVar,
} from "../../hooks/useBottomInsetVar";

/**
 * Sergeant Design System — ModuleBottomNav
 *
 * Shared bottom-navigation shell for Фінік / Фізрук / Рутина /
 * Харчування. Docked edge-to-edge against the screen bottom (matches
 * `HubBottomNav`) so the whole app reads under one navigation pattern.
 *
 * Canonical shape:
 * - Height 60 px (64 px on coarse-pointer devices).
 * - Docked edge-to-edge in both browser and PWA standalone via
 *   `bottom-nav-shell` — no horizontal margins, flat bottom, rounded only
 *   at the top. The panel background fills the safe-area strip
 *   (padding-bottom) so there's no page-coloured dead space below the
 *   labels (user report 2026-06-05 / bottom-nav-gap; mobile-audit A1).
 * - Active indicator (fix spec v2 § 1 — light mirrors dark, solid not
 *   outline):
 *   - Light: a solid module-accent square (`tokens.fillLight` =
 *     strong-tier, e.g. `bg-finyk-strong`) with an ink-on-cream
 *     foreground (`text-bg`).
 *   - Dark («Чорнило»): a solid module-accent square (`tokens.fillDark`
 *     = luminescent tier-400) with the same ink foreground (`text-bg`
 *     resolves to `#14100e` under `.dark`, so one bare class covers both
 *     themes). No drop-shadow glow.
 * - Labels `text-style-caption` (12px) per Hard Rule #16.
 *
 * Routine special-case (FAB):
 * - Consumers may render an additional center FAB as a sibling of
 *   the nav (NOT nested inside it) at `z-40`, positioned over the
 *   nav's top edge. See `RoutineBottomNav`. The FAB sits in front
 *   of the nav's stacking context and keeps its own rose gradient
 *   per Routine identity.
 *
 * On-screen keyboard (spec `docs/90-work/planning/specs/keyboard-and-scroll.md`
 * § design decision 2): while the visual-keyboard inset is active the
 * nav slides down out of view (nothing sits below it during text
 * entry, and it was the fixed element that turned iOS's keyboard
 * dead-zone into a *reachable* dead zone). Buttons drop to
 * `tabIndex={-1}` and the `<nav>` gets `aria-hidden` together with the
 * visual hide so it can't be tabbed/swiped into while off-screen.
 *
 * Accessibility:
 * - Default role is <nav> with <button aria-current="page">.
 * - Visible text label provides the accessible name (no duplicate
 *   aria-label).
 * - Pass `role="tablist"` to render as tabs (role="tab",
 *   aria-selected, tabIndex, aria-controls via `panelId`). Matches
 *   routine settings tabs semantics.
 */

export type ModuleNavColor = "finyk" | "fizruk" | "routine" | "nutrition";

export interface ModuleBottomNavItem {
  id: string;
  label: string;
  icon: ReactNode;
  /** Show a small unread/attention dot on the icon. */
  badge?: boolean;
  /** aria-controls target id (only used when role="tablist"). */
  panelId?: string;
}

export interface ModuleBottomNavProps {
  items: readonly ModuleBottomNavItem[];
  activeId: string;
  onChange: (id: string) => void;
  module: ModuleNavColor;
  ariaLabel?: string;
  /** "navigation" (default) renders buttons as nav links with aria-current;
   *  "tablist" renders role=tab with aria-selected. */
  role?: "navigation" | "tablist";
  /**
   * Warm the target page ahead of the tap (fires on pointer-down, ~100 ms
   * before `click`). Hosts whose pages are `React.lazy` should wire this to
   * the page's `preload()` — see the AI-CONTEXT note on the optimistic
   * highlight below for why a cold chunk otherwise looks like a dead button.
   */
  onPrefetch?: ((id: string) => void) | undefined;
  className?: string;
}

type ColorTokens = {
  /** Active-tab solid fill (light) — module strong-tier accent. */
  fillLight: string;
  /** Active-tab solid fill (dark «Чорнило») — luminescent tier-400 accent. */
  fillDark: string;
  /** Tiny unread/attention dot color. */
  badge: string;
};

const COLORS: Record<ModuleNavColor, ColorTokens> = {
  finyk: {
    fillLight: "bg-finyk-strong",
    fillDark: "dark:bg-brand-400",
    badge: "bg-finyk",
  },
  fizruk: {
    fillLight: "bg-fizruk-strong",
    fillDark: "dark:bg-cyan-400",
    badge: "bg-fizruk",
  },
  routine: {
    fillLight: "bg-routine-strong",
    fillDark: "dark:bg-rose-400",
    badge: "bg-routine",
  },
  nutrition: {
    fillLight: "bg-nutrition-strong",
    fillDark: "dark:bg-lime-400",
    badge: "bg-nutrition",
  },
};

export const ModuleBottomNav = memo(function ModuleBottomNav({
  items,
  activeId,
  onChange,
  module,
  ariaLabel,
  role = "navigation",
  onPrefetch,
  className,
}: ModuleBottomNavProps) {
  const tokens = COLORS[module];
  const isTablist = role === "tablist";
  const kbInsetPx = useVisualKeyboardInset(true);
  const hidden = kbInsetPx > 0;
  const tablistRef = useRef<HTMLDivElement>(null);
  // Див. `HubBottomNav` — та сама публікація нижнього inset-у для
  // fixed-шарів (тост-трей) з іншої гілки дерева.
  const navRef = useRef<HTMLElement>(null);
  useBottomInsetVar(navRef, BOTTOM_NAV_INSET_VAR, !hidden);

  // Optimistic tap acknowledgement.
  //
  // AI-CONTEXT: `activeId` is derived from the *committed* route, and
  // react-router v7 runs navigations inside `React.startTransition`. When the
  // target page is a `React.lazy` chunk that isn't cached yet, React keeps the
  // previous screen mounted rather than revealing the new Suspense fallback —
  // so for the whole download the tab doesn't highlight, the page doesn't
  // change, and the button reads as broken ("клікаються, але не перемикається
  // сторінка" — founder report 2026-07-31, intermittent because a warm chunk
  // commits instantly). Painting the tapped tab immediately makes every tap
  // acknowledged; `onPrefetch` shrinks the gap it has to cover.
  const [pendingId, setPendingId] = useState<string | null>(null);

  // The route committed (or the host ignored the change) — drop the override.
  useEffect(() => {
    setPendingId(null);
  }, [activeId]);

  // Ceiling so a navigation that never commits (blocked route, failed chunk →
  // ErrorBoundary) cannot strand the highlight on a page the user isn't on.
  useEffect(() => {
    if (pendingId == null) return;
    const t = setTimeout(() => setPendingId(null), 4_000);
    return () => clearTimeout(t);
  }, [pendingId]);

  const shownActiveId = pendingId ?? activeId;

  const handleSelect = (id: string) => {
    // Tapping the tab we are already on cancels any in-flight optimistic
    // highlight. Without the `else` branch a user who taps "Операції" and then
    // changes their mind back to "Огляд" would keep watching "Операції" stay
    // lit for the full 4 s ceiling while the route never moved.
    setPendingId(id === activeId ? null : id);
    onChange(id);
  };

  const handleTablistKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (!isTablist || hidden) return;
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) {
      return;
    }

    const tabs = Array.from(
      tablistRef.current?.querySelectorAll<HTMLButtonElement>('[role="tab"]') ??
        [],
    );
    if (tabs.length === 0) return;

    event.preventDefault();
    const focusedIndex = tabs.indexOf(
      document.activeElement as HTMLButtonElement,
    );
    const activeIndex = Math.max(
      0,
      items.findIndex((item) => item.id === shownActiveId),
    );
    const fromIndex = focusedIndex >= 0 ? focusedIndex : activeIndex;
    const targetIndex =
      event.key === "Home"
        ? 0
        : event.key === "End"
          ? tabs.length - 1
          : event.key === "ArrowRight"
            ? (fromIndex + 1) % tabs.length
            : (fromIndex - 1 + tabs.length) % tabs.length;
    const target = tabs[targetIndex];
    const item = items[targetIndex];
    if (!target || !item) return;
    target.focus();
    handleSelect(item.id);
  };

  return (
    <nav
      ref={navRef}
      aria-label={ariaLabel}
      aria-hidden={hidden || undefined}
      className={cn(
        "shrink-0 relative z-30",
        "bottom-nav-shell border border-line bg-panel shadow-lg",
        "transition-transform duration-base motion-reduce:transition-none",
        hidden && "translate-y-full pointer-events-none",
        className,
      )}
    >
      <div
        ref={tablistRef}
        className="relative flex h-[60px] pointer-coarse:h-[64px] gap-1 px-1"
        role={isTablist ? "tablist" : undefined}
        onKeyDown={isTablist ? handleTablistKeyDown : undefined}
      >
        {items.map((item) => {
          const active = shownActiveId === item.id;
          return (
            <button
              key={item.id}
              type="button"
              role={isTablist ? "tab" : undefined}
              id={isTablist ? `${module}-tab-${item.id}` : undefined}
              aria-selected={isTablist ? active : undefined}
              aria-current={
                !isTablist ? (active ? "page" : undefined) : undefined
              }
              aria-controls={isTablist ? item.panelId : undefined}
              data-pending={pendingId === item.id ? "true" : undefined}
              tabIndex={hidden ? -1 : isTablist ? (active ? 0 : -1) : undefined}
              // Pointer-down fires ~100 ms before `click` — enough of a head
              // start for the target page's chunk to be in flight (or done)
              // by the time the navigation commits.
              onPointerDown={onPrefetch ? () => onPrefetch(item.id) : undefined}
              onClick={() => handleSelect(item.id)}
              className={cn(
                // AI-DANGER: активна вкладка НЕ `flex-1`. Рівні частки на 320px
                // дають кожній ~60px, тоді як активна «пігулка» (іконка + підпис
                // до 88px + px-3) потребує ~140px: вона вивалювалась за комірку,
                // а остання вкладка — за правий край екрана («Активи» зрізано,
                // браузерний аудит 2026-08-26), і підпис активної різало
                // («Головна» 49→42px). `flex-initial` = розмір за вмістом із
                // правом стиснутись; неактивні ділять залишок.
                "relative flex items-center justify-center min-h-touch-target min-w-0",
                active ? "flex-initial" : "flex-1",
                "my-1.5 rounded-xl border border-transparent",
                "transition-[color,transform,border-color] duration-base",
                "active:scale-95",
                "focus:outline-none focus-visible:ring-2 focus-visible:ring-focus/45 focus-visible:ring-offset-2 focus-visible:ring-offset-panel",
                active ? "text-bg" : "text-text hover:text-text/80",
              )}
            >
              <span
                className={cn(
                  "relative flex items-center justify-center gap-1.5 rounded-2xl py-1.5",
                  "transition-[background-color,padding,color] duration-base",
                  active
                    ? cn("px-3 text-bg", tokens.fillLight, tokens.fillDark)
                    : "px-2 text-text",
                )}
                aria-hidden
              >
                <span className="relative shrink-0">
                  {item.icon}
                  {item.badge && !active && (
                    <span
                      className={cn(
                        "absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full border border-panel",
                        tokens.badge,
                      )}
                      aria-hidden
                    />
                  )}
                </span>
                {/*
                  `aria-hidden`: цей span — ВІЗУАЛЬНА половина лейбла, яка
                  згортається анімацією (`max-w-0 opacity-0`) для неактивних
                  вкладок. Нульова ширина й `opacity: 0` НЕ прибирають текст із
                  дерева доступності, тож разом із `sr-only`-двійником нижче
                  скрінрідер читав імʼя двічі — «ОпераціїОперації» (аудит
                  2026-08-04, знахідка 15). Єдиним джерелом імені лишаємо
                  `sr-only`-span: він не залежить від того, як саме візуальна
                  половина ховається зараз чи ховатиметься після редизайну.
                */}
                {/*
                  `text-ellipsis`: стеля `max-w-[88px]` — реальна межа, і
                  підпис, що в неї не вліз, раніше різало посеред слова
                  («Прогрес і замір» — знахідка QA-аудиту 2026-08-04, скарга
                  власника 2026-08-08). Багатослівний підпис у нижній
                  навігації — сам собою помилка (і його вкорочують у
                  відповідному `*Nav`-файлі), але обрив із трьома крапками
                  читається як навмисне скорочення, а не як зламана верстка.
                */}
                <span
                  aria-hidden
                  className={cn(
                    "text-style-caption font-semibold leading-none overflow-hidden text-ellipsis whitespace-nowrap",
                    "transition-[max-width,opacity] duration-base motion-reduce:transition-none",
                    active
                      ? "max-w-[88px] opacity-100"
                      : "max-w-0 opacity-0 pointer-events-none",
                  )}
                >
                  {item.label}
                </span>
              </span>
              <span className="sr-only">{item.label}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
});
