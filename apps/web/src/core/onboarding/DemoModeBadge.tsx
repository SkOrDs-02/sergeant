/**
 * Last validated: 2026-06-24
 * Status: Active
 */
import { useState } from "react";
import { cn } from "@shared/lib/ui/cn";
import { Icon } from "@shared/components/ui/Icon";
import { messages } from "@shared/i18n/uk";
import { isDemoMode } from "./seedDemoData";

/**
 * Persistent demo-mode marker. Unlike `DemoModeBanner` (a dismissible
 * CTA card that only lives on the hub home), this badge mounts in the
 * global `AppShell`, so it stays visible on EVERY route — including the
 * module screens (Finyk / Fizruk / Nutrition / Routine) where the
 * banner never showed. That closes the awareness gap: once the visitor
 * dismisses the banner or navigates into a module, this is what keeps
 * reminding them the numbers aren't real.
 *
 * Intentionally a non-interactive status marker, not a button. The
 * "Створити свій" reset CTA lives in `DemoModeBanner` on the hub home.
 * An earlier version navigated to "/" on click, but routing via raw
 * `navigate()` from here (outside the `useHubNavigation` FSM that owns
 * `activeModule`) desynced the FSM and broke subsequent module
 * navigation. A plain label has no such failure mode and matches the
 * semantics — it reports state, it doesn't perform an action.
 */
export function DemoModeBadge() {
  // Synchronous read so the badge forks on first render. The demo flag
  // only changes via a hard reload (seed / reset both call
  // `window.location`), so a one-shot mount read is sufficient.
  const [demo] = useState<boolean>(() => isDemoMode());

  if (!demo) return null;

  return (
    <div
      role="status"
      aria-label={messages.onboarding.demoBadgeLabel}
      title={messages.onboarding.demoBadgeTitle}
      className={cn(
        "fixed top-2 left-1/2 -translate-x-1/2 z-300 safe-area-pt",
        "inline-flex items-center gap-1.5 h-8 px-3 rounded-full pointer-events-none select-none",
        "bg-brand-500/10 border border-brand-500/30 text-brand-strong dark:text-brand",
        "text-style-caption font-semibold shadow-soft backdrop-blur-sm",
        "motion-safe:animate-fade-in",
      )}
    >
      <Icon name="sparkles" size="xs" strokeWidth={2} aria-hidden />
      <span>{messages.onboarding.demoBadgeText}</span>
    </div>
  );
}
