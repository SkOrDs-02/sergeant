import { Suspense, type ReactNode } from "react";
import { cn } from "@shared/lib/ui/cn";
import { SkipLink } from "@shared/components/ui/SkipLink";
import { lazyImport } from "../../core/lib/lazyImport";
import { ActiveWorkoutBanner } from "../../core/app/ActiveWorkoutBanner";
import { HubModals } from "../../core/app/HubModals";
import { OfflineBanner } from "../../core/app/OfflineBanner";
import ModuleErrorBoundary from "../../core/ModuleErrorBoundary";
import { useModuleRouteLoader } from "../../core/lib/useModuleRouteLoader";
import { useHubShell } from "../../core/app/HubShellContext";
import type { HubModuleId } from "../../core/hooks/useHubNavigation";

// Lazy shortcuts modal — same rationale as ActiveModuleView (initiative 0017).
const KeyboardShortcutsModalLazy = lazyImport(
  () => import("@shared/components/ui/KeyboardShortcutsModalUI"),
  "KeyboardShortcutsModal",
);

/**
 * Shared module UI shell — rendered by per-module route entries.
 *
 * Initiative 0006 Phase 5: each module is now a separate router child
 * with its own component, fixing the React Router 7 location-context
 * bug. The shared UI (skip-link, offline banner, workout CTA, modals)
 * lives here so it's not duplicated across module route files.
 *
 * Replaces the per-module rendering path in `ActiveModuleView`.
 */
export function ModuleShell({
  moduleId,
  children,
}: {
  moduleId: HubModuleId;
  children: ReactNode;
}) {
  const {
    goToHub,
    openModule,
    moduleAnimClass,
    ui,
    shortcutsOpen,
    onCloseShortcuts,
  } = useHubShell();

  // Route-loader: warm the React Query cache for this module before
  // the lazy chunk finishes loading (initiative 0006 Phase 5).
  useModuleRouteLoader(moduleId);

  // Routine renders its own `<main id="routine-main">` internally,
  // so we use `<div>` here to avoid a double-`<main>` violation.
  const Tag = moduleId === "routine" ? "div" : "main";

  return (
    <div className="h-dvh flex flex-col bg-bg text-text overflow-hidden">
      <SkipLink />
      <OfflineBanner />
      {moduleId !== "fizruk" && <ActiveWorkoutBanner />}
      <Tag
        id="main"
        tabIndex={-1}
        className={cn(moduleAnimClass, "h-full flex flex-col outline-none")}
      >
        <ModuleErrorBoundary onBackToHub={goToHub}>
          {children}
        </ModuleErrorBoundary>
      </Tag>
      <HubModals
        searchOpen={ui.searchOpen}
        onCloseSearch={ui.closeSearch}
        onOpenModule={openModule}
      />
      {shortcutsOpen && (
        <Suspense fallback={null}>
          <KeyboardShortcutsModalLazy
            open={shortcutsOpen}
            onClose={onCloseShortcuts}
          />
        </Suspense>
      )}
    </div>
  );
}
