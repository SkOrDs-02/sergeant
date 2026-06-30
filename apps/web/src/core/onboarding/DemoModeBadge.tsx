/**
 * Last validated: 2026-06-28
 * Status: Active
 */
import { useState } from "react";
import { cn } from "@shared/lib/ui/cn";
import { Icon } from "@shared/components/ui/Icon";
import { messages } from "@shared/i18n/uk";
import { isDemoMode, exitDemoToWizard } from "./seedDemoData";

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
        "fixed left-1/2 -translate-x-1/2 z-300 select-none",
        "bottom-[calc(env(safe-area-inset-bottom,0px)+5rem)]",
        "sm:bottom-auto sm:top-2 sm:safe-area-pt",
        "inline-flex items-center gap-1.5 h-8 pl-3 pr-2.5 rounded-full",
        // Solid surface (not a 10% wash): the pill floats over arbitrary
        // page content, so a near-opaque panel keeps it legible everywhere
        // while the brand-tinted border + text retain the demo accent.
        "bg-bg/95 border border-brand-500/40 text-brand-strong dark:text-brand",
        "text-style-caption font-semibold shadow-card backdrop-blur-sm",
        "hover:bg-bg transition-colors",
        "focus:outline-none focus-visible:ring-2 focus-visible:ring-focus/45",
        "motion-safe:animate-fade-in",
      )}
    >
      <Icon name="sparkles" size="xs" strokeWidth={2} aria-hidden />
      <span>{messages.onboarding.demoBadgeText}</span>
      <span aria-hidden className="opacity-70">
        ·
      </span>
      <span>{messages.onboarding.demoBadgeExit}</span>
    </button>
  );
}
