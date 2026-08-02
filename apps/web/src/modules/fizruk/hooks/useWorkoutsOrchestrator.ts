import { useCallback, useMemo, useState } from "react";
import { safeReadStringLS } from "@shared/lib/storage/storage";
import { requestCloudPull } from "@shared/lib/modules/cloudPullRequest";
import { getKyivDateParts } from "@shared/lib/time/kyivTime";
import type { DataStateQueryLike } from "@shared/components/ui/DataState";
import { useToast } from "@shared/hooks/useToast";
import { showUndoToast } from "@shared/lib/ui/undoToast";
import { useExerciseCatalog } from "./useExerciseCatalog";
import { useRecovery } from "./useRecovery";
import {
  useWorkoutTemplates,
  type WorkoutTemplate,
} from "./useWorkoutTemplates";
import { useWorkouts } from "./useWorkouts";
import {
  useActiveWorkoutIdPersistence,
  useLiveWorkoutTick,
  useStaleActiveWorkoutCleanup,
  useWorkoutsViewFromSession,
} from "./useWorkoutsLifecycle";
import { useRestTimer } from "../context/RestTimerContext";
import { recoveryConflictsForExercise } from "@sergeant/fizruk-domain";
import type { RawExerciseDef } from "@sergeant/fizruk-domain/data";
import type { Workout, WorkoutGroup } from "@sergeant/fizruk-domain";
import {
  ACTIVE_WORKOUT_KEY,
  summarizeWorkoutForFinish,
} from "@sergeant/fizruk-domain";
import type { FinishFlashState, WorkoutsView } from "../pages/Workouts.types";
import {
  buildGroupedExercises,
  collectLastByExerciseId,
  formatActiveDuration,
  todayLocalDateString,
} from "../pages/Workouts.helpers";
import type { AddExerciseForm } from "../components/workouts/AddExerciseSheet";
import {
  trackFizrukWorkoutDiscarded,
  trackFizrukWorkoutStarted,
} from "../lib/workoutTelemetry";

interface TemplateGroup {
  id: string;
  exerciseIds?: string[];
  itemIds?: string[];
  type?: "circuit" | "superset";
  restSec?: number;
}

interface UseWorkoutsOrchestratorOptions {
  requestedWorkoutId?: string | undefined;
  initialView?: WorkoutsView | undefined;
  onWorkoutStarted?: ((workoutId: string) => void) | undefined;
}

export function useWorkoutsOrchestrator(
  options: UseWorkoutsOrchestratorOptions = {},
) {
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
  // Pulled out of `options` so the start callbacks can depend on the function
  // itself rather than on the whole options object, which is a fresh literal
  // on every render of the host page.
  const { onWorkoutStarted } = options;
  const [view, setView] = useState<WorkoutsView>(options.initialView ?? "home");
  const mode = view === "templates" || view === "home" ? "catalog" : view;
  const { restTimer, setRestTimer } = useRestTimer();
  const [activeWorkoutId, setActiveWorkoutId] = useState(
    () => options.requestedWorkoutId ?? safeReadStringLS(ACTIVE_WORKOUT_KEY),
  );
  const [finishFlash, setFinishFlash] = useState<FinishFlashState | null>(null);
  const [deleteExerciseConfirm, setDeleteExerciseConfirm] = useState(false);
  const [riskyTemplateConfirm, setRiskyTemplateConfirm] =
    useState<WorkoutTemplate | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [retroOpen, setRetroOpen] = useState(false);
  const [pendingWorkoutStart, setPendingWorkoutStart] = useState<
    (() => void) | null
  >(null);
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

  // The route owns which workout is focused, so a `workout/<id>` change has
  // to win over the pointer this hook already holds. Adjusting during render
  // (rather than in an effect) keeps the first paint on the new id instead of
  // flashing the previous one.
  const [syncedRequestedId, setSyncedRequestedId] = useState(
    options.requestedWorkoutId,
  );
  if (
    options.requestedWorkoutId &&
    options.requestedWorkoutId !== syncedRequestedId
  ) {
    setSyncedRequestedId(options.requestedWorkoutId);
    setActiveWorkoutId(options.requestedWorkoutId);
  }

  const activeDuration = useMemo(
    () =>
      formatActiveDuration(
        activeWorkout?.startedAt,
        activeWorkout?.endedAt,
        now,
      ),
    [activeWorkout?.startedAt, activeWorkout?.endedAt, now],
  );

  const conflictingWorkout = useMemo(
    () => workouts.find((workout) => !workout.endedAt) ?? null,
    [workouts],
  );

  const requestWorkoutStart = useCallback(
    (start: () => void) => {
      if (!conflictingWorkout) {
        start();
        return;
      }
      setPendingWorkoutStart(() => start);
    },
    [conflictingWorkout],
  );

  const continuePendingWorkoutStart = useCallback(
    (resolution: "finish" | "discard") => {
      const start = pendingWorkoutStart;
      if (!start || !conflictingWorkout) return;
      if (resolution === "finish") endWorkout(conflictingWorkout.id);
      else {
        deleteWorkout(conflictingWorkout.id);
        trackFizrukWorkoutDiscarded();
      }
      setActiveWorkoutId(null);
      setPendingWorkoutStart(null);
      start();
    },
    [conflictingWorkout, deleteWorkout, endWorkout, pendingWorkoutStart],
  );

  useActiveWorkoutIdPersistence(activeWorkoutId);
  useStaleActiveWorkoutCleanup(
    workoutsLoaded,
    workouts,
    activeWorkoutId,
    setActiveWorkoutId,
  );
  useWorkoutsViewFromSession(setView, !options.requestedWorkoutId);

  useLiveWorkoutTick(activeWorkout, setNow);

  const addExerciseToActive = useCallback(
    (ex: RawExerciseDef) => {
      if (!activeWorkoutId) return;
      const isCardio = ex.primaryGroup === "cardio";
      addItem(activeWorkoutId, {
        exerciseId: ex.id,
        nameUk: ex?.name?.uk || ex?.name?.en || ex.id,
        primaryGroup: ex.primaryGroup,
        musclesPrimary: ex?.muscles?.primary || [],
        musclesSecondary: ex?.muscles?.secondary || [],
        type: isCardio ? "distance" : "strength",
        ...(isCardio ? {} : { sets: [{ weightKg: 0, reps: 0 }] }),
        durationSec: 0,
        distanceM: 0,
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
          "Спочатку натисни «+ Нове» у блоці нижче, щоб з'явилось активне тренування.",
        );
        return;
      }
      if (activeWorkout?.endedAt) {
        toast.warning(
          "Це тренування вже завершено. Обери чернетку в «Останні тренування» або створи нове.",
        );
        return;
      }
      const conflicts = recoveryConflictsForExercise(ex, rec.by);
      if (conflicts.injury.blocked) {
        toast.warning(
          "Ти позначив біль у цій групі. Ми не радимо її навантажувати.",
        );
      }
      addExerciseToActive(ex);
    },
    [
      mode,
      activeWorkoutId,
      activeWorkout?.endedAt,
      addExerciseToActive,
      rec.by,
      toast,
    ],
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
          nameUk: ex?.name?.uk || ex?.name?.en || ex.id,
          primaryGroup: ex.primaryGroup,
          musclesPrimary: ex?.muscles?.primary || [],
          musclesSecondary: ex?.muscles?.secondary || [],
          type: isCardio ? "distance" : "strength",
          ...(isCardio ? {} : { sets: [{ weightKg: 0, reps: 0 }] }),
          durationSec: 0,
          distanceM: 0,
        });
        exIdToItemId[ex.id] = itemId;
      }
      if ((tpl?.groups || []).length > 0) {
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
      trackFizrukWorkoutStarted(w.id, "template");
      if (onWorkoutStarted) onWorkoutStarted(w.id);
      else setView("log");
    },
    [
      exercises,
      createWorkout,
      addItem,
      updateWorkout,
      templateApi,
      onWorkoutStarted,
    ],
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
        (ex) => recoveryConflictsForExercise(ex, rec.by).hasHardBlock,
      );
      if (risky) {
        setRiskyTemplateConfirm(tpl);
        return;
      }
      requestWorkoutStart(() => executeTemplateStart(tpl));
    },
    [exercises, rec.by, executeTemplateStart, requestWorkoutStart, toast],
  );

  const submitRetroWorkout = useCallback(() => {
    requestWorkoutStart(() => {
      const parts = retroDate.split("-").map(Number);
      const kyivNow = getKyivDateParts();
      const y = parts[0] ?? kyivNow.year;
      const mo = parts[1] ?? kyivNow.month;
      const d = parts[2] ?? kyivNow.day;
      const timeParts = (retroTime || "12:00").split(":").map(Number);
      const hh = timeParts[0] ?? 12;
      const mm = timeParts[1] ?? 0;
      const startedAt = new Date(y, mo - 1, d, hh, mm, 0, 0).toISOString();
      const w = createWorkoutWithTimes({ startedAt });
      setActiveWorkoutId(w.id);
      setRetroOpen(false);
      if (onWorkoutStarted) onWorkoutStarted(w.id);
    });
  }, [
    retroDate,
    retroTime,
    createWorkoutWithTimes,
    onWorkoutStarted,
    requestWorkoutStart,
  ]);

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

  const handlePullRefresh = useCallback(() => requestCloudPull(2500), []);

  const journalQuery: DataStateQueryLike<readonly Workout[]> = {
    data: workoutsLoaded ? workouts : undefined,
    isLoading: !workoutsLoaded,
  };

  const handleQuickStart = useCallback(() => {
    requestWorkoutStart(() => {
      const workout = createWorkout();
      setActiveWorkoutId(workout.id);
      trackFizrukWorkoutStarted(workout.id, "quick_start");
      if (onWorkoutStarted) onWorkoutStarted(workout.id);
      else setView("log");
    });
  }, [createWorkout, onWorkoutStarted, requestWorkoutStart]);

  const handleDeleteExerciseConfirm = useCallback(() => {
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
  }, [selected, removeExercise, addExercise, toast]);

  const handleRiskyTemplateConfirm = useCallback(() => {
    const tpl = riskyTemplateConfirm;
    setRiskyTemplateConfirm(null);
    if (!tpl) return;
    requestWorkoutStart(() => executeTemplateStart(tpl));
  }, [riskyTemplateConfirm, executeTemplateStart, requestWorkoutStart]);

  return {
    toast,
    exercises,
    search,
    primaryGroupsUk,
    equipmentUk,
    musclesUk,
    musclesByPrimaryGroup,
    addExercise,
    rec,
    workouts,
    workoutsLoaded,
    createWorkout,
    updateWorkout,
    deleteWorkout,
    restoreWorkout,
    endWorkout,
    updateItem,
    removeItemWithUndo,
    templateApi,
    q,
    setQ,
    equipmentFilter,
    setEquipmentFilter,
    selected,
    setSelected,
    open,
    setOpen,
    addOpen,
    setAddOpen,
    view,
    setView,
    mode,
    restTimer,
    setRestTimer,
    activeWorkoutId,
    setActiveWorkoutId,
    finishFlash,
    setFinishFlash,
    deleteExerciseConfirm,
    setDeleteExerciseConfirm,
    riskyTemplateConfirm,
    setRiskyTemplateConfirm,
    now,
    retroOpen,
    setRetroOpen,
    activeWorkoutConflictOpen: pendingWorkoutStart !== null,
    finishActiveAndContinue: () => continuePendingWorkoutStart("finish"),
    discardActiveAndContinue: () => continuePendingWorkoutStart("discard"),
    cancelPendingWorkoutStart: () => setPendingWorkoutStart(null),
    retroDate,
    setRetroDate,
    retroTime,
    setRetroTime,
    form,
    setForm,
    activeWorkout,
    activeDuration,
    addExerciseToActive,
    handleExerciseInListClick,
    startWorkoutFromTemplate,
    submitRetroWorkout,
    lastByExerciseId,
    grouped,
    finishedCount,
    recentWorkouts,
    handlePullRefresh,
    journalQuery,
    handleQuickStart,
    handleDeleteExerciseConfirm,
    handleRiskyTemplateConfirm,
    summarizeWorkoutForFinish,
    recoveryConflictsForExercise,
  };
}
