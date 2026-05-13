import { PullToRefresh } from "@shared/components/ui/PullToRefresh";
import { Skeleton } from "@shared/components/ui/Skeleton";
import { DataState } from "@shared/components/ui/DataState";
import { WorkoutTemplatesSection } from "../components/WorkoutTemplatesSection";
import { RestTimerOverlay } from "../components/workouts/RestTimerOverlay";
import { WorkoutFinishSheets } from "../components/workouts/WorkoutFinishSheets";
import { AddExerciseSheet } from "../components/workouts/AddExerciseSheet";
import { ExerciseDetailSheet } from "../components/workouts/ExerciseDetailSheet";
import { WorkoutJournalSection } from "../components/workouts/WorkoutJournalSection";
import { WorkoutCatalogSection } from "../components/workouts/WorkoutCatalogSection";
import { QuickStartSheet } from "../components/workouts/QuickStartSheet";
import { WorkoutsHome } from "../components/workouts/WorkoutsHome";
import { WorkoutsHeader } from "../components/workouts/WorkoutsHeader";
import { WorkoutsConfirmDialogs } from "../components/workouts/WorkoutsConfirmDialogs";
import { useWorkoutsOrchestrator } from "../hooks/useWorkoutsOrchestrator";
import { messages } from "@shared/i18n/uk";

interface WorkoutsProps {
  /**
   * Deep-link to the Routine module's calendar tab. Wired by
   * `FizrukRouter.tsx` from the optional `onOpenModule` prop on the
   * Fizruk shell. When present, the workouts home shows a third
   * action — «Запланувати тренування» — next to the «Почати» /
   * «Внести проведене» CTAs. This used to live on a separate «План»
   * tab that the user asked us to dissolve.
   */
  onOpenRoutine?: () => void;
  /**
   * Deep-link to the Fizruk «Програми» page. Wired by
   * `FizrukRouter.tsx` from the parent `onNavigate` so the Workouts
   * home can surface a tile in «Довідники» that takes users into the
   * built-in program catalogue without forcing them back to the
   * dashboard hero just to find it.
   */
  onOpenPrograms?: () => void;
}

export function Workouts({
  onOpenRoutine,
  onOpenPrograms,
}: WorkoutsProps = {}) {
  const o = useWorkoutsOrchestrator();

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
    <PullToRefresh onRefresh={o.handlePullRefresh} variant="fizruk">
      <div className="max-w-4xl mx-auto px-4 pt-4 page-tabbar-pad">
        <WorkoutsHeader
          view={o.view}
          activeWorkout={o.activeWorkout}
          finishedCount={o.finishedCount}
          onBack={() => o.setView("home")}
          onAddCatalog={() => o.setAddOpen(true)}
        />

        {o.view === "home" ? (
          <WorkoutsHome
            activeWorkout={o.activeWorkout}
            activeDuration={o.activeDuration}
            recentWorkouts={o.recentWorkouts}
            onOpenSession={() => o.setView("log")}
            onOpenCatalog={() => o.setView("catalog")}
            onOpenTemplates={() => o.setView("templates")}
            onOpenJournal={() => o.setView("log")}
            onRequestStart={() => o.setQuickStartOpen(true)}
            onOpenRetro={() => {
              o.setRetroOpen(true);
              o.setView("log");
            }}
            onOpenSchedule={onOpenRoutine}
            onOpenPrograms={onOpenPrograms}
          />
        ) : null}

        {o.view === "log" && (
          <DataState query={o.journalQuery} skeleton={workoutsLoadingSkeleton}>
            {() => (
              <WorkoutJournalSection
                activeWorkout={o.activeWorkout}
                activeDuration={o.activeDuration}
                workouts={o.workouts}
                activeWorkoutId={o.activeWorkoutId}
                setActiveWorkoutId={o.setActiveWorkoutId}
                retroOpen={o.retroOpen}
                setRetroOpen={o.setRetroOpen}
                retroDate={o.retroDate}
                setRetroDate={o.setRetroDate}
                retroTime={o.retroTime}
                setRetroTime={o.setRetroTime}
                createWorkout={o.createWorkout}
                setMode={o.setView}
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
                submitRetroWorkout={o.submitRetroWorkout}
                deleteWorkout={o.deleteWorkout}
                restoreWorkout={o.restoreWorkout}
              />
            )}
          </DataState>
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

        {(o.view === "catalog" || o.view === "log") && (
          <WorkoutCatalogSection
            mode={o.mode}
            q={o.q}
            setQ={o.setQ}
            equipmentFilter={o.equipmentFilter}
            setEquipmentFilter={o.setEquipmentFilter}
            equipmentUk={o.equipmentUk}
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
          rec={o.rec}
          recoveryConflictsForExercise={o.recoveryConflictsForExercise}
          activeWorkoutId={o.activeWorkoutId}
          activeWorkout={o.activeWorkout}
          addExerciseToActive={o.addExerciseToActive}
          onDeleteRequest={() => o.setDeleteExerciseConfirm(true)}
          toast={o.toast}
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

        <QuickStartSheet
          open={o.quickStartOpen}
          onClose={() => o.setQuickStartOpen(false)}
          exercises={o.exercises}
          search={o.search}
          primaryGroupsUk={o.primaryGroupsUk}
          onPickTemplate={() => {
            o.setQuickStartOpen(false);
            o.setView("templates");
          }}
          onConfirmExercises={o.handleQuickStartConfirm}
        />

        <RestTimerOverlay
          restTimer={o.restTimer}
          onCancel={() => o.setRestTimer(null)}
        />

        <WorkoutFinishSheets
          finishFlash={o.finishFlash}
          setFinishFlash={o.setFinishFlash}
          updateWorkout={o.updateWorkout}
        />
      </div>

      <WorkoutsConfirmDialogs
        deleteExerciseConfirm={o.deleteExerciseConfirm}
        onDeleteExerciseConfirm={o.handleDeleteExerciseConfirm}
        onDeleteExerciseCancel={() => o.setDeleteExerciseConfirm(false)}
        riskyTemplate={o.riskyTemplateConfirm}
        onRiskyTemplateConfirm={o.handleRiskyTemplateConfirm}
        onRiskyTemplateCancel={() => o.setRiskyTemplateConfirm(null)}
      />
    </PullToRefresh>
  );
}
