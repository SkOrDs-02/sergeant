import {
  createContext,
  useContext,
  useMemo,
  type CSSProperties,
  type ReactNode,
} from "react";
import type { ModuleAccent } from "@sergeant/design-tokens";
import { moduleAccentRgb } from "@sergeant/design-tokens/tokens";
import { cn } from "@shared/lib/cn";

/**
 * Sergeant Design System — Module accent provider.
 *
 * Carries the active module's brand color through the React tree so deep
 * components (CTAs, FABs, page hero gradients, status pills) can stay in
 * sync with the host module's palette without each component re-deriving
 * the accent from props.
 *
 * Two ways to consume:
 *
 * 1. **CSS variables** — two are written on the wrapper `<div>`:
 *      • `--module-accent-rgb` — the saturated `-500` shade.
 *      • `--module-accent-strong-rgb` — the WCAG-AA `-strong` companion
 *        for use behind `text-white` (CTAs, Badges, Tabs).
 *
 *    Use them in Tailwind arbitrary values:
 *
 *        className="bg-[rgb(var(--module-accent-rgb))]"
 *        className="border-[rgb(var(--module-accent-rgb)/0.4)]"
 *        className="bg-[rgb(var(--module-accent-strong-rgb))] text-white"
 *
 *    Both work everywhere inside the provider, including portaled
 *    overlays that re-mount inside the same DOM subtree.
 *
 * 2. **React hook** — `useModuleAccent()` returns the active accent
 *    (`"finyk" | "fizruk" | "routine" | "nutrition" | null`). Useful
 *    when a child needs to switch on the module token (e.g. picking a
 *    Tailwind utility class like `text-finyk` vs `text-fizruk`).
 *
 * The accent is intentionally `null` outside of a provider. Hub-level
 * chrome (header, dashboard, hub-chat) is module-agnostic and should
 * keep using `bg-brand-*` tokens directly.
 *
 * The RGB triplets are sourced from `@sergeant/design-tokens/tokens`
 * (`moduleAccentRgb`) — the single source of truth shared with Tailwind
 * `bg-{module}` / `bg-{module}-strong` utilities. Never hardcode RGB
 * values here; extend `moduleAccentRgb` instead.
 */

const ModuleAccentContext = createContext<ModuleAccent | null>(null);

export interface ModuleAccentProviderProps {
  module: ModuleAccent;
  children: ReactNode;
  /** When true, render as a flex column container that fills the viewport.
   *  Convenience for module roots that don't already use ModuleShell. */
  asShellRoot?: boolean;
  className?: string;
}

export function ModuleAccentProvider({
  module,
  children,
  asShellRoot = false,
  className,
}: ModuleAccentProviderProps) {
  const style = useMemo<CSSProperties>(() => {
    const rgb = moduleAccentRgb[module];
    return {
      "--module-accent-rgb": rgb.default,
      "--module-accent-strong-rgb": rgb.strong,
    } as CSSProperties;
  }, [module]);

  return (
    <ModuleAccentContext.Provider value={module}>
      <div
        data-module-accent={module}
        style={style}
        className={cn(
          asShellRoot && "h-dvh flex flex-col bg-bg text-text overflow-hidden",
          className,
        )}
      >
        {children}
      </div>
    </ModuleAccentContext.Provider>
  );
}

/**
 * Read the currently-active module accent. Returns `null` outside of a
 * `ModuleAccentProvider` (or `ModuleShell` with a `module` prop).
 */
export function useModuleAccent(): ModuleAccent | null {
  return useContext(ModuleAccentContext);
}

/**
 * Internal re-export so ModuleShell can wire up the same context without
 * a circular import.
 */
export { ModuleAccentContext };
