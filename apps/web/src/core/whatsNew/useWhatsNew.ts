import { useCallback, useEffect, useRef, useState } from "react";
import { ANALYTICS_EVENTS, trackEvent } from "../observability/analytics";
import { pickRelease, type WhatsNewRelease } from "./releases";
import { readLastSeenId, writeLastSeenId } from "./storage";

/**
 * `<WhatsNewModal />` driver hook.
 *
 * Поведінка:
 *   - **Auto-show:** при mount (з мікро-затримкою, щоб HUB-render
 *     встиг заштампувати outcome-card / hints) обчислює `pickRelease`
 *     vs `lastSeenId` з localStorage. Якщо є unseen latest реліз —
 *     виставляє `open: true` і шле `whats_new_shown` PostHog event.
 *   - **Delay** — `SHOW_DELAY_MS = 2500` mirroring HintsOrchestrator
 *     (`apps/web/src/core/hints/HintsOrchestrator.tsx`); FTUX-сурфейс
 *     і modal не повинні гонятись за one-shot focus.
 *   - **Gate.** `enabled` контролюється викликачем (HubHomeView
 *     ставить `false` у FTUX-session window, щоб не конкурувати з
 *     outcome-card §3.1 PR-09 з master tracker'а).
 *   - **Persist on close.** Незалежно від via (`close` / `overlay` /
 *     `esc` / `cta`) ми зберігаємо `lastSeenId = release.id`. Modal
 *     — one-shot per-release; повторні візити не показують повторно.
 *
 * Тестується ізольовано через `useWhatsNew.test.ts` — викликач
 * мутує `localStorage` між раундами і перевіряє `open` стан.
 */

export interface UseWhatsNewOptions {
  enabled: boolean;
}

export interface UseWhatsNewResult {
  open: boolean;
  release: WhatsNewRelease | null;
  onClose: (via: "close" | "overlay" | "esc") => void;
  onCtaClick: () => void;
}

export const SHOW_DELAY_MS = 2500;

// Re-mount guard. The hook lives on `<HubHomeView>`, which can re-mount
// without the user dismissing the modal (key flips on auth load, route
// transition back to the hub shell, HMR in dev). Without this guard the
// fresh mount re-runs the 2.5s timer from scratch — user sees the modal,
// then a ~2s blank flash, then the modal again. Tracking shown release ids
// at module scope lets a re-mount skip the delay and re-open immediately,
// so the swap reads as a single frame instead of "appears → disappears for
// 2s → reappears". Dismissal still flows through localStorage via
// `writeLastSeenId`, which is the canonical persistence — this set only
// guards the within-session shown-but-not-dismissed window.
const SESSION_SHOWN_RELEASE_IDS = new Set<string>();

/**
 * Test-only escape hatch — wipes the in-memory shown-set so a fresh
 * `renderHook(...)` re-exercises the 2.5s timer path. Production code MUST
 * NOT call this; the set is intentionally retained across the page session.
 */
export function __resetWhatsNewSessionForTesting(): void {
  SESSION_SHOWN_RELEASE_IDS.clear();
}

export function useWhatsNew(opts: UseWhatsNewOptions): UseWhatsNewResult {
  const { enabled } = opts;

  // If this release was already shown in this session (e.g. re-mount before
  // dismissal), pre-open immediately so there's no ~2.5s flash. Lazy
  // initializers run synchronously at mount — no setState in effect needed.
  const [release, setRelease] = useState<WhatsNewRelease | null>(() => {
    if (!enabled) return null;
    const c = pickRelease(readLastSeenId());
    return c && SESSION_SHOWN_RELEASE_IDS.has(c.id) ? c : null;
  });
  const [open, setOpen] = useState(() => {
    if (!enabled) return false;
    const c = pickRelease(readLastSeenId());
    return !!(c && SESSION_SHOWN_RELEASE_IDS.has(c.id));
  });
  // shownRef guards the effect: true → skip the timer path (already open or
  // already scheduled). Initialized from the lazy open state above.
  const shownRef = useRef(open);

  useEffect(() => {
    if (!enabled) return;
    if (shownRef.current) return; // pre-opened by lazy init or previous timer

    const candidate = pickRelease(readLastSeenId());
    if (!candidate) return;

    // Fast path: session guard pre-populated state via lazy init — just mark
    // shownRef so a re-effect (e.g. after HMR) doesn't schedule a timer.
    if (SESSION_SHOWN_RELEASE_IDS.has(candidate.id)) {
      shownRef.current = true;
      return;
    }

    const timer = window.setTimeout(() => {
      shownRef.current = true;
      SESSION_SHOWN_RELEASE_IDS.add(candidate.id);
      setRelease(candidate);
      setOpen(true);
      trackEvent(ANALYTICS_EVENTS.WHATS_NEW_SHOWN, {
        id: candidate.id,
        release_date: candidate.date,
      });
    }, SHOW_DELAY_MS);

    return () => window.clearTimeout(timer);
  }, [enabled]);

  const persistAndClose = useCallback((id: string) => {
    writeLastSeenId(id);
    setOpen(false);
  }, []);

  const onClose = useCallback(
    (via: "close" | "overlay" | "esc") => {
      if (!release) {
        setOpen(false);
        return;
      }
      trackEvent(ANALYTICS_EVENTS.WHATS_NEW_DISMISSED, {
        id: release.id,
        via,
      });
      persistAndClose(release.id);
    },
    [release, persistAndClose],
  );

  const onCtaClick = useCallback(() => {
    if (!release) {
      setOpen(false);
      return;
    }
    // Releases without a CTA still close via this handler when the
    // user taps the only "Зрозуміло"-style button. Persist regardless
    // so a re-mount does not re-show the same release — matches the
    // hook's docstring contract ("незалежно від via … зберігаємо
    // lastSeenId"). The analytics event is CTA-specific, so it only
    // fires when the release actually had a CTA configured.
    if (release.cta) {
      trackEvent(ANALYTICS_EVENTS.WHATS_NEW_CTA_CLICKED, {
        id: release.id,
        href: release.cta.href,
      });
    }
    persistAndClose(release.id);
  }, [release, persistAndClose]);

  return { open, release, onClose, onCtaClick };
}
