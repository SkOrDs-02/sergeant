import { useCallback, useMemo, useState } from "react";
import { safeReadStringLS } from "@shared/lib/storage/storage";
import { requestCloudPull } from "@shared/lib/modules/cloudPullRequest";
import { PullToRefresh } from "@shared/components/ui/PullToRefresh";
import { Skeleton } from "@shared/components/ui/Skeleton";
import {
  DataState,
  type DataStateQueryLike,
} from "@shared/components/ui/DataState";
import { useToast } from "@shared/hooks/useToast";
import { showUndoToast } from "@shared/lib/ui/undoToast";
import { WorkoutTemplatesSection } from "../components/WorkoutTemplatesSection";
import { RestTimerOverlay } from "../components/workouts/RestTimerOverlay";
import { WorkoutFinishSheets } from "../components/workouts/WorkoutFinishSheets";
import {
  AddExerciseSheet,
  type AddExerciseForm,
} from "../components/workouts/AddExerciseSheet";
import { ExerciseDetailSheet } from "../components/workouts/ExerciseDetailSheet";
import { WorkoutJournalSection } from "../components/workouts/WorkoutJournalSection";
import { WorkoutCatalogSection } from "../components/workouts/WorkoutCatalogSection";
import { QuickStartSheet } from "../components/workouts/QuickStartSheet";
import { WorkoutsHome } from "../components/workouts/WorkoutsHome";
import { WorkoutsHeader } from "../components/workouts/WorkoutsHeader";
import { WorkoutsConfirmDialogs } from "../components/workouts/WorkoutsConfirmDialogs";
import { useExerciseCatalog } from "../hooks/useExerciseCatalog";
import { useFizrukRestSound } from "../hooks/useFizrukRestSound";
import type { RestTimerState } from "../hooks/useFizrukRestSound";
import { useRecovery } from "../hooks/useRecovery";
import {
  useWorkoutTemplates,
  type WorkoutTemplate,
} from "../hooks/useWorkoutTemplates";
import { useWorkouts } from "../hooks/useWorkouts";
import {
  useActiveWorkoutIdPersistence,
  useLiveWorkoutTick,
  useRestTimerCountdown,
  useStaleActiveWorkoutCleanup,
  useWorkoutsViewFromSession,
} from "../hooks/useWorkoutsLifecycle";
import { recoveryConflictsForExercise } from "@sergeant/fizruk-domain";
import type { RawExerciseDef } from "@sergeant/fizruk-domain/data";
import type { Workout, WorkoutGroup } from "@sergeant/fizruk-domain";
import {
  ACTIVE_WORKOUT_KEY,
  summarizeWorkoutForFinish,
} from "@sergeant/fizruk-domain";
import type { FinishFlashState, WorkoutsView } from "./Workouts.types";
import {
  buildGroupedExercises,
  collectLastByExerciseId,
  formatActiveDuration,
  todayLocalDateString,
} from "./Workouts.helpers";

export function Workouts() {
  const toast = useToast();
  const {
    exercises,
    search,
    primaryGroupsUk,
    equipmentUk,
    musclesUk,
    musclesByPrimaryGroup,
    addExercise,
    removeExercise,
  } = useExerciseCatalog();
  const rec = useRecovery();
  const {
    workouts,
    loaded: workoutsLoaded,
    createWorkout,
    createWorkoutWithTimes,
    updateWorkout,
    deleteWorkout,
    restoreWorkout,
    endWorkout,
    addItem,
    updateItem,
    removeItem,
  } = useWorkouts();
  const removeItemWithUndo = useCallback(
    (workoutId: string, itemId: string) => {
      const w = workouts.find((x) => x.id === workoutId);
      if (!w) {
        removeItem(workoutId, itemId);
        return;
      }
      const snapshot = {
        items: w.items || [],
        groups: w.groups || [],
      };
      removeItem(workoutId, itemId);
      showUndoToast(toast, {
        msg: "Вправу видалено з тренування",
        onUndo: () =>
          updateWorkout(workoutId, {
            items: snapshot.items,
            groups: snapshot.groups,
          }),
      });
    },
    [workouts, removeItem, updateWorkout, toast],
  );
  const templateApi = useWorkoutTemplates();
  const [q, setQ] = useState("");
  const [equipmentFilter, setEquipmentFilter] = useState<string[]>([]);
  const [selected, setSelected] = useState<RawExerciseDef | null>(null);
  const [open, setOpen] = useState<Record<string, boolean>>(() => ({}));
  const [addOpen, setAddOpen] = useState(false);
  // `view` drives the page chrome:
  //   "home"      — new landing layout with active/start hero, recent 3
  //                 journal rows and quick-link tiles. Replaces the old
  //                 default that dropped users straight into the catalog.
  //   "log"       — active-workout panel + exercise catalog below (this is
  //                 where you actually run a session and add exercises).
  //   "catalog"   — browse-only catalog (no active-workout wiring).
  //   "templates" — workout templates list.
  const [view, setView] = useState<WorkoutsView>("home");
  // `mode` is still exposed to legacy subcomponents that branch on
  // "catalog" vs "log" (exercise-in-list click handler, `ExerciseDetailSheet`,
  // `WorkoutCatalogSection`). Kept in sync with `view` for those subviews.
  const mode = view === "templates" || view === "home" ? "catalog" : view;
  const [restTimer, setRestTimer] = useState<RestTimerState | null>(null);
  const [activeWorkoutId, setActiveWorkoutId] = useState(() =>
    safeReadStringLS(ACTIVE_WORKOUT_KEY),
  );
  const [finishFlash, setFinishFlash] = useState<FinishFlashState | null>(null);
  const [deleteExerciseConfirm, setDeleteExerciseConfirm] = useState(false);
  const [riskyTemplateConfirm, setRiskyTemplateConfirm] =
    useState<WorkoutTemplate | null>(null); // stores template when risky
  const [now, setNow] = useState(Date.now());
  const [retroOpen, setRetroOpen] = useState(false);
  const [quickStartOpen, setQuickStartOpen] = useState(false);
  const [retroDate, setRetroDate] = useState(() => todayLocalDateString());
  const [retroTime, setRetroTime] = useState("18:00");
  const [form, setForm] = useState<AddExerciseForm>(() => ({
    nameUk: "",
    primaryGroup: "chest",
    musclesPrimary: [],
    musclesSecondary: [],
    equipment: ["bodyweight"],
    description: "",
  }));
  const list = useMemo(() => search(q), [search, q]);
  const activeWorkout: Workout | null =
    workouts.find((w) => w.id === activeWorkoutId) || null;

  const activeDuration = useMemo(
    () =>
      formatActiveDuration(
        activeWorkout?.startedAt,
        activeWorkout?.endedAt,
        now,
      ),
    [activeWorkout?.startedAt, activeWorkout?.endedAt, now],
  );

  useActiveWorkoutIdPersistence(activeWorkoutId);
  useStaleActiveWorkoutCleanup(
    workoutsLoaded,
    workouts,
    activeWorkoutId,
    setActiveWorkoutId,
  );
  useWorkoutsViewFromSession(setView);

  const { markCompletedNaturally } = useFizrukRestSound(restTimer);
  useRestTimerCountdown(restTimer, setRestTimer, markCompletedNaturally);
  useLiveWorkoutTick(activeWorkout, setNow);

  const addExerciseToActive = useCallback(
    (ex: RawExerciseDef) => {
      if (!activeWorkoutId) return;
      const isCardio = ex.primaryGroup === "cardio";
      addItem(activeWorkoutId, {
        exerciseId: ex.id,
        nameUk: ex?.name?.uk || ex?.name?.en,
        primaryGroup: ex.primaryGroup,
        musclesPrimary: ex?.muscles?.primary || [],
        musclesSecondary: ex?.muscles?.secondary || [],
        type: isCardio ? "distance" : "strength",
        sets: isCardio ? undefined : [{ weightKg: 0, reps: 0 }],
        durationSec: isCardio ? 0 : 0,
        distanceM: isCardio ? 0 : 0,
      });
    },
    [activeWorkoutId, addItem],
  );

  const handleExerciseInListClick = useCallback(
    (ex: RawExerciseDef) => {
      if (mode !== "log") {
        setSelected(ex);
        return;
      }
      if (!activeWorkoutId) {
        toast.warning(
          "Спочатку натисни «+ Нове» у блоці нижче, щоб з’явилось активне тренування.",
        );
        return;
      }
      if (activeWorkout?.endedAt) {
        toast.warning(
          "Це тренування вже завершено. Обери чернетку в «Останні тренування» або створи нове.",
        );
        return;
      }
      addExerciseToActive(ex);
    },
    [mode, activeWorkoutId, activeWorkout?.endedAt, addExerciseToActive, toast],
  );

  const executeTemplateStart = useCallback(
    (tpl: WorkoutTemplate) => {
      const picks: RawExerciseDef[] = (tpl?.exerciseIds || [])
        .map((id: string) => exercises.find((e) => e.id === id))
        .filter((e): e is RawExerciseDef => Boolean(e));
      const w = createWorkout();
      const exIdToItemId: Record<string, string> = {};
      for (const ex of picks) {
        const isCardio = ex.primaryGroup === "cardio";
        const itemId = addItem(w.id, {
          exerciseId: ex.id,
          nameUk: ex?.name?.uk || ex?.name?.en,
          primaryGroup: ex.primaryGroup,
          musclesPrimary: ex?.muscles?.primary || [],
          musclesSecondary: ex?.muscles?.secondary || [],
          type: isCardio ? "distance" : "strength",
          sets: isCardio ? undefined : [{ weightKg: 0, reps: 0 }],
          durationSec: 0,
          distanceM: isCardio ? 0 : 0,
        });
        exIdToItemId[ex.id] = itemId;
      }
      if ((tpl?.groups || []).length > 0) {
        // Templates persist `groups` as `unknown[]` (see useWorkoutTemplates),
        // so narrow each group to the template-shape we read here before
        // building the workout-side `groups` payload. The mapped shape
        // matches the canonical `WorkoutGroup` (`id`, `itemIds` + the
        // optional `type`/`restSec` carried over from the template).
        interface TemplateGroup {
          id: string;
          exerciseIds?: string[];
          itemIds?: string[];
          type?: "circuit" | "superset";
          restSec?: number;
        }
        const workoutGroups: WorkoutGroup[] = (
          (tpl.groups || []) as TemplateGroup[]
        )
          .map((g) => ({
            id: g.id,
            type: g.type,
            restSec: g.restSec,
            itemIds: (g.exerciseIds || [])
              .map((exId: string) => exIdToItemId[exId])
              .filter((id): id is string => Boolean(id)),
          }))
          .filter((g) => g.itemIds.length >= 2);
        if (workoutGroups.length > 0) {
          updateWorkout(w.id, { groups: workoutGroups });
        }
      }
      if (tpl?.id) templateApi.markTemplateUsed(tpl.id);
      setActiveWorkoutId(w.id);
      setView("log");
    },
    [exercises, createWorkout, addItem, updateWorkout, templateApi],
  );

  const startWorkoutFromTemplate = useCallback(
    (tpl: WorkoutTemplate) => {
      const picks: RawExerciseDef[] = (tpl?.exerciseIds || [])
        .map((id: string) => exercises.find((e) => e.id === id))
        .filter((e): e is RawExerciseDef => Boolean(e));
      if (!picks.length) {
        toast.warning(
          "У шаблоні немає вправ з каталогу. Відредагуй шаблон і додай вправи.",
        );
        return;
      }
      const risky = picks.some(
        (ex) => recoveryConflictsForExercise(ex, rec.by).hasWarning,
      );
      if (risky) {
        setRiskyTemplateConfirm(tpl);
        return;
      }
      executeTemplateStart(tpl);
    },
    [exercises, rec.by, executeTemplateStart, toast],
  );

  const submitRetroWorkout = useCallback(() => {
    const [y, mo, d] = retroDate.split("-").map(Number);
    const [hh, mm] = (retroTime || "12:00").split(":").map(Number);
    const startedAt = new Date(y!, mo! - 1, d, hh, mm, 0, 0).toISOString();
    const w = createWorkoutWithTimes({ startedAt });
    setActiveWorkoutId(w.id);
    setRetroOpen(false);
  }, [retroDate, retroTime, createWorkoutWithTimes]);

  const lastByExerciseId = useMemo(
    () => collectLastByExerciseId(workouts, activeWorkoutId),
    [workouts, activeWorkoutId],
  );

  const grouped = useMemo(
    () => buildGroupedExercises(list, equipmentFilter, primaryGroupsUk),
    [list, equipmentFilter, primaryGroupsUk],
  );

  const finishedCount = useMemo(
    () => (workouts || []).filter((w) => w.endedAt).length,
    [workouts],
  );

  const recentWorkouts = useMemo(
    () =>
      [...(workouts || [])]
        .sort(
          (a, b) =>
            new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime(),
        )
        .slice(0, 3),
    [workouts],
  );

  // Workouts are local-first (MMKV-web), so PTR's job is to ask the
  // App-level cloud-sync engine for a fresh pull. The local list will
  // re-render automatically once the engine writes new state.
  const handlePullRefresh = useCallback(() => requestCloudPull(2500), []);

  // DataState contract for the workout journal:
  //   - `useWorkouts` flips `loaded` from false → true after the first
  //     hydration tick. While `loaded === false` we feed `data: undefined`
  //     so DataState renders the skeleton slot; from the second tick on
  //     `data` is the real list (possibly empty), which lets the journal
  //     render its own "порожньо" empty-state without flashing it during
  //     mount.
  //   - `isLoading` mirrors the inverted `loaded` flag so a future
  //     stale-revalidate (cloud pull → re-merge) keeps the list visible.
  const journalQuery: DataStateQueryLike<readonly Workout[]> = {
    data: workoutsLoaded ? workouts : undefined,
    isLoading: !workoutsLoaded,
  };

  const workoutsLoadingSkeleton = (
    <div
      className="space-y-3"
      role="status"
      aria-live="polite"
      aria-label="Завантажую тренування"
    >
      <Skeleton className="h-28 w-full" />
      <Skeleton className="h-20 w-full" />
      <Skeleton className="h-20 w-full" />
    </div>
  );

  return (
    <PullToRefresh onRefresh={handlePullRefresh} variant="fizruk">
      <div className="max-w-4xl mx-auto px-4 pt-4 page-tabbar-pad">
        <WorkoutsHeader
          view={view}
          activeWorkout={activeWorkout}
          finishedCount={finishedCount}
          onBack={() => setView("home")}
          onAddCatalog={() => setAddOpen(true)}
        />

        {view === "home" ? (
          <WorkoutsHome
            activeWorkout={activeWorkout}
            activeDuration={activeDuration}
            recentWorkouts={recentWorkouts}
            onOpenSession={() => setView("log")}
            onOpenCatalog={() => setView("catalog")}
            onOpenTemplates={() => setView("templates")}
            onOpenJournal={() => setView("log")}
            onRequestStart={() => setQuickStartOpen(true)}
            onOpenRetro={() => {
              setRetroOpen(true);
              setView("log");
            }}
          />
        ) : null}

        {view === "log" && (
          // DataState contract: `data === undefined` triggers the skeleton
          // slot. `useWorkouts` flips `loaded` from false → true after one
          // tick on mount (it rehydrates from `localStorage` / SQLite),
          // so on first paint we feed `data: undefined` and from the
          // second tick onwards `data` is the real list — even when it
          // happens to be empty. This prevents the "порожньо" empty-state
          // inside `WorkoutJournalSection` from flashing during hydration.
          <DataState query={journalQuery} skeleton={workoutsLoadingSkeleton}>
            {() => (
              <WorkoutJournalSection
                activeWorkout={activeWorkout}
                activeDuration={activeDuration}
                workouts={workouts}
                activeWorkoutId={activeWorkoutId}
                setActiveWorkoutId={setActiveWorkoutId}
                retroOpen={retroOpen}
                setRetroOpen={setRetroOpen}
                retroDate={retroDate}
                setRetroDate={setRetroDate}
                retroTime={retroTime}
                setRetroTime={setRetroTime}
                createWorkout={createWorkout}
                setMode={setView}
                musclesUk={musclesUk}
                recBy={rec.by}
                lastByExerciseId={lastByExerciseId}
                setRestTimer={setRestTimer}
                updateWorkout={updateWorkout}
                updateItem={updateItem}
                removeItem={removeItemWithUndo}
                setFinishFlash={setFinishFlash}
                endWorkout={endWorkout}
                summarizeWorkoutForFinish={summarizeWorkoutForFinish}
                submitRetroWorkout={submitRetroWorkout}
                deleteWorkout={deleteWorkout}
                restoreWorkout={restoreWorkout}
              />
            )}
          </DataState>
        )}

        {view === "templates" && (
          <WorkoutTemplatesSection
            exercises={exercises}
            search={search}
            templates={templateApi.templates}
            addTemplate={templateApi.addTemplate}
            updateTemplate={templateApi.updateTemplate}
            removeTemplate={templateApi.removeTemplate}
            restoreTemplate={templateApi.restoreTemplate}
            onStartTemplate={startWorkoutFromTemplate}
          />
        )}

        {(view === "catalog" || view === "log") && (
          <WorkoutCatalogSection
            mode={mode}
            q={q}
            setQ={setQ}
            equipmentFilter={equipmentFilter}
            setEquipmentFilter={setEquipmentFilter}
            equipmentUk={equipmentUk}
            grouped={grouped}
            open={open}
            setOpen={setOpen}
            handleExerciseInListClick={handleExerciseInListClick}
            setSelected={setSelected}
            recoveryConflictsForExercise={recoveryConflictsForExercise}
            rec={rec}
            musclesUk={musclesUk}
          />
        )}

        <ExerciseDetailSheet
          selected={selected}
          onClose={() => setSelected(null)}
          mode={mode}
          musclesUk={musclesUk}
          rec={rec}
          recoveryConflictsForExercise={recoveryConflictsForExercise}
          activeWorkoutId={activeWorkoutId}
          activeWorkout={activeWorkout}
          addExerciseToActive={addExerciseToActive}
          onDeleteRequest={() => setDeleteExerciseConfirm(true)}
          toast={toast}
        />

        <AddExerciseSheet
          open={addOpen}
          onClose={() => setAddOpen(false)}
          form={form}
          setForm={setForm}
          primaryGroupsUk={primaryGroupsUk}
          musclesUk={musclesUk}
          musclesByPrimaryGroup={musclesByPrimaryGroup}
          addExercise={addExercise}
        />

        <QuickStartSheet
          open={quickStartOpen}
          onClose={() => setQuickStartOpen(false)}
          exercises={exercises}
          search={search}
          primaryGroupsUk={primaryGroupsUk}
          onPickTemplate={() => {
            setQuickStartOpen(false);
            setView("templates");
          }}
          onConfirmExercises={(picks: RawExerciseDef[]) => {
            // Build a fresh ad-hoc session and pre-load the picked
            // exercises before flipping the active flag — that way the
            // session-level live timer (`activeWorkout.startedAt`) is
            // only created after the user confirmed their selection,
            // matching the user-stated requirement that the timer must
            // not start before exercises are lined up.
            const w = createWorkout();
            for (const ex of picks) {
              const isCardio = ex.primaryGroup === "cardio";
              addItem(w.id, {
                exerciseId: ex.id,
                nameUk: ex?.name?.uk || ex?.name?.en,
                primaryGroup: ex.primaryGroup,
                musclesPrimary: ex?.muscles?.primary || [],
                musclesSecondary: ex?.muscles?.secondary || [],
                type: isCardio ? "distance" : "strength",
                sets: isCardio ? undefined : [{ weightKg: 0, reps: 0 }],
                durationSec: isCardio ? 0 : 0,
                distanceM: isCardio ? 0 : 0,
              });
            }
            setActiveWorkoutId(w.id);
            setQuickStartOpen(false);
            setView("log");
          }}
        />

        <RestTimerOverlay
          restTimer={restTimer}
          onCancel={() => setRestTimer(null)}
        />

        <WorkoutFinishSheets
          finishFlash={finishFlash}
          setFinishFlash={setFinishFlash}
          updateWorkout={updateWorkout}
        />
      </div>

      <WorkoutsConfirmDialogs
        deleteExerciseConfirm={deleteExerciseConfirm}
        onDeleteExerciseConfirm={() => {
          if (selected) {
            const snapshot = selected;
            if (removeExercise(snapshot.id)) {
              setSelected(null);
              showUndoToast(toast, {
                msg: `Вправу «${snapshot?.name?.uk || "без назви"}» видалено`,
                onUndo: () => addExercise(snapshot),
              });
            }
          }
          setDeleteExerciseConfirm(false);
        }}
        onDeleteExerciseCancel={() => setDeleteExerciseConfirm(false)}
        riskyTemplate={riskyTemplateConfirm}
        onRiskyTemplateConfirm={() => {
          const tpl = riskyTemplateConfirm;
          setRiskyTemplateConfirm(null);
          if (!tpl) return;
          executeTemplateStart(tpl);
        }}
        onRiskyTemplateCancel={() => setRiskyTemplateConfirm(null)}
      />
    </PullToRefresh>
  );
}
