/**
 * Last validated: 2026-06-05
 * Status: Active
 */
import { PullToRefresh } from "@shared/components/ui/PullToRefresh";
import { Skeleton } from "@shared/components/ui/Skeleton";
import { Button } from "@shared/components/ui/Button";
import { DataState } from "@shared/components/ui/DataState";
import { WorkoutTemplatesSection } from "../components/WorkoutTemplatesSection";
import { WorkoutFinishSheets } from "../components/workouts/WorkoutFinishSheets";
import { AddExerciseSheet } from "../components/workouts/AddExerciseSheet";
import { ExerciseDetailSheet } from "../components/workouts/ExerciseDetailSheet";
import { WorkoutJournalSection } from "../components/workouts/WorkoutJournalSection";
import { WorkoutCatalogSection } from "../components/workouts/WorkoutCatalogSection";
import { WorkoutsHome } from "../components/workouts/WorkoutsHome";
import { LogPastWorkoutSheet } from "../components/workouts/LogPastWorkoutSheet";
import { WorkoutsHeader } from "../components/workouts/WorkoutsHeader";
import { WorkoutsConfirmDialogs } from "../components/workouts/WorkoutsConfirmDialogs";
import { useWorkoutsOrchestrator } from "../hooks/useWorkoutsOrchestrator";
import { useTrainingProgram } from "../hooks/useTrainingProgram";
import { useDailyLog } from "../hooks/useDailyLog";
import { useCustomActivities } from "../hooks/useCustomActivities";
import { useLatestBodyWeightKg } from "../../../core/profile/useLatestBodyWeight";
import { useCloudPullPending } from "@shared/hooks/useCloudPullPending";
import { messages } from "@shared/i18n/uk";
import {
  markComposeSaved,
  useComposeTelemetry,
} from "../../../core/observability/composeTelemetry";

/** Стабільний ключ виміру тертя — той самий на всіх відкриттях форми. */
const FIZRUK_PAST_WORKOUT_COMPOSE_KEY = "fizruk:log-past-workout";

interface WorkoutsProps {
  workoutId?: string | undefined;
  activeOnly?: boolean;
  /**
   * Розділ із власним маршрутом (`/fizruk/catalog`, `/fizruk/templates`).
   * Сторінка та сама, але вона відкривається одразу в цьому вигляді, а
   * «назад» веде на хаб «Тренування», а не перемикає локальний `view`.
   */
  section?: "catalog" | "templates" | undefined;
  onNavigate?: ((target: string) => void) | undefined;
  /**
   * Deep-link to the Routine module's calendar tab. Wired by
   * `FizrukRouter.tsx` from the optional `onOpenModule` prop on the
   * Fizruk shell. When present, the workouts home shows a third
   * action — «Запланувати тренування» — next to the «Почати» /
   * «Внести проведене» CTAs. This used to live on a separate «План»
   * tab that the user asked us to dissolve.
   */
  onOpenRoutine?: (() => void) | undefined;
}

export function Workouts({
  workoutId,
  activeOnly = false,
  section,
  onNavigate,
  onOpenRoutine,
}: WorkoutsProps = {}) {
  const o = useWorkoutsOrchestrator({
    requestedWorkoutId: workoutId,
    initialView: activeOnly ? "log" : (section ?? "home"),
    onWorkoutStarted: onNavigate
      ? (id) => onNavigate(`workout/${id}`)
      : undefined,
  });
  const cloudPullPending = useCloudPullPending();
  // Тертя запису проведеного заняття (`entry_compose_finished`, §6
  // контракту). `open` враховує ще й вкладку: шит рендериться лише на
  // `view === "home"`, тож перехід на іншу вкладку з відкритою формою — це
  // теж кинута композиція, і без цієї кон'юнкції вона зникла б зі
  // знаменника мовчки.
  useComposeTelemetry({
    key: FIZRUK_PAST_WORKOUT_COMPOSE_KEY,
    open: o.view === "home" && o.logPastOpen,
    module: "fizruk",
    entryKind: "past_workout",
    surface: "workouts_home",
  });
  // Вага потрібна формі «Записати заняття»: без неї витрати рахувати нічим,
  // і саме тоді форма просить її одним полем.
  const bodyWeightKg = useLatestBodyWeightKg();
  const { addEntry: addDailyLogEntry } = useDailyLog();
  const { activities, addActivity } = useCustomActivities();
  // 04-A — permanent "Програми" row in the home "Довідники" block reads
  // the active program name directly (cheap: `BUILTIN_PROGRAMS.find` over
  // a static in-memory list + one localStorage read on mount, no network).
  // A second `useTrainingProgram()` instance alongside `FizrukApp.tsx`'s
  // is intentional here — this call only *reads* `activeProgram`, never
  // `activateProgram`/`deactivateProgram`, so there is nothing to keep in
  // sync beyond what a fresh mount already re-reads from `localStorage`.
  const { activeProgram } = useTrainingProgram();

  const workoutsLoadingSkeleton = (
    <div
      className="space-y-3"
      role="status"
      aria-live="polite"
      aria-label={messages.loadingActions.loadingWorkouts}
    >
      <Skeleton className="h-28 w-full" />
      <Skeleton className="h-20 w-full" />
      <Skeleton className="h-20 w-full" />
    </div>
  );

  return (
    <PullToRefresh
      onRefresh={o.handlePullRefresh}
      variant="fizruk"
      enabled={!cloudPullPending}
    >
      <div className="max-w-4xl mx-auto px-4 pt-4 page-tabbar-pad">
        <WorkoutsHeader
          view={o.view}
          activeWorkout={o.activeWorkout}
          finishedCount={o.finishedCount}
          onBack={() =>
            activeOnly || section ? onNavigate?.("workouts") : o.setView("home")
          }
          onAddCatalog={() => o.setAddOpen(true)}
        />

        {o.view === "home" ? (
          <WorkoutsHome
            activeWorkout={o.activeWorkout}
            activeDuration={o.activeDuration}
            recentWorkouts={o.recentWorkouts}
            activeProgramName={activeProgram?.name ?? null}
            onOpenSession={() => {
              if (o.activeWorkout?.id && onNavigate) {
                onNavigate(`workout/${o.activeWorkout.id}`);
              } else {
                o.setView("log");
              }
            }}
            // Каталог і шаблони мають власні адреси (`FIZRUK_PAGES`), тож
            // це навігація, а не перемикання локального `view`.
            onOpenCatalog={() => onNavigate?.("catalog")}
            onOpenTemplates={() => onNavigate?.("templates")}
            // 03-A — "Всі →" now owns its own URL (`/fizruk/history`)
            // instead of flipping `view` to "log" on the same
            // `/fizruk/workouts` path (the dual start-path bug).
            onOpenJournal={() => onNavigate?.("history")}
            onOpenPrograms={() => onNavigate?.("programs")}
            onRequestStart={o.handleQuickStart}
            onLogPast={() => o.setLogPastOpen(true)}
            onOpenSchedule={onOpenRoutine}
          />
        ) : null}

        {o.view === "home" ? (
          <LogPastWorkoutSheet
            open={o.logPastOpen}
            onClose={() => o.setLogPastOpen(false)}
            onSubmit={(payload) => {
              // Позначка ДО консюмерського шляху: подію емітить закриття
              // форми, і воно прилітає вже після цього виклику.
              markComposeSaved(FIZRUK_PAST_WORKOUT_COMPOSE_KEY);
              o.submitPastWorkout(payload);
            }}
            weightKg={bodyWeightKg}
            // Той самий писач, що й у решті зважувань: `addEntry` сам
            // funnel-ить у `recordBodyWeight`, тож профільний знімок для
            // КБЖВ оновлюється разом із fizruk-журналом (ADR-0080).
            onRecordWeight={(weightKg) => addDailyLogEntry({ weightKg })}
            activities={activities}
            onCreateActivity={addActivity}
          />
        ) : null}

        {o.view === "log" && (
          // §4.4 audit fix — on desktop the outer `max-w-4xl` (896px) let
          // this panel stretch to ~1030px: set-input fields ballooned to
          // ~230px and "+ Підхід" to ~800px, even though a set row is a
          // short vertical stack of numeric fields, not something that
          // benefits from extra width. The exercise catalog right below
          // (`WorkoutCatalogSection`, outside this wrapper) intentionally
          // stays at the outer `max-w-4xl` — it is a browsable list, not a
          // form. Minimal fix per audit §4.4: narrow just this panel, no
          // two-column layout.
          <div className="max-w-xl mx-auto">
            <DataState
              query={o.journalQuery}
              skeleton={workoutsLoadingSkeleton}
              errorAction={
                // R2-UX-18 · If a retry of the journal query keeps failing
                // (e.g. corrupted local cache after a bad sync), a full
                // reload is the reliable second path out.
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => window.location.reload()}
                >
                  {messages.actions.reload}
                </Button>
              }
            >
              {() => (
                <WorkoutJournalSection
                  activeWorkout={o.activeWorkout}
                  activeDuration={o.activeDuration}
                  pendingRetroEnd={o.pendingRetroEnd}
                  onPendingRetroEndChange={o.updatePendingRetroEnd}
                  musclesUk={o.musclesUk}
                  recBy={o.rec.by}
                  lastByExerciseId={o.lastByExerciseId}
                  setRestTimer={o.setRestTimer}
                  updateWorkout={o.updateWorkout}
                  updateItem={o.updateItem}
                  removeItem={o.removeItemWithUndo}
                  setFinishFlash={o.setFinishFlash}
                  endWorkout={o.endWorkout}
                  summarizeWorkoutForFinish={o.summarizeWorkoutForFinish}
                  deleteWorkout={o.deleteWorkout}
                  restoreWorkout={o.restoreWorkout}
                  onRepeatWorkout={o.repeatWorkout}
                  onClose={() => onNavigate?.("workouts")}
                />
              )}
            </DataState>
          </div>
        )}

        {o.view === "templates" && (
          <WorkoutTemplatesSection
            exercises={o.exercises}
            search={o.search}
            templates={o.templateApi.templates}
            addTemplate={o.templateApi.addTemplate}
            updateTemplate={o.templateApi.updateTemplate}
            removeTemplate={o.templateApi.removeTemplate}
            restoreTemplate={o.templateApi.restoreTemplate}
            onStartTemplate={o.startWorkoutFromTemplate}
          />
        )}

        {(o.view === "catalog" ||
          // 02-A item 3 — the catalog used to hang around under the "log"
          // view even when the routed workout was finished or missing
          // (the error-state-plus-full-catalog dead end from the audit).
          // Only show it in "log" while there is a real, in-flight
          // workout to add exercises to.
          (o.view === "log" &&
            Boolean(o.activeWorkout) &&
            !o.activeWorkout?.endedAt)) && (
          <WorkoutCatalogSection
            mode={o.mode}
            q={o.q}
            setQ={o.setQ}
            equipmentFilter={o.equipmentFilter}
            setEquipmentFilter={o.setEquipmentFilter}
            locationFilter={o.locationFilter}
            setLocationFilter={o.setLocationFilter}
            equipmentUk={o.equipmentUk}
            equipmentCounts={o.equipmentCounts}
            grouped={o.grouped}
            open={o.open}
            setOpen={o.setOpen}
            handleExerciseInListClick={o.handleExerciseInListClick}
            setSelected={o.setSelected}
            recoveryConflictsForExercise={o.recoveryConflictsForExercise}
            rec={o.rec}
            musclesUk={o.musclesUk}
          />
        )}

        <ExerciseDetailSheet
          selected={o.selected}
          onClose={() => o.setSelected(null)}
          mode={o.mode}
          musclesUk={o.musclesUk}
          primaryGroupsUk={o.primaryGroupsUk}
          equipmentUk={o.equipmentUk}
          rec={o.rec}
          recoveryConflictsForExercise={o.recoveryConflictsForExercise}
          activeWorkoutId={o.activeWorkoutId}
          activeWorkout={o.activeWorkout}
          addExerciseToActive={o.addExerciseToActive}
          updateItem={o.updateItem}
          onDeleteRequest={() => o.setDeleteExerciseConfirm(true)}
          toast={o.toast}
          onNavigate={onNavigate}
        />

        <AddExerciseSheet
          open={o.addOpen}
          onClose={() => o.setAddOpen(false)}
          form={o.form}
          setForm={o.setForm}
          primaryGroupsUk={o.primaryGroupsUk}
          musclesUk={o.musclesUk}
          musclesByPrimaryGroup={o.musclesByPrimaryGroup}
          addExercise={o.addExercise}
        />

        <WorkoutFinishSheets
          finishFlash={o.finishFlash}
          setFinishFlash={o.setFinishFlash}
          updateWorkout={o.updateWorkout}
          onDone={activeOnly ? () => onNavigate?.("workouts") : undefined}
        />
      </div>

      <WorkoutsConfirmDialogs
        deleteExerciseConfirm={o.deleteExerciseConfirm}
        onDeleteExerciseConfirm={o.handleDeleteExerciseConfirm}
        onDeleteExerciseCancel={() => o.setDeleteExerciseConfirm(false)}
        riskyTemplate={o.riskyTemplateConfirm}
        onRiskyTemplateConfirm={o.handleRiskyTemplateConfirm}
        onRiskyTemplateCancel={() => o.setRiskyTemplateConfirm(null)}
        activeWorkoutConflictOpen={o.activeWorkoutConflictOpen}
        onFinishActiveAndContinue={o.finishActiveAndContinue}
        onDiscardActiveAndContinue={o.discardActiveAndContinue}
        onCancelActiveConflict={o.cancelPendingWorkoutStart}
      />
    </PullToRefresh>
  );
}
