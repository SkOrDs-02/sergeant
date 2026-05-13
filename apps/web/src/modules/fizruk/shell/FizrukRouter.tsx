import { Suspense } from "react";
import { ModulePageLoader } from "@shared/components/ui/ModulePageLoader";
import { SectionErrorBoundary } from "@shared/components/ui/SectionErrorBoundary";
import { lazyImport } from "../../../core/lib/lazyImport";
import type { FizrukPage } from "./fizrukRoute";
import type {
  TrainingProgramDef,
  ProgramSessionDef,
} from "@sergeant/fizruk-domain/domain";
import { messages } from "@shared/i18n/uk";

interface RouterTodaySession {
  sessionKey: string;
  name: string;
}

const PAGE_ERROR_TITLES: Record<FizrukPage, string> = {
  dashboard: "Не вдалось показати головну",
  atlas: "Не вдалось показати «Атлас»",
  workouts: "Не вдалось показати «Тренування»",
  progress: "Не вдалось показати «Прогрес»",
  measurements: "Не вдалось показати «Виміри»",
  programs: "Не вдалось показати «Програми»",
  body: "Не вдалось показати «Склад тіла»",
  exercise: "Не вдалось показати вправу",
};

// Per-page lazy chunks. Previously this file eager-imported all nine
// Fizruk pages, which forced the whole module subtree (Atlas exercise
// catalogue, Body composition, full Workouts editor, Programs, …) into a
// single chunk on first navigation into Fizruk. Splitting per page lets
// each route load only the code it actually renders; the four
// `prefetchModule("fizruk")` paths in `useRoutePrefetch.ts` continue to
// warm the parent `FizrukApp` chunk, so subsequent page loads see warm
// cache for whichever page the user is most likely to hit next.
const Dashboard = lazyImport(() => import("../pages/Dashboard"), "Dashboard");
const Atlas = lazyImport(() => import("../pages/Atlas"), "Atlas");
const Exercise = lazyImport(() => import("../pages/Exercise"), "Exercise");
const Workouts = lazyImport(() => import("../pages/Workouts"), "Workouts");
const Progress = lazyImport(() => import("../pages/Progress"), "Progress");
const Measurements = lazyImport(
  () => import("../pages/Measurements"),
  "Measurements",
);
const Body = lazyImport(() => import("../pages/Body"), "Body");
const Programs = lazyImport(() => import("../pages/Programs"), "Programs");

export interface FizrukRouterProps {
  page: FizrukPage;
  exerciseId?: string;
  activeProgramId: string | null;
  activeProgram: TrainingProgramDef | null;
  activateProgram: (id: string) => void;
  deactivateProgram: () => void;
  todaySession: RouterTodaySession | null;
  /**
   * Switch the active Fizruk page. Accepts either a typed `FizrukPage`
   * (`onNavigate("workouts")`) or a `<page>/<segment>` deep-link string
   * (`onNavigate("exercise/abc-123")`) — mirrors the shape exposed by
   * `useFizrukRoute().navigate` so call-sites can hand-roll a path-based
   * deep-link without reaching into `window.location.hash`.
   */
  onNavigate: (target: FizrukPage | string) => void;
  onStartProgramWorkout: (
    session: ProgramSessionDef,
    program: TrainingProgramDef,
  ) => void;
  onOpenModule?: (moduleId: string, opts?: { hash?: string }) => void;
}

function renderPage(props: FizrukRouterProps) {
  const {
    page,
    exerciseId,
    activeProgramId,
    activeProgram,
    activateProgram,
    deactivateProgram,
    todaySession,
    onNavigate,
    onStartProgramWorkout,
    onOpenModule,
  } = props;
  switch (page) {
    case "dashboard":
      return (
        <Dashboard
          onOpenPrograms={() => onNavigate("programs")}
          activeProgram={activeProgram}
          todaySession={todaySession}
          onStartProgramWorkout={onStartProgramWorkout}
          onNavigate={onNavigate}
        />
      );
    case "atlas":
      return <Atlas />;
    case "workouts":
      return (
        <Workouts
          onOpenRoutine={
            onOpenModule
              ? () => onOpenModule("routine", { hash: "calendar" })
              : undefined
          }
          onOpenPrograms={() => onNavigate("programs")}
        />
      );
    case "progress":
      return <Progress onNavigate={onNavigate} />;
    case "measurements":
      return <Measurements />;
    case "programs":
      return (
        <Programs
          onStartWorkout={onStartProgramWorkout}
          activeProgramId={activeProgramId}
          activeProgram={activeProgram}
          activateProgram={activateProgram}
          deactivateProgram={deactivateProgram}
        />
      );
    case "body":
      return (
        <Body
          onOpenMeasurements={() => onNavigate("measurements")}
          onOpenAtlas={() => onNavigate("atlas")}
        />
      );
    case "exercise":
      return <Exercise exerciseId={exerciseId ?? ""} onNavigate={onNavigate} />;
    default:
      return null;
  }
}

/**
 * Thin page switch for Fizruk. Kept here (instead of inlining in
 * FizrukApp) so adding/removing pages touches one small file and the
 * top-level App stays focused on orchestration. Each page is a `lazy()`
 * chunk wrapped in a single `<Suspense>` boundary with the
 * fizruk-themed `ModulePageLoader` skeleton.
 */
export function FizrukRouter(props: FizrukRouterProps) {
  return (
    <Suspense fallback={<ModulePageLoader module="fizruk" />}>
      <SectionErrorBoundary
        key={props.page}
        title={
          PAGE_ERROR_TITLES[props.page] ??
          messages.errors.generic.cannotRenderPage
        }
      >
        {renderPage(props)}
      </SectionErrorBoundary>
    </Suspense>
  );
}
