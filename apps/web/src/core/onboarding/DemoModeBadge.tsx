/**
 * Last validated: 2026-06-24
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
        // Mobile: drop below the header band — full-width headers (module
        // title, settings search) leave no free top-center slot, so a
        // top-pinned pill obscured them. Desktop headers are narrow → keep
        // the original top-center placement from `sm:` up.
        "fixed top-16 left-1/2 -translate-x-1/2 z-300 select-none",
        "sm:top-2 sm:safe-area-pt",
        "inline-flex items-center gap-1.5 h-8 pl-3 pr-2.5 rounded-full",
        "bg-brand-500/10 border border-brand-500/30 text-brand-strong dark:text-brand",
        "text-style-caption font-semibold shadow-soft backdrop-blur-sm",
        "hover:bg-brand-500/20 transition-colors",
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
