/**
 * Last validated: 2026-06-05
 * Status: Active
 */
import { useEffect, useState } from "react";
import {
  ModuleShell,
  StorageErrorBanner,
  SwipePages,
} from "@shared/components/layout";
import { ModuleBottomNav } from "@shared/components/ui/ModuleBottomNav";
import { FloatingActionButton } from "@shared/components/ui/FloatingActionButton";
import { Modal } from "@shared/components/ui/Modal";
import { Button } from "@shared/components/ui/Button";
import { useActiveFizrukWorkout } from "@shared/hooks/useActiveFizrukWorkout";
import { messages } from "@shared/i18n/uk";
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
import { useFizrukQuickStatsWriter } from "./hooks/useFizrukQuickStatsWriter";
import {
  FIZRUK_NAV,
  fizrukNavActiveId,
  SWIPE_PAGE_IDS,
} from "./shell/fizrukNav";
import { FizrukHeader } from "./shell/FizrukHeader";
import { FizrukRouter } from "./shell/FizrukRouter";
import { type FizrukPage } from "./shell/fizrukRoute";
import { RestTimerProvider } from "./context/RestTimerProvider";
import { RestTimerOverlayConnected } from "./components/workouts/RestTimerOverlayConnected";

interface FizrukAppProps {
  onBackToHub?: () => void;
  onGoToHub?: () => void;
  onOpenSettings?: () => void;
  onOpenModule?: (moduleId: string, opts?: { hash?: string }) => void;
  pwaAction?: string | null;
  onPwaActionConsumed?: () => void;
}

export default function FizrukApp({
  onBackToHub,
  onGoToHub,
  onOpenSettings,
  onOpenModule,
  pwaAction,
  onPwaActionConsumed,
}: FizrukAppProps = {}) {
  const { page, segments, navigate } = useFizrukRoute("dashboard");
  const exerciseId =
    page === "exercise" && segments[0] ? segments[0] : undefined;
  const workoutId = page === "workout" && segments[0] ? segments[0] : undefined;
  // Спека `fizruk-hero-recovery-bars.md` рішення 4: `atlas/<id>` — атласна
  // зона (або зона травми) hero-рядок просить підсвітити.
  const atlasMuscleId =
    page === "atlas" && segments[0] ? segments[0] : undefined;

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
  const { workouts, createWorkout, addItem, endWorkout, deleteWorkout } =
    useWorkouts();
  const { exercises } = useExerciseCatalog();
  // Keep the Hub fizruk bento card's quick-stats snapshot in sync with real
  // workouts, not just the onboarding demo seed.
  useFizrukQuickStatsWriter(workouts);

  useFizrukWorkoutReminder({
    enabled: !!monthlyPlan.todayTemplateId,
    reminderEnabled: monthlyPlan.reminderEnabled,
    reminderHour: monthlyPlan.reminderHour,
    reminderMinute: monthlyPlan.reminderMinute,
  });

  const conflictCopy = messages.fizruk.activeWorkoutConflict;
  const [pendingProgramStart, setPendingProgramStart] = useState<
    (() => void) | null
  >(null);
  const handleStartProgramWorkout = useFizrukProgramStart({
    workouts,
    createWorkout,
    addItem,
    exercises,
    navigate,
    onConflict: (start) => setPendingProgramStart(() => start),
  });

  const resolveProgramStartConflict = (resolution: "finish" | "discard") => {
    const current = workouts.find((workout) => !workout.endedAt);
    const start = pendingProgramStart;
    if (!current || !start) return;
    if (resolution === "finish") endWorkout(current.id);
    else deleteWorkout(current.id);
    setPendingProgramStart(null);
    start();
  };

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

  // Fizruk chrome audit V-7: Атлас і Вправа used to hide the bottom nav
  // entirely, leaving those two routes as chrome dead-ends reachable only
  // via the contextual «←» back arrow (see `FizrukHeader`). They're full
  // peer screens like every other Fizruk page, not modal steps, so the
  // module nav — and with it lateral navigation to any other section —
  // now stays present everywhere. `fizrukNavActiveId` resolves which tab
  // should read as active on routes that don't own one of their own
  // (Атлас → «Моє тіло», Вправа → «Тренування», …).
  const activeWorkoutId = useActiveFizrukWorkout();
  const handleFabClick = () => {
    if (activeWorkoutId) navigate(`workout/${activeWorkoutId}`);
  };
  // FAB лише в режимі «Продовжити» (рішення власника 2026-08-08): стан
  // «Почати» дублював таб «Тренування» в нижній навігації та hero-картку
  // Дашборда, тож прибраний. Коли є активна сесія — один тап з будь-якої
  // сторінки модуля веде прямо в її лог (canonical selector, той самий,
  // що й Dashboard hero-картка). Hidden on the two pages that already
  // manage workouts themselves.
  const showFab =
    Boolean(activeWorkoutId) && page !== "workouts" && page !== "workout";

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
      case "workout":
        return "workouts";
      case "catalog":
      case "templates":
        return "workouts";
      case "measurements":
        return "progress";
      default:
        return "dashboard";
    }
  })();

  return (
    <RestTimerProvider>
      {/* Module-level rest-timer overlay — rendered above the router so it
          survives navigation between Огляд / Атлас / Тренування while a
          rest countdown is active (audit-06 F3). */}
      <RestTimerOverlayConnected />

      <ModuleShell
        module="fizruk"
        header={
          <FizrukHeader
            page={page}
            activeProgram={activeProgram}
            onBackToHub={onBackToHub}
            onGoToHub={onGoToHub}
            onContextualBack={() => navigate(contextualBackTarget)}
            onOpenSettings={onOpenSettings}
          />
        }
        banner={
          <StorageErrorBanner
            eventName={FIZRUK_WORKOUTS_STORAGE_ERROR}
            formatMessage={(reason) =>
              `Не вдалося зберегти тренування (${reason}). Можливо, браузер переповнив сховище, експортуй бекап або звільни місце.`
            }
          />
        }
        nav={
          <ModuleBottomNav
            items={FIZRUK_NAV}
            activeId={fizrukNavActiveId(page)}
            onChange={(id) => navigate(id)}
            module="fizruk"
            ariaLabel={messages.nav.fizrukSections}
          />
        }
      >
        {/* Свайп між чотирма вкладками нижньої навігації. `activeId={page}`
            навмисно передає сиру сторінку, а не `fizrukNavActiveId(page)`:
            на детальних екранах («Вправа», «Тренування», «Атлас», «Заміри»)
            її нема в `SWIPE_PAGE_IDS`, і `SwipePages` вимикає жест сам —
            свайпати «наступну вкладку» з відкритої вправи безглуздо. */}
        <SwipePages
          ids={SWIPE_PAGE_IDS}
          activeId={page}
          onChange={(next) => navigate(next)}
        >
          <FizrukRouter
            page={page}
            exerciseId={exerciseId}
            workoutId={workoutId}
            atlasMuscleId={atlasMuscleId}
            activeProgramId={activeProgramId}
            activeProgram={activeProgram}
            activateProgram={activateProgram}
            deactivateProgram={deactivateProgram}
            todaySession={todaySession}
            onNavigate={(target) => navigate(target)}
            onStartProgramWorkout={(session) =>
              handleStartProgramWorkout(session)
            }
            onOpenModule={onOpenModule}
          />
        </SwipePages>
        <Modal
          open={pendingProgramStart !== null}
          onClose={() => setPendingProgramStart(null)}
          title={conflictCopy.title}
          description={conflictCopy.description}
          size="sm"
          footer={
            <div className="flex flex-col gap-2">
              <Button
                module="fizruk"
                className="w-full h-12"
                onClick={() => resolveProgramStartConflict("finish")}
              >
                {conflictCopy.finish}
              </Button>
              <Button
                variant="destructive"
                className="w-full h-12"
                onClick={() => resolveProgramStartConflict("discard")}
              >
                {conflictCopy.discard}
              </Button>
              <Button
                variant="secondary"
                className="w-full h-12"
                onClick={() => setPendingProgramStart(null)}
              >
                {messages.actions.cancel}
              </Button>
            </div>
          }
        />
        {showFab && (
          <FloatingActionButton
            variant="v2-fizruk"
            icon="play"
            onClick={handleFabClick}
            aria-label={messages.fizruk.resumeWorkoutFab}
          />
        )}
      </ModuleShell>
    </RestTimerProvider>
  );
}
