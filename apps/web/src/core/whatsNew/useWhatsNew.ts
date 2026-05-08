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

export function useWhatsNew(opts: UseWhatsNewOptions): UseWhatsNewResult {
  const { enabled } = opts;
  const [release, setRelease] = useState<WhatsNewRelease | null>(null);
  const [open, setOpen] = useState(false);
  const shownRef = useRef(false);

  useEffect(() => {
    if (!enabled) return;
    if (shownRef.current) return;

    const candidate = pickRelease(readLastSeenId());
    if (!candidate) return;

    const timer = window.setTimeout(() => {
      shownRef.current = true;
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
