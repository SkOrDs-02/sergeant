/**
 * Last validated: 2026-05-14
 * Status: Active
 */
import { useState } from "react";
import { Button } from "@shared/components/ui/Button";
import { Icon } from "@shared/components/ui/Icon";
import { trackEvent, ANALYTICS_EVENTS } from "../observability/analytics";
import { isDemoMode, exitDemoToWizard } from "./seedDemoData";
import { useHubBannerSlot } from "../hub/bannerBudget";

// Key name kept from the original "dismiss for the session" feature —
// renaming the string would drop anyone mid-session back into the
// (now non-existent) fully-hidden state on their next render. Semantics
// changed 2026-08: the flag now means "collapsed", not "removed" — the
// CTA path must stay reachable on Hub Home at all times in demo (founder
// decision: the X must not remove the only in-hub exit, just shrink it).
const SESSION_COLLAPSED_KEY = "hub_demo_banner_dismissed_session";

/**
 * S4.1 retention banner. Surfaces inside the populated hub whenever
 * the local store holds a demo payload (see `isDemoMode()` /
 * `seedDemoData()`), nudging the user toward the real wizard.
 *
 * - "Створити свій" → `resetDemoData()` + redirect to `/welcome` so
 *   the regular onboarding flow takes over against an empty store.
 * - Close (X) → collapses into a compact single-row variant for the
 *   rest of the session (sessionStorage key is cleared on the next
 *   cold start; the demo flag itself stays). The collapsed row keeps
 *   "Створити свій" tappable — the X must not be able to fully hide
 *   the in-hub path out of demo mode, only shrink its footprint.
 * - Chevron on the collapsed row re-expands back to the full card.
 *
 * Analytics:
 *   `demo_to_wizard_confirmed` on CTA, `demo_dismissed` on collapse.
 *   Kept outside the `onboarding_*` funnel so demo browsing doesn't
 *   pollute activation cohorts.
 */
export function DemoModeBanner() {
  // Synchronous reads so the banner can fork on first render without
  // waiting for an effect. Both checks tolerate `localStorage` /
  // `sessionStorage` being unavailable (incognito, hardened browsers,
  // SSR pre-hydrate).
  const [demo] = useState<boolean>(() => isDemoMode());
  const [collapsed, setCollapsed] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    try {
      return window.sessionStorage.getItem(SESSION_COLLAPSED_KEY) === "1";
    } catch {
      return false;
    }
  });

  // Бюджет банерів хабу (F3, 2026-09-01): пріоритет 1 — шлях «Створити
  // свій» лишається досяжним завжди, коли demo активне.
  const hasSlot = useHubBannerSlot("demoMode", demo);

  if (!demo || !hasSlot) return null;

  const collapse = () => {
    trackEvent(ANALYTICS_EVENTS.DEMO_DISMISSED);
    try {
      window.sessionStorage.setItem(SESSION_COLLAPSED_KEY, "1");
    } catch {
      /* sessionStorage unavailable — banner just stays collapsed in-memory. */
    }
    setCollapsed(true);
  };

  const expand = () => {
    try {
      window.sessionStorage.removeItem(SESSION_COLLAPSED_KEY);
    } catch {
      /* noop */
    }
    setCollapsed(false);
  };

  const goToWizard = () => {
    try {
      window.sessionStorage.removeItem(SESSION_COLLAPSED_KEY);
    } catch {
      /* noop */
    }
    // Shared exit: fires DEMO_TO_WIZARD_CONFIRMED, wipes the demo
    // payload, and hard-navigates to `/welcome`. Hard navigation is
    // deliberate — the empty-store assumptions across React Query
    // caches, MMKV-web, and PWA prefetch are easier to reset by
    // reloading than by tearing them down in JS.
    exitDemoToWizard();
  };

  if (collapsed) {
    return (
      <div
        role="region"
        aria-label="Демо-режим"
        className="flex items-center gap-2 rounded-2xl border border-brand-500/40 bg-brand-500/5 px-3 py-2 shadow-card"
      >
        <Icon
          name="sergeant"
          size={16}
          className="shrink-0 text-brand-strong dark:text-brand"
          aria-hidden
        />
        <span className="min-w-0 flex-1 truncate text-style-caption text-muted">
          Це приклад
        </span>
        <Button
          type="button"
          variant="ghost"
          size="xs"
          className="shrink-0 text-brand-strong dark:text-brand"
          onClick={goToWizard}
        >
          Створити свій
        </Button>
        <Button
          variant="ghost"
          size="xs"
          iconOnly
          onClick={expand}
          aria-label="Розгорнути банер демо-режиму"
          className="shrink-0 text-muted hover:text-text"
        >
          <Icon name="chevron-down" size={16} />
        </Button>
      </div>
    );
  }

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
          <Icon name="sergeant" size={18} />
        </span>
        <div className="min-w-0 flex-1">
          {/* h2, не h3: банер іде одразу після sr-only h1 «Головна», і h3
              розривав heading-order (axe moderate, design-audit P3). */}
          <h2 className="text-style-label text-text">Це приклад</h2>
          <p className="text-style-body text-muted mt-1 leading-snug">
            Цифри й категорії – для демонстрації. Натисни «Створити свій», щоб
            почати з чистого аркуша.
          </p>
        </div>
        <Button
          variant="ghost"
          size="xs"
          iconOnly
          onClick={collapse}
          aria-label="Згорнути банер демо-режиму"
          className="shrink-0 -mt-1 -mr-1 text-muted hover:text-text"
        >
          <Icon name="close" size={16} />
        </Button>
      </div>
      <div className="mt-3 flex flex-col gap-2 sm:flex-row">
        {/* Мова «Папір» П2 — правило рівня системи, не теми: якір хаба це
            привітання + найсильніша дані-цифра, і системний банер не має
            права бути найгучнішим ні в світлій темі (було — emerald), ні в
            темній (`primary-ink` там інвертується в білу заливку). Outline
            достатньо: банер уже має рамку та іконку, а вихід із демо
            дублюється постійною пігулкою `DemoModeBadge`.
            Ширина — auto, а не `flex-1`: на 375 повноширинна кнопка
            конкурувала з якорем. */}
        <Button
          type="button"
          variant="secondary"
          size="sm"
          className="self-start"
          onClick={goToWizard}
        >
          Створити свій
        </Button>
      </div>
    </div>
  );
}
