/**
 * Sergeant Design System — `MeshBackground`
 *
 * @lifecycle experimental (introduced 2026-05 у PR-5; promote to active after PR-8)
 * @see docs/design/redesign-v2/governance.md § Mesh background
 *
 * Base layout layer that renders the page «стіл»: a solid
 * `--module-desk-rgb` (theme.css), the page background shifted into the
 * host module's hue; the hub gets the neutral default. Радіальних свічень
 * («mesh») більше нема — рішення власника 2026-09-03; ім'я компонента і
 * клас `.bg-mesh` лишились, щоб не чіпати кожен shell і тест.
 *
 * Module-accent containment (Hard Rule #12): цей компонент НЕ публікує
 * `--module-accent-rgb`. У module shells монтується ВСЕРЕДИНІ
 * `<ModuleAccentProvider>` — саме його `data-module-accent` обирає стіл
 * і зону модуля в theme.css.
 *
 * HC theme override: `html.hc` зводить стіл і зону до `--c-bg-base`.
 * AAA contrast зберігається.
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
  /** Stable selector for interaction tests on shell-owned scroll containers. */
  "data-testid"?: string;
  /** Inline style — used by ModuleShell to expose `--bottom-nav-height`
   *  CSS var to descendants so sheets can lift themselves above the nav.
   *  PR-6 added this; HubHomeView consumer leaves it undefined. */
  style?: CSSProperties;
}

export function MeshBackground({
  children,
  className,
  style,
  "data-testid": testId,
}: MeshBackgroundProps) {
  return (
    <div
      style={style}
      data-testid={testId}
      className={cn(
        // Full-viewport shell — same flex pattern as the legacy
        // `<div className="h-dvh bg-bg flex flex-col">` wrappers this
        // replaces; `h-app-dvh` (not `h-dvh`) so the shell tracks the
        // real visible height on iOS (see utilities.css).
        // Осі окремо, не шорткат `overflow-hidden`: `cn`/tailwind-merge
        // зводить конфлікти ПО ГРУПАХ, і шорткат із групи `overflow` не
        // витісняється переданим `overflow-y-auto` (група `overflow-y`) —
        // обидва класи виживають, і хто переможе, вирішує порядок правил у
        // згенерованому CSS, а не намір викликача. З осями пере-визначення
        // з `className` детерміноване (auth-екрани саме так вмикають скрол).
        "h-app-dvh flex flex-col overflow-x-hidden overflow-y-hidden",
        // `.bg-mesh` utility class — defined in
        // `apps/web/src/styles/theme.css` § СТІЛ І ЗОНА. Paints the solid
        // module desk; `html.hc` degrades it to `rgb(var(--c-bg-base))`.
        "bg-mesh",
        className,
      )}
    >
      {children}
    </div>
  );
}
