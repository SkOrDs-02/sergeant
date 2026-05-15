/**
 * Sergeant Design System — `MeshBackground`
 *
 * @lifecycle experimental (introduced 2026-05 у PR-5; promote to active after PR-8)
 * @see docs/design/redesign-v2.md § Mesh background
 *
 * Base layout layer that renders the v2 mesh-gradient surface. Composites
 * four corner radial gradients (`--bg-mesh-1..4` defined in
 * `apps/web/src/styles/theme.css`) over `--c-bg-base`. Background
 * uses `background-attachment: fixed` для infinite-scroll-feel
 * (iOS Capacitor WebView has a known regression — fall back is
 * disabled-mesh on `prefers-reduced-motion: reduce`).
 *
 * Module-accent containment (Hard Rule #12): цей компонент НЕ публікує
 * `--module-accent-rgb`. У module shells монтується ВСЕРЕДИНІ
 * `<ModuleAccentProvider>` так, що accent ставиться першим, mesh — поверх.
 *
 * HC theme override (handoff не покривав, додано в PR-1): `html.hc`
 * виставляє всі `--bg-mesh-{1..4}` у `rgba(0,0,0,0)` → mesh stripped,
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

import { type ReactNode } from "react";
import { cn } from "@shared/lib/ui/cn";

export interface MeshBackgroundProps {
  children: ReactNode;
  className?: string;
}

export function MeshBackground({ children, className }: MeshBackgroundProps) {
  return (
    <div
      className={cn(
        // Full-viewport shell — same h-dvh flex pattern as the legacy
        // `<div className="h-dvh bg-bg flex flex-col">` wrappers that
        // this replaces.
        "h-dvh flex flex-col overflow-hidden",
        // `.bg-mesh` utility class — defined in
        // `apps/web/src/styles/theme.css` § MESH BACKGROUND UTILITY.
        // Composites the four corner radials + sets background-attachment:
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
