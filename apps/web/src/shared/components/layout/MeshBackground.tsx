/**
 * Sergeant Design System — `MeshBackground`
 *
 * @lifecycle experimental (introduced 2026-05 у PR-5; promote to active after PR-8)
 * @see docs/design/redesign-v2/governance.md § Mesh background
 *
 * Base layout layer that renders the mesh-gradient surface. «Чорнило»
 * composites THREE radial glows (`--bg-mesh-1..3` defined in
 * `apps/web/src/styles/theme.css`) over `--c-bg-base` — emerald top-right,
 * cyan left, coral bottom (spec § 1), down from the legacy 4-corner mesh.
 * Background uses `background-attachment: fixed` для infinite-scroll-feel
 * (iOS Capacitor WebView has a known regression — fall back is
 * disabled-mesh on `prefers-reduced-motion: reduce`).
 *
 * Module-accent containment (Hard Rule #12): цей компонент НЕ публікує
 * `--module-accent-rgb`. У module shells монтується ВСЕРЕДИНІ
 * `<ModuleAccentProvider>` так, що accent ставиться першим, mesh — поверх.
 *
 * HC theme override (handoff не покривав, додано в PR-1): `html.hc`
 * виставляє всі `--bg-mesh-{1..3}` у `rgba(0,0,0,0)` → mesh stripped,
 * background → solid `--c-bg-base`. AAA contrast зберігається.
 *
 * Usage:
 * ```tsx
 * // Hub-level (PR-5)
 * <MeshBackground>
 *   <HubHeader />
 *   <HubMainContent />
 *   <HubBottomNav />
 * </MeshBackground>
 *
 * // Module shells (PR-6)
 * <ModuleAccentProvider module="finyk" asShellRoot>
 *   <MeshBackground>
 *     <ModuleHeader />
 *     <ModuleSwitcher />
 *     <main>{children}</main>
 *     <ModuleBottomNav />
 *   </MeshBackground>
 * </ModuleAccentProvider>
 * ```
 */

import { type CSSProperties, type ReactNode } from "react";
import { cn } from "@shared/lib/ui/cn";

export interface MeshBackgroundProps {
  children: ReactNode;
  className?: string;
  /** Inline style — used by ModuleShell to expose `--bottom-nav-height`
   *  CSS var to descendants so sheets can lift themselves above the nav.
   *  PR-6 added this; HubHomeView consumer leaves it undefined. */
  style?: CSSProperties;
}

export function MeshBackground({
  children,
  className,
  style,
}: MeshBackgroundProps) {
  return (
    <div
      style={style}
      className={cn(
        // Full-viewport shell — same flex pattern as the legacy
        // `<div className="h-dvh bg-bg flex flex-col">` wrappers this
        // replaces; `h-app-dvh` (not `h-dvh`) so the shell tracks the
        // real visible height on iOS (see utilities.css).
        "h-app-dvh flex flex-col overflow-hidden",
        // `.bg-mesh` utility class — defined in
        // `apps/web/src/styles/theme.css` § MESH BACKGROUND UTILITY.
        // Composites the three ink glows + sets background-attachment:
        // fixed. Auto-degrades to solid `rgb(var(--c-bg-base))` on
        // `html.hc` and `prefers-reduced-motion: reduce`.
        "bg-mesh",
        className,
      )}
    >
      {children}
    </div>
  );
}
