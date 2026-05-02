import { Suspense } from "react";
import { ModulePageLoader } from "@shared/components/ui/ModulePageLoader";
import { lazyImport } from "../../../core/lib/lazyImport";
import type { FizrukPage } from "./fizrukRoute";

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
const PlanCalendar = lazyImport(
  () => import("../pages/PlanCalendar"),
  "PlanCalendar",
);

export interface FizrukRouterProps {
  page: FizrukPage;
  exerciseId?: string;
  activeProgramId: string | null;
  activeProgram: unknown;
  activateProgram: (id: string | null) => void;
  deactivateProgram: () => void;
  todaySession: unknown;
  onNavigate: (page: FizrukPage) => void;
  onStartProgramWorkout: (session: unknown, program: unknown) => void;
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
        />
      );
    case "plan":
      return (
        <PlanCalendar
          onOpenRoutine={
            onOpenModule
              ? () => onOpenModule("routine", { hash: "calendar" })
              : undefined
          }
        />
      );
    case "atlas":
      return <Atlas />;
    case "workouts":
      return <Workouts />;
    case "progress":
      return <Progress />;
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
      return <Body onOpenMeasurements={() => onNavigate("measurements")} />;
    case "exercise":
      return <Exercise exerciseId={exerciseId} />;
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
      {renderPage(props)}
    </Suspense>
  );
}
