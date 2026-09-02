/**
 * Last validated: 2026-08-08
 * Status: Active
 */
import { useEffect, useState } from "react";
import { cn } from "@shared/lib/ui/cn";
import { Icon } from "@shared/components/ui/Icon";
import { messages } from "@shared/i18n/uk";
import { isDemoMode, exitDemoToWizard } from "./demoMode";

/**
 * Persistent demo-mode marker + exit. Unlike `DemoModeBanner` (a
 * dismissible CTA card that only lives on the hub home), this badge
 * mounts in the global `AppShell`, so it stays visible on EVERY route —
 * including the module screens where the banner never showed. It is the
 * always-available way out of demo mode: once the visitor dismisses the
 * banner or wanders into a module, the badge is the only remaining exit
 * until a cold-start would bring the banner back.
 *
 * Clicking runs the shared `exitDemoToWizard()` — same action as the
 * banner's «Створити свій». It hard-navigates (`window.location.assign`)
 * rather than using the router, so it rebuilds the tree from scratch and
 * never desyncs the `useHubNavigation` FSM (an earlier in-app
 * `navigate()` version broke subsequent module navigation).
 */
export function DemoModeBadge() {
  // Synchronous read so the badge forks on first render. The demo flag
  // only changes via a hard reload (seed / reset both call
  // `window.location`), so a one-shot mount read is sufficient.
  const [demo] = useState<boolean>(() => isDemoMode());

  // Mark the document while the pill is up so the scroll regions can shrink
  // by its height (see `html[data-demo-badge] main` in mobile.css). The pill
  // is `fixed`, so without that the phone layout scrolls card content
  // straight underneath it — re-audit §7.2 rejected the "it floats like a
  // FAB" argument: a FAB is a corner action with its own safe zone, this is
  // a centred system banner sitting on live data.
  useEffect(() => {
    if (!demo) return;
    const root = document.documentElement;
    root.dataset["demoBadge"] = "";
    return () => {
      delete root.dataset["demoBadge"];
    };
  }, [demo]);

  if (!demo) return null;

  return (
    <button
      type="button"
      onClick={exitDemoToWizard}
      aria-label={messages.onboarding.demoBadgeLabel}
      title={messages.onboarding.demoBadgeTitle}
      className={cn(
        // Mobile: pin bottom-center, above the floating bottom-nav. The
        // mobile header fills the whole top band (logo + action-icon
        // cluster), so a top-pinned centre pill landed *on* the header and
        // was effectively invisible — the visitor lost the only exit from
        // demo. The bottom band only carries the ~64px floating nav (and a
        // right-aligned FAB on the hub), so a centred pill lifted clear of
        // the nav has an unobstructed, always-visible slot. Desktop headers
        // are narrow → keep the original top-centre placement from `sm:` up.
        //
        // `above-tabbar-pill` (styles/utilities.css) replaces a flat
        // `5rem`-above-safe-area guess: on Фізрук it undershot the *real*
        // tabbar (coarse-pointer 64px row + safe-area-pb) enough that the
        // pill's own hit-box landed ON TOP of the "Тренування" /
        // "Прогрес" tabs, so tapping them silently exited demo
        // instead of switching tabs — and while the rest-timer chip was up,
        // the pill covered 3 of its 5 controls too (live-browser audit,
        // 390×844). The utility reads the nav's *measured* height via a
        // shared CSS var (falls back to plain safe-area on nav-less routes
        // like `/welcome`, so no dead gap is reserved there) and adds
        // enough headroom to also clear per-module floating controls docked
        // just above the tabbar. Only the mobile band needs it — desktop
        // never had this bug, it moves to the header via `sm:top-2` below.
        "fixed left-1/2 -translate-x-1/2 z-300 select-none",
        "above-tabbar-pill",
        "sm:bottom-auto sm:top-2 sm:safe-area-pt",
        "inline-flex items-center gap-2 h-11 pl-4 pr-3.5 rounded-full",
        // Solid brand fill (not a translucent wash): the founder walked
        // through a live build and never noticed the pill against busy
        // page content. `bg-bg/95` + tinted text alone reads as chrome,
        // not a control — a saturated fill is the only treatment that
        // reads as "tap me" at a glance in both themes. `brand-strong`
        // is the WCAG-AAA companion for `text-white` on a solid fill
        // (design-system rule); dark inverts to the light-stone chip +
        // dark ink, mirroring `Button`'s `primary` variant so the pill
        // stays visually consistent with every other hub CTA.
        "bg-brand-strong text-white dark:bg-brand-100 dark:text-brand-900",
        "text-style-label font-semibold shadow-e3",
        "hover:bg-brand-900 hover:shadow-e4 dark:hover:bg-brand-200",
        "active:scale-[0.98] motion-safe:transition-all motion-safe:duration-base",
        "focus:outline-none focus-visible:ring-2 focus-visible:ring-focus/45 focus-visible:ring-offset-2 focus-visible:ring-offset-bg",
        "motion-safe:animate-fade-in",
      )}
    >
      <Icon name="sergeant" size="sm" strokeWidth={2} aria-hidden />
      <span>{messages.onboarding.demoBadgeText}</span>
      <span aria-hidden className="opacity-70">
        ·
      </span>
      <span>{messages.onboarding.demoBadgeExit}</span>
    </button>
  );
}
