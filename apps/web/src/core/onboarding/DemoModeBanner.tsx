import { useState } from "react";
import { Button } from "@shared/components/ui/Button";
import { Icon } from "@shared/components/ui/Icon";
import { trackEvent, ANALYTICS_EVENTS } from "../observability/analytics";
import { isDemoMode, resetDemoData } from "./seedDemoData";

const SESSION_DISMISS_KEY = "hub_demo_banner_dismissed_session";

/**
 * S4.1 retention banner. Surfaces inside the populated hub whenever
 * the local store holds a demo payload (see `isDemoMode()` /
 * `seedDemoData()`), nudging the user toward the real wizard.
 *
 * - "Створити свій" → `resetDemoData()` + redirect to `/welcome` so
 *   the regular onboarding flow takes over against an empty store.
 * - Close (X) → hide for the rest of the session (sessionStorage key
 *   is cleared on the next cold start; the demo flag itself stays).
 *
 * Analytics:
 *   `demo_to_wizard_confirmed` on CTA, `demo_dismissed` on close.
 *   Kept outside the `onboarding_*` funnel so demo browsing doesn't
 *   pollute activation cohorts.
 */
export function DemoModeBanner() {
  // Synchronous reads so the banner can fork on first render without
  // waiting for an effect. Both checks tolerate `localStorage` /
  // `sessionStorage` being unavailable (incognito, hardened browsers,
  // SSR pre-hydrate).
  const [demo] = useState<boolean>(() => isDemoMode());
  const [dismissed, setDismissed] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    try {
      return window.sessionStorage.getItem(SESSION_DISMISS_KEY) === "1";
    } catch {
      return false;
    }
  });

  if (!demo || dismissed) return null;

  const dismiss = () => {
    trackEvent(ANALYTICS_EVENTS.DEMO_DISMISSED);
    try {
      window.sessionStorage.setItem(SESSION_DISMISS_KEY, "1");
    } catch {
      /* sessionStorage unavailable — banner just stays hidden in-memory. */
    }
    setDismissed(true);
  };

  const goToWizard = () => {
    trackEvent(ANALYTICS_EVENTS.DEMO_TO_WIZARD_CONFIRMED);
    resetDemoData();
    try {
      window.sessionStorage.removeItem(SESSION_DISMISS_KEY);
    } catch {
      /* noop */
    }
    // Hard navigation: the empty-store assumptions across React
    // Query caches, MMKV-web, and PWA prefetch are easier to reset
    // by reloading onto `/welcome` than by tearing them down in JS.
    try {
      window.location.assign("/welcome");
    } catch {
      /* noop */
    }
  };

  return (
    <div
      role="region"
      aria-label="Демо-режим"
      className="rounded-2xl border border-brand-500/40 bg-brand-500/5 p-4 shadow-card"
    >
      <div className="flex items-start gap-3">
        <span
          className="shrink-0 w-9 h-9 rounded-xl bg-brand-500/15 text-brand-strong dark:text-brand flex items-center justify-center"
          aria-hidden
        >
          <Icon name="sparkles" size={18} />
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="text-style-label text-text">Це приклад</h3>
          <p className="text-xs text-muted mt-1 leading-snug">
            Цифри й категорії — для демонстрації. Натисни «Створити свій», щоб
            почати з чистого аркуша.
          </p>
        </div>
        <Button
          variant="ghost"
          size="xs"
          iconOnly
          onClick={dismiss}
          aria-label="Сховати"
          className="shrink-0 -mt-1 -mr-1 text-muted hover:text-text"
        >
          <Icon name="close" size={16} />
        </Button>
      </div>
      <div className="mt-3 flex flex-col gap-2 sm:flex-row">
        <Button
          type="button"
          variant="primary"
          size="sm"
          className="flex-1 min-h-[40px]"
          onClick={goToWizard}
        >
          Створити свій
        </Button>
      </div>
    </div>
  );
}
