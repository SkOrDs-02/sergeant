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
 *   - **Mic** (справа) — tap → Groq Whisper voice input (PR-8). Recording
 *     state pulses red, transcript surfaces у `<PendingVoiceChip>` для
 *     3-сек confirm, then navigates до `/chat?q=<transcript>` для редагування
 *     і ручного submit. `onMicTap` prop лишається escape-hatch для caller,
 *     що хоче кастомний handler (stories / experiments).
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

import { useCallback, useEffect, useRef, useState } from "react";
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
import { emitHubBus } from "@shared/lib/modules/hubBus";
import { hapticTap } from "@shared/lib/adapters/haptic";
import { cn } from "@shared/lib/ui/cn";
import { messages } from "@shared/i18n/uk";
import { useToast } from "@shared/hooks/useToast";
import { PendingVoiceChip } from "./voice/PendingVoiceChip";
import { useGroqVoiceInput } from "./voice/useGroqVoiceInput";

export interface AIPillProps {
  /** Module context that drives the placeholder copy. `null` = hub. */
  module?: ModuleAccent | null;
  /** Override default placeholder. */
  placeholder?: string;
  /** Bottom offset in px (default 84 — sits above ModuleBottomNav). */
  bottom?: number;
  /**
   * Optional override for the mic button. When provided, completely
   * replaces the built-in Whisper flow — the caller becomes responsible
   * for capturing audio / transcription. Leave undefined для default
   * Groq Whisper → `/chat?q=…` pipeline.
   */
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
 * Whisper-specific domain prompts per module. Покращує точність на
 * специфічній лексиці модуля (Hard Rule #voice). Тримаємо короткі — Groq
 * `prompt` truncates >1024 chars анівсе одно.
 */
const VOICE_PROMPT_HINT: Record<ModuleAccent | "hub", string> = {
  finyk: "витрати, кафе, продукти, транспорт, кава, обід, такси, гривні",
  fizruk: "присід, жим, тяга, підтягування, віджимання, кардіо, тренування",
  routine: "звичка, ранкова рутина, медитація, читання, вода, сон",
  nutrition: "сніданок, обід, вечеря, гречка, яйце, овочі, білок, калорії",
  hub: "Sergeant, фінанси, тренування, звички, харчування",
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
  const [collapsed, setCollapsed] = useState(true);
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
        else if (dy < -4) setCollapsed(false);
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
  const toast = useToast();
  const placeholderText = placeholder ?? DEFAULT_PLACEHOLDER[module ?? "hub"];
  const collapsed = useCollapseOnScroll();

  // Voice wiring (PR-8). Pattern mirrors `VoiceMicButton`:
  //   1. Hold mic → Groq Whisper records.
  //   2. Release → upload, fire `onResult(transcript)`.
  //   3. `<PendingVoiceChip>` shows transcript with a 3-second
  //      auto-confirm timer. User can tap to commit instantly, ✕ to
  //      cancel, or wait out the timer.
  //   4. On commit → navigate to `/chat?q=<transcript>` so user lands in
  //      chat with the prompt pre-filled and editable (does NOT auto-send;
  //      `autoSend` query param стає `0` за замовчуванням у HubChatPage).
  // Anchor-rect для чипа знімається з mic-кнопки в момент успішного
  // транскрипту, бо чип рендериться у portal і йому потрібно
  // позиціонуватися відносно в'юпорта.
  const micButtonRef = useRef<HTMLButtonElement | null>(null);
  const [pending, setPending] = useState<{
    text: string;
    anchorRect: DOMRect;
  } | null>(null);

  const handleTranscript = useCallback((text: string) => {
    const trimmed = text.trim();
    if (!trimmed) return; // empty/silence — silent dismiss per spec
    const rect =
      micButtonRef.current?.getBoundingClientRect() ??
      new DOMRect(window.innerWidth / 2, window.innerHeight / 2, 0, 0);
    setPending({ text: trimmed, anchorRect: rect });
  }, []);

  // Ref lets handleError access voice.toggle without a circular dep
  // (handleError is defined before voice is initialised below).
  const voiceToggleRef = useRef<(() => void) | null>(null);

  const handleError = useCallback(
    (message: string) => {
      toast.error(message, undefined, {
        label: "Спробувати знову",
        onClick: () => voiceToggleRef.current?.(),
      });
    },
    [toast],
  );

  const voice = useGroqVoiceInput({
    lang: "uk-UA",
    promptHint: VOICE_PROMPT_HINT[module ?? "hub"],
    onResult: handleTranscript,
    onError: handleError,
  });
  voiceToggleRef.current = voice.toggle;

  const commitPending = useCallback(() => {
    setPending((curr) => {
      if (!curr) return null;
      hapticTap();
      // Land in chat with the transcript ready to edit. `autoSend=0` is
      // the default — user must tap Send themselves (per spec: "don't
      // auto-submit transcript").
      const search = new URLSearchParams({ q: curr.text }).toString();
      navigate(`${CHAT_PATH}?${search}`);
      return null;
    });
  }, [navigate]);

  const cancelPending = useCallback(() => {
    setPending(null);
  }, []);

  // Anmount safety — if AIPill is unmounted while a pending chip is
  // visible (route change, parent re-mount), discard rather than commit.
  useEffect(() => {
    return () => {
      setPending(null);
    };
  }, []);

  const openChat = () => {
    hapticTap();
    // Sergeant v2 Phase 7 D5 — emit the bus event instead of
    // `navigate(CHAT_PATH)`. `useAppEffects` listens and opens the
    // bottom-sheet overlay over the current route (preserves scroll
    // position, doesn't tear down the surface beneath). The voice
    // commit flow above still navigates to `/chat?q=…` so the
    // transcript prefill arrives via URL — that path lands on the
    // full-screen `HubChatPage` and remains the deep-link contract.
    emitHubBus("openChat", { message: null, autoSend: false });
  };

  const handleMic = () => {
    hapticTap();
    // Discard any in-flight pending chip — explicit press = "retry / new take".
    if (pending) setPending(null);
    // Legacy escape hatch: caller may inject its own `onMicTap` (used by
    // stories / experiments). When provided it wins and we skip the
    // Whisper flow entirely.
    if (onMicTap) {
      onMicTap();
      return;
    }
    voice.toggle();
  };

  const recording = voice.listening || voice.uploading;
  const micAriaLabel = voice.listening
    ? "Зупинити запис"
    : voice.uploading
      ? "Розпізнаю…"
      : messages.nav.voiceInput;

  return (
    <>
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
            pip stays tap-target-clean and unambiguous.

            Coarse-pointer min 44×44 via `min-h-touch-target` /
            `min-w-touch-target` keeps the WCAG tap-target rule even with
            the visual 28px glyph circle. */}
        {!collapsed && (
          <button
            ref={micButtonRef}
            type="button"
            onClick={handleMic}
            disabled={voice.uploading}
            aria-label={micAriaLabel}
            aria-pressed={voice.listening || undefined}
            className={cn(
              "w-7 h-7 rounded-full shrink-0",
              "pointer-coarse:min-h-[44px] pointer-coarse:min-w-[44px]",
              "flex items-center justify-center",
              "transition-colors",
              recording
                ? "bg-danger/15 text-danger motion-safe:animate-pulse"
                : "text-muted hover:text-text hover:bg-panel",
              voice.uploading && "opacity-60",
              "focus:outline-none focus-visible:ring-2",
              "focus-visible:ring-focus/45 focus-visible:ring-offset-2",
              "focus-visible:ring-offset-bg",
            )}
          >
            <Icon name="mic" size={15} strokeWidth={2} />
          </button>
        )}
      </div>
      {pending && (
        <PendingVoiceChip
          text={pending.text}
          anchorRect={pending.anchorRect}
          onConfirm={commitPending}
          onCancel={cancelPending}
        />
      )}
    </>
  );
}
