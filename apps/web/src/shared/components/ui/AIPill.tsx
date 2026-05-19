/**
 * Sergeant Design System — `AIPill` (PR-7a).
 *
 * @lifecycle experimental (introduced 2026-05; promoted to active after PR-8)
 * @see docs/design/redesign-v2/governance.md § AI surfaces
 *
 * Persistent AI affordance що сидить НАД bottom-nav (z-sticky tier).
 * Двi окремi кнопки в одному visual pill:
 *   - **Primary** (зліва) — tap → navigate(/chat). Висить як "глобальний"
 *     entry-point до chat sheet з контекстним placeholder per module.
 *   - **Mic** (справа) — tap → trigger voice input handler (TODO у PR-8;
 *     поки фігурує як placeholder for Whisper-API wiring).
 *
 * ## A11y refactor vs. handoff JSX
 *
 * Handoff `03-new-components.md` рендерив зовнішній `<button>` з вкладеним
 * `<span role="button">` для mic. Це **nested-interactive bug**:
 *   - axe (Hard Rule #14) валиться з `role-name` violation
 *   - screen readers double-announce ("Відкрити AI помічника. Голосовий ввід.")
 *   - keyboard Tab focuses outer + inner separately, друкуючи дві кнопки
 *
 * Виправлення (Sergeant intent):
 *   - Outer container — `<div role="group" aria-label="…">` (NOT a button)
 *   - Inside — два `<button type="button">` як siblings із спільним
 *     visual pill chrome via flexbox / position
 *   - Mic-button has stopPropagation НЕ потрібен, бо primary і mic — це
 *     окремі focusable elements у DOM
 *
 * ## Module context
 *
 * `module` prop (`null` для hub) керує:
 *   - placeholder text (Запитай про витрати… / Що сьогодні робити… / …)
 *   - icon gradient (sparkle сам тінтується через brand-400 → module-strong)
 *
 * ## Z-index + positioning
 *
 * `fixed left-3.5 right-[4.5rem] bottom-[…]` — лишає простір справа для FAB.
 * `z-sticky` (Sergeant semantic) — над content/dropdowns, під modals.
 * `safe-area-inset-bottom` додається до bottom offset для iOS.
 *
 * ## Hide-on conditions
 *
 * Не рендеримо коли:
 *   - FTUX session (`inFtuxSession` у caller — caller просто не рендерить)
 *   - `/chat` route (chat is already open)
 *   - Full-screen overlays (login, scanner viewfinder)
 *
 * Caller відповідає за conditional rendering — компонент завжди показує
 * себе якщо змонтований.
 */

import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import type { ModuleAccent } from "@sergeant/design-tokens";
import { Icon } from "@shared/components/ui/Icon";
// Relative import — tsconfig.json `paths` has no `@core/*` alias
// (existing aliases: @shared/*, @assets/*, @finyk/*, @fizruk/*,
// @routine/*, @nutrition/*). The PR-7a build broke prod because
// `@core/app/appPaths` was an aspirational alias that doesn't exist;
// using a relative path matches the established pattern (HubHomeView
// itself imports `./appPaths`).
import { CHAT_PATH } from "../../../core/app/appPaths";
import { hapticTap } from "@shared/lib/adapters/haptic";
import { cn } from "@shared/lib/ui/cn";
import { messages } from "@shared/i18n/uk";

export interface AIPillProps {
  /** Module context that drives the placeholder copy. `null` = hub. */
  module?: ModuleAccent | null;
  /** Override default placeholder. */
  placeholder?: string;
  /** Bottom offset in px (default 84 — sits above ModuleBottomNav). */
  bottom?: number;
  /** Voice input callback (PR-8 will wire Whisper). */
  onMicTap?: () => void;
  className?: string;
}

const DEFAULT_PLACEHOLDER: Record<ModuleAccent | "hub", string> = {
  finyk: "Запитай про витрати…",
  fizruk: "Що сьогодні робити?",
  routine: "Запитай про звички…",
  nutrition: "Що приготувати?",
  hub: "Запитай Sergeant…",
};

/**
 * Auto-hide hook: collapses the pill into a compact pip when the user
 * scrolls down past `threshold`, restores it when they scroll back up.
 * Pattern matches Material's bottom-bar shrink-on-scroll — keeps the
 * affordance reachable but stops it from covering content while the
 * user is reading.
 *
 * The Sergeant hub/module shells render content inside a flex column
 * with `<div class="flex-1 overflow-y-auto min-h-0">` as the actual
 * scroll container — `window` itself almost never scrolls. So a plain
 * `window` listener never fires under real user gestures (confirmed in
 * prod via DOM probe: 3 window-scrolls dispatched, hook never toggled).
 *
 * Fix: listen in **capture phase** on `document`. `scroll` events don't
 * bubble, but capture-phase handlers on ancestors still fire for any
 * descendant scroll source — window, `<html>`, or any inner overflow
 * container. We then read the scroll position from `event.target`
 * (or fall back to `window.scrollY` when the document itself scrolled).
 *
 * Listener is `passive: true` + rAF-throttled so it never blocks the
 * scrolling thread. `lastY` tracks direction so a tiny jitter near the
 * threshold doesn't flicker. `lastTarget` keeps the per-container
 * baseline so a swap between two scroll hosts doesn't read a negative
 * `dy` (which would incorrectly snap the pill back open).
 */
function useCollapseOnScroll(threshold = 80) {
  const [collapsed, setCollapsed] = useState(false);
  const lastY = useRef(0);
  const lastTarget = useRef<EventTarget | null>(null);
  const ticking = useRef(false);
  useEffect(() => {
    if (typeof window === "undefined") return;
    const onScroll = (event: Event) => {
      if (ticking.current) return;
      ticking.current = true;
      const target = event.target;
      window.requestAnimationFrame(() => {
        let y = 0;
        if (target instanceof Element) {
          y = target.scrollTop;
        } else if (target === document || target === document.documentElement) {
          y = window.scrollY || window.pageYOffset || 0;
        } else {
          y = window.scrollY || window.pageYOffset || 0;
        }
        // Reset baseline when the user starts scrolling a different
        // container (e.g. switching between nested scroll hosts).
        // Without this, switching from a deeply-scrolled host to a
        // fresh one would emit a huge negative `dy` and snap the pill
        // back open even though the user is actively scrolling down.
        if (lastTarget.current !== target) {
          lastTarget.current = target;
          lastY.current = y;
          ticking.current = false;
          return;
        }
        const dy = y - lastY.current;
        if (y > threshold && dy > 4) setCollapsed(true);
        else if (dy < -4 || y < threshold / 2) setCollapsed(false);
        lastY.current = y;
        ticking.current = false;
      });
    };
    // Capture phase: scroll events don't bubble, but ancestor capture
    // handlers DO fire for descendant scroll sources.
    document.addEventListener("scroll", onScroll, {
      passive: true,
      capture: true,
    });
    return () =>
      document.removeEventListener("scroll", onScroll, {
        capture: true,
      } as EventListenerOptions);
  }, [threshold]);
  return collapsed;
}

export function AIPill({
  module = null,
  placeholder,
  bottom = 84,
  onMicTap,
  className,
}: AIPillProps) {
  const navigate = useNavigate();
  const placeholderText = placeholder ?? DEFAULT_PLACEHOLDER[module ?? "hub"];
  const collapsed = useCollapseOnScroll();

  const openChat = () => {
    hapticTap();
    navigate(CHAT_PATH);
  };

  const handleMic = () => {
    hapticTap();
    onMicTap?.();
    // TODO(PR-8): wire Whisper voice input when onMicTap is undefined.
  };

  return (
    <div
      role="group"
      aria-label={messages.nav.openAssistant}
      data-collapsed={collapsed ? "true" : undefined}
      style={{ bottom: `calc(${bottom}px + env(safe-area-inset-bottom, 0px))` }}
      className={cn(
        // Fixed pill positioning. Collapsed state shrinks to a circular
        // pip on the right edge so the content underneath stays
        // readable; expanded state spans `left-3.5 right-[4.5rem]` and
        // leaves space for the module FAB.
        "fixed z-sticky",
        "transition-[left,width,padding,box-shadow] duration-200 ease-out motion-reduce:transition-none",
        collapsed
          ? "left-auto right-[4.5rem] w-11 pl-1 pr-1"
          : "left-3.5 right-[4.5rem] pl-2.5 pr-2",
        // Visual chrome — translucent glass surface with v2 pill shadow.
        // `surface-strong-glass` is alpha-baked (0.93 light / 0.10 dark /
        // 1.0 HC) so HC mode reads as a solid pill.
        "h-11 bg-surface-strong-glass backdrop-blur-md",
        "border border-line rounded-full shadow-pill",
        "flex items-center gap-2",
        className,
      )}
    >
      {/* Primary tap target — opens chat sheet. Takes the full remaining
          width so the entire pill body feels tappable. */}
      <button
        type="button"
        onClick={openChat}
        aria-label={messages.nav.openAssistant}
        className={cn(
          "flex items-center gap-2 min-w-0",
          collapsed ? "flex-none" : "flex-1",
          "focus:outline-none focus-visible:rounded-full focus-visible:ring-2",
          "focus-visible:ring-focus/45 focus-visible:ring-offset-2",
          "focus-visible:ring-offset-bg",
        )}
      >
        <span
          aria-hidden
          className={cn(
            "w-7 h-7 rounded-full shrink-0 text-white",
            "flex items-center justify-center",
            "bg-gradient-to-br from-brand-400 to-brand-strong",
          )}
        >
          <Icon name="sparkle" size={14} strokeWidth={2.2} />
        </span>
        {!collapsed && (
          <span className="flex-1 text-left text-style-body-sm text-muted truncate min-w-0">
            {placeholderText}
          </span>
        )}
      </button>

      {/* Mic button — sibling, not nested. Keyboard Tab order: primary
          chat button first, then mic. Hidden in collapsed mode so the
          pip stays tap-target-clean and unambiguous. */}
      {!collapsed && (
        <button
          type="button"
          onClick={handleMic}
          aria-label={messages.nav.voiceInput}
          className={cn(
            "w-7 h-7 rounded-full shrink-0",
            "flex items-center justify-center",
            "text-muted hover:text-text hover:bg-panel",
            "transition-colors",
            "focus:outline-none focus-visible:ring-2",
            "focus-visible:ring-focus/45 focus-visible:ring-offset-2",
            "focus-visible:ring-offset-bg",
          )}
        >
          <Icon name="mic" size={15} strokeWidth={2} />
        </button>
      )}
    </div>
  );
}
