import { ModuleShell, StorageErrorBanner } from "@shared/components/layout";
import { ModuleBottomNav } from "@shared/components/ui/ModuleBottomNav";
// eslint-disable-next-line sergeant-design/no-hash-router-in-modules -- pre-existing hash-router callsite; migration tracked in initiative 0006.
import { useHashRoute } from "@shared/hooks/useHashRoute";
import { usePwaAction } from "@shared/hooks/usePwaAction";
import { useExerciseCatalog } from "./hooks/useExerciseCatalog";
import { useFizrukProgramStart } from "./hooks/useFizrukProgramStart";
import { useFizrukDualWriteBoot } from "./hooks/useFizrukDualWriteBoot";
import { useFizrukSqliteReadBoot } from "./hooks/useFizrukSqliteReadBoot";
import { useFizrukWorkoutReminder } from "./hooks/useFizrukWorkoutReminder";
import { useMonthlyPlan } from "./hooks/useMonthlyPlan";
import { useTrainingProgram } from "./hooks/useTrainingProgram";
import {
  FIZRUK_WORKOUTS_STORAGE_ERROR,
  useWorkouts,
} from "./hooks/useWorkouts";
import { FIZRUK_NAV } from "./shell/fizrukNav";
import { FizrukHeader } from "./shell/FizrukHeader";
import { FizrukRouter } from "./shell/FizrukRouter";
import { FIZRUK_PAGES, type FizrukPage } from "./shell/fizrukRoute";

interface FizrukAppProps {
  onBackToHub?: () => void;
  onOpenSettings?: () => void;
  onOpenModule?: (moduleId: string, opts?: { hash?: string }) => void;
  pwaAction?: string | null;
  onPwaActionConsumed?: () => void;
}

export default function FizrukApp({
  onBackToHub,
  onOpenSettings,
  onOpenModule,
  pwaAction,
  onPwaActionConsumed,
}: FizrukAppProps = {}) {
  // eslint-disable-next-line sergeant-design/no-hash-router-in-modules -- pre-existing hash-router callsite; migration tracked in initiative 0006.
  const { page, segments, navigate } = useHashRoute<FizrukPage>({
    defaultPage: "dashboard",
    validPages: FIZRUK_PAGES,
  });
  const exerciseId =
    page === "exercise" && segments[0] ? segments[0] : undefined;

  // Stage 4 PR #028 follow-up: install the dual-write context once the
  // user is known and the flag is on. Without this the `triggerFizrukDualWrite`
  // calls in the hooks below would early-out at the
  // `isFizrukDualWriteRegistered()` check, leaving SQLite empty.
  useFizrukDualWriteBoot();
  // Stage 4 PR #029: boot the SQLite read path. When
  // `feature.fizruk.sqlite_v2.read_sqlite` is on, hooks below overlay
  // their state from the local fizruk_* tables instead of LS.
  useFizrukSqliteReadBoot();

  const monthlyPlan = useMonthlyPlan();
  const {
    activeProgramId,
    activeProgram,
    todaySession,
    activateProgram,
    deactivateProgram,
  } = useTrainingProgram();
  const { workouts, createWorkout, addItem } = useWorkouts();
  const { exercises } = useExerciseCatalog();

  useFizrukWorkoutReminder({
    enabled: !!monthlyPlan.todayTemplateId,
    reminderEnabled: monthlyPlan.reminderEnabled,
    reminderHour: monthlyPlan.reminderHour,
    reminderMinute: monthlyPlan.reminderMinute,
    days: monthlyPlan.days,
  });

  const handleStartProgramWorkout = useFizrukProgramStart({
    workouts,
    createWorkout,
    addItem,
    exercises,
    navigate,
  });

  usePwaAction(pwaAction, onPwaActionConsumed, {
    start_workout: () => navigate("workouts"),
  });

  const showBottomNav = page !== "atlas" && page !== "exercise";

  return (
    <ModuleShell
      module="fizruk"
      header={
        <FizrukHeader
          page={page}
          activeProgram={activeProgram}
          onBackToHub={onBackToHub}
          onBackToDashboard={() => navigate("dashboard")}
          onOpenSettings={onOpenSettings}
        />
      }
      banner={
        <StorageErrorBanner
          eventName={FIZRUK_WORKOUTS_STORAGE_ERROR}
          formatMessage={(reason) =>
            `Не вдалося зберегти тренування (${reason}). Можливо, браузер переповнив сховище — експортуй бекап або звільни місце.`
          }
        />
      }
      nav={
        showBottomNav ? (
          <ModuleBottomNav
            items={FIZRUK_NAV}
            activeId={page}
            onChange={(id) => navigate(id)}
            module="fizruk"
          />
        ) : null
      }
    >
      <FizrukRouter
        page={page}
        exerciseId={exerciseId}
        activeProgramId={activeProgramId}
        activeProgram={activeProgram}
        activateProgram={activateProgram}
        deactivateProgram={deactivateProgram}
        todaySession={todaySession}
        onNavigate={(target) => navigate(target)}
        onStartProgramWorkout={(session) => handleStartProgramWorkout(session)}
        onOpenModule={onOpenModule}
      />
    </ModuleShell>
  );
}
