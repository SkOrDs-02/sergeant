import { cn } from "@shared/lib/ui/cn";
import { ModulePageLoader } from "@shared/components/ui/ModulePageLoader";
import { SkipLink } from "@shared/components/ui/SkipLink";
import { SuspenseWithMinDelay } from "@shared/components/ui/SuspenseWithMinDelay";
import { KeyboardShortcutsModal } from "@shared/components/ui/KeyboardShortcutsModal";
import { lazyDefault } from "../lib/lazyImport";
import ModuleErrorBoundary from "../ModuleErrorBoundary";
import { ModuleFirstRunGoalSheet } from "../onboarding/ModuleFirstRunGoalSheet";
import { ActiveWorkoutBanner } from "./ActiveWorkoutBanner";
import { HubModals } from "./HubModals";
import { OfflineBanner } from "./OfflineBanner";
import type { HubNavigation, HubModuleId } from "../hooks/useHubNavigation";
import type { HubUIState } from "../hooks/useHubUIState";
import type { PwaAction } from "../hooks/usePwaActions";

const FinykApp = lazyDefault(() => import("../../modules/finyk/FinykApp"));
const FizrukApp = lazyDefault(() => import("../../modules/fizruk/FizrukApp"));
const NutritionApp = lazyDefault(
  () => import("../../modules/nutrition/NutritionApp"),
);
// Routine раніше імпортувалось синхронно — це зобов'язувало тягнути
// весь модуль у main chunk навіть для користувачів, що сидять у Фінікові.
// Ліниве завантаження збігається з іншими модулями (Suspense fallback
// та ModuleErrorBoundary уже огортають цей слот).
const RoutineApp = lazyDefault(
  () => import("../../modules/routine/RoutineApp"),
);

export interface ActiveModuleViewProps {
  activeModule: HubModuleId;
  goToHub: HubNavigation["goToHub"];
  goToModuleSettings: HubNavigation["goToModuleSettings"];
  openModule: HubNavigation["openModule"];
  moduleAnimClass: HubNavigation["moduleAnimClass"];
  ui: HubUIState;
  pwaAction: PwaAction | null;
  clearPwaAction: () => void;
  shortcutsOpen: boolean;
  onCloseShortcuts: () => void;
}

// «Active module» surface — renders one of FinykApp / FizrukApp /
// RoutineApp / NutritionApp behind a `<main>` (or `<div>` for Routine,
// which renders its own `<main id="routine-main">` internally) plus
// the persistent in-progress-workout shortcut, hub modals, and module
// first-run goal sheet.
export function ActiveModuleView(props: ActiveModuleViewProps) {
  const {
    activeModule,
    goToHub,
    goToModuleSettings,
    openModule,
    moduleAnimClass,
    ui,
    pwaAction,
    clearPwaAction,
    shortcutsOpen,
    onCloseShortcuts,
  } = props;

  // Skip-link target. We render `<main>` by default so every screen
  // exposes a `main` landmark for AT users. One exception: the
  // Routine module renders its own `<main id="routine-main">`
  // internally (src/modules/routine/RoutineApp.tsx) — in that case
  // we fall back to `<div>` here so the DOM never has two visible
  // `<main>` elements (HTML spec violation, confuses AT landmark
  // navigation). Either way, the SkipLink's target contract
  // (`id="main"` + focusability) is preserved.
  const Tag = activeModule === "routine" ? "div" : "main";

  return (
    <div className="h-dvh flex flex-col bg-bg text-text overflow-hidden">
      <SkipLink />
      <OfflineBanner />
      {/* Persistent "resume workout" shortcut — rendered in Finyk,
          Routine, Nutrition (but not inside Fizruk itself, where the
          in-module ActiveWorkoutPanel is already the primary surface).
          This is the "at transitions" part of the persistent-CTA
          requirement: switching modules mid-set must not bury the
          workout. */}
      {activeModule !== "fizruk" && <ActiveWorkoutBanner />}
      <SuspenseWithMinDelay
        fallback={<ModulePageLoader module={activeModule} />}
      >
        <Tag
          key={activeModule}
          id="main"
          tabIndex={-1}
          className={cn(moduleAnimClass, "h-full flex flex-col outline-none")}
        >
          <ModuleErrorBoundary onBackToHub={goToHub}>
            {activeModule === "finyk" && (
              <FinykApp
                onBackToHub={goToHub}
                onOpenSettings={() => goToModuleSettings("finyk")}
                pwaAction={pwaAction}
                onPwaActionConsumed={clearPwaAction}
              />
            )}
            {activeModule === "fizruk" && (
              <FizrukApp
                onBackToHub={goToHub}
                onOpenSettings={() => goToModuleSettings("fizruk")}
                onOpenModule={openModule}
                pwaAction={pwaAction}
                onPwaActionConsumed={clearPwaAction}
              />
            )}
            {activeModule === "routine" && (
              <RoutineApp
                onBackToHub={goToHub}
                onOpenSettings={() => goToModuleSettings("routine")}
                onOpenModule={openModule}
                pwaAction={pwaAction}
                onPwaActionConsumed={clearPwaAction}
              />
            )}
            {activeModule === "nutrition" && (
              <NutritionApp
                onBackToHub={goToHub}
                onOpenSettings={() => goToModuleSettings("nutrition")}
                pwaAction={pwaAction}
                onPwaActionConsumed={clearPwaAction}
              />
            )}
          </ModuleErrorBoundary>
        </Tag>
      </SuspenseWithMinDelay>
      <HubModals
        searchOpen={ui.searchOpen}
        onCloseSearch={ui.closeSearch}
        onOpenModule={openModule}
      />
      <KeyboardShortcutsModal open={shortcutsOpen} onClose={onCloseShortcuts} />
      <ModuleFirstRunGoalSheet moduleId={activeModule} />
    </div>
  );
}
