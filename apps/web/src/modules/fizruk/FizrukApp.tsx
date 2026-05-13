import { useEffect } from "react";
import { ModuleShell, StorageErrorBanner } from "@shared/components/layout";
import { ModuleBottomNav } from "@shared/components/ui/ModuleBottomNav";
import { useModuleFirstRun } from "../../core/onboarding/useModuleFirstRun";
import { useFizrukRoute } from "./hooks/useFizrukRoute";
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
import { type FizrukPage } from "./shell/fizrukRoute";

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
  const { page, segments, navigate } = useFizrukRoute("dashboard");
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

  // First-run flag bookkeeping. Fizruk's Dashboard already surfaces an
  // empty-state hero with «Програми» / «Створити шаблон» CTAs and a
  // KpiRow that promotes «Запланувати тренування» when the user has no
  // workouts yet — there is no separate weekly-target field that we
  // could route to. So the per-module first-run treatment here is to
  // simply mark the flag seen on first mount, retiring the old
  // `<ModuleFirstRunGoalSheet />` prompt without replacing it. See
  // `core/onboarding/useModuleFirstRun.ts` for the broader rework.
  const fizrukFirstRun = useModuleFirstRun("fizruk");
  useEffect(() => {
    if (fizrukFirstRun.firstRun) fizrukFirstRun.markSeen();
  }, [fizrukFirstRun]);

  const showBottomNav = page !== "atlas" && page !== "exercise";

  // Contextual back-button targets for the three sub-pages that show
  // a `← <label>` arrow instead of the module's "back to hub" arrow.
  // The header's `backLabelFor()` mirrors these destinations so what
  // the label promises matches where the user actually lands. Until
  // round-12 the header always navigated to "dashboard" no matter
  // what label it advertised — that's the disconnect the user
  // flagged on the Measurements screen ("← Прогрес і заміри" but
  // landing on Огляд).
  const contextualBackTarget: FizrukPage = (() => {
    switch (page) {
      case "atlas":
        return "body";
      case "exercise":
        return "workouts";
      case "measurements":
        return "body";
      default:
        return "dashboard";
    }
  })();

  return (
    <ModuleShell
      module="fizruk"
      header={
        <FizrukHeader
          page={page}
          activeProgram={activeProgram}
          onBackToHub={onBackToHub}
          onContextualBack={() => navigate(contextualBackTarget)}
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
