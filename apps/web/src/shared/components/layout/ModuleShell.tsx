import type { CSSProperties, ReactNode } from "react";
import type { ModuleAccent } from "@sergeant/design-tokens";
import { cn } from "@shared/lib/cn";
import { ModuleAccentProvider } from "./ModuleAccentProvider";

/**
 * Module shell skeleton used by Фінік / Фізрук / Рутина / Харчування.
 *
 * Owns the full-viewport flex column, background tokens, and overflow
 * discipline so every module entrypoint renders identically. Slots keep
 * module-specific bits (header, banner, bottom nav, overlays) composable
 * without forcing each module to re-declare the layout.
 *
 * Pass `module` to publish the module's accent color on
 * `--module-accent-rgb` and the `useModuleAccent()` context. Child
 * components can then opt in to module-tinted backgrounds, borders,
 * and CTAs via Tailwind arbitrary values:
 *
 *     className="bg-[rgb(var(--module-accent-rgb)/0.08)]"
 *
 *     <ModuleShell
 *       module="fizruk"
 *       header={<ModuleHeader … />}
 *       banner={<StorageErrorBanner eventName={…} />}
 *       nav={<ModuleBottomNav … />}
 *       overlays={<ModuleSettingsDrawer open={…} … />}
 *     >
 *       {page === "dashboard" && <Dashboard />}
 *       …
 *     </ModuleShell>
 */

export interface ModuleShellProps {
  /** Module accent — exposes `--module-accent-rgb` and the
   *  `useModuleAccent()` context for descendants. */
  module?: ModuleAccent;
  header?: ReactNode;
  banner?: ReactNode;
  nav?: ReactNode;
  /** Rendered outside the main flex column — drawers, modal overlays, etc. */
  overlays?: ReactNode;
  children: ReactNode;
  className?: string;
  mainClassName?: string;
}

export function ModuleShell({
  module,
  header,
  banner,
  nav,
  overlays,
  children,
  className,
  mainClassName,
}: ModuleShellProps) {
  // Expose the bottom-nav height as a CSS variable so descendants
  // (e.g. bottom sheets rendered inside this shell) can lift themselves
  // above it without having to know whether the current page renders a
  // nav. Defaults to 0px when no nav is slotted.
  const shellStyle: CSSProperties = {
    "--bottom-nav-height": nav ? "60px" : "0px",
  } as CSSProperties;

  const inner = (
    <div
      style={shellStyle}
      className={cn(
        "h-dvh flex flex-col bg-bg text-text overflow-hidden",
        className,
      )}
    >
      {header}
      {overlays}
      {banner}
      <div
        className={cn("flex-1 overflow-hidden flex flex-col", mainClassName)}
      >
        {children}
      </div>
      {nav}
    </div>
  );

  if (module) {
    // The provider only needs to publish the CSS var + context — the
    // shell itself already owns the viewport sizing, so we render a
    // pass-through wrapper rather than asking the provider to also
    // size the box.
    return (
      <ModuleAccentProvider module={module} className="contents">
        {inner}
      </ModuleAccentProvider>
    );
  }

  return inner;
}
