import { useCallback, useMemo, useState } from "react";
import { safeReadStringLS } from "@shared/lib/storage/storage";
import { requestCloudPull } from "@shared/lib/modules/cloudPullRequest";
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
import type {
  ExerciseLocation,
  RawExerciseDef,
} from "@sergeant/fizruk-domain/data";
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
} from "../pages/Workouts.helpers";
import {
  peekPendingRetroEnd,
  setPendingRetroEnd,
} from "../lib/pendingRetroEnd";
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
  const [locationFilter, setLocationFilter] = useState<ExerciseLocation | "">(
    "",
  );
  const [selected, setSelected] = useState<RawExerciseDef | null>(null);
  const [open, setOpen] = useState<Record<string, boolean>>(() => ({}));
  const [addOpen, setAddOpen] = useState(false);
  /** Форма «Внести проведене заняття» — див. `submitPastWorkout` нижче. */
  const [logPastOpen, setLogPastOpen] = useState(false);
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
  const [pendingWorkoutStart, setPendingWorkoutStart] = useState<
    (() => void) | null
  >(null);
  /**
   * Кінець ретро-сесії, яку ще заповнюють. Читаємо сховище рівно раз — при
   * монтуванні, — і далі оновлюємо явно у `submitPastWorkout`. Ефект тут був
   * би зайвим: перехід на `workout/<id>` монтує цей хук наново, тож ліниве
   * `useState` покриває і цей випадок. Значення потрібне лише для показу
   * тривалості; щойно `endedAt` записано, воно перестає впливати на будь-що.
   */
  const [pendingRetroEnd, setPendingRetroEndValue] = useState<string | null>(
    () => {
      const id =
        options.requestedWorkoutId ?? safeReadStringLS(ACTIVE_WORKOUT_KEY);
      return id ? peekPendingRetroEnd(id) : null;
    },
  );
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
        // Показуємо введену тривалість, а не лічильник від учорашнього вечора:
        // інакше над щойно внесеною сесією цокало б «30:12:05», і це читалось
        // би як зламаний таймер.
        activeWorkout?.endedAt ?? pendingRetroEnd,
        now,
      ),
    [activeWorkout?.startedAt, activeWorkout?.endedAt, pendingRetroEnd, now],
  );

  /**
   * Правка відкладеного кінця з `WorkoutTimeEditor`. Пишемо в обидва місця
   * одразу: сховище переживає перехід маршруту й перезавантаження, стан —
   * тримає шапку («· 50:00») узгодженою з полем без перемонтування.
   */
  const updatePendingRetroEnd = useCallback(
    (iso: string) => {
      if (!activeWorkoutId) return;
      setPendingRetroEnd(activeWorkoutId, iso);
      setPendingRetroEndValue(iso);
    },
    [activeWorkoutId],
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
    { routeOwnsWorkoutId: Boolean(options.requestedWorkoutId) },
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
          "Спочатку натисни «+ Нове» у блоці нижче, щоб зʼявилось активне тренування.",
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
          "Ти позначив біль у цій групі. Навантажувати її не раджу.",
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

  const lastByExerciseId = useMemo(
    () => collectLastByExerciseId(workouts, activeWorkoutId),
    [workouts, activeWorkoutId],
  );

  const grouped = useMemo(
    () =>
      buildGroupedExercises(
        list,
        equipmentFilter,
        primaryGroupsUk,
        locationFilter,
      ),
    [list, equipmentFilter, primaryGroupsUk, locationFilter],
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

  /**
   * «Внести проведене заняття» — тренування заднім числом.
   *
   * **Створюємо НЕзавершеним, хоч кінець уже відомий.** Перша версія ставила
   * `endedAt` одразу — і тим викидала людину повз увесь післятренувальний
   * потік: завершене тренування малюється read-only підсумком, тож ні вправ
   * не додаси, ні оцінки самопочуття та зон болю не пройдеш. Введений кінець
   * чекає у `pendingRetroEnd` і підставляється в `endWorkout`, коли людина
   * натисне «Завершити». Тобто ретро — це та сама сесія, просто з іншими
   * мітками часу, а не окремий беззмістовний режим.
   *
   * **Наслідок: слот «одне активне» тепер зайнято**, тому вхід іде через
   * `requestWorkoutStart` — той самий діалог конфлікту, що й у решти шляхів.
   * Це плата за повний потік: заповнюване ретро НЕ відрізнити від живої
   * сесії, тож удавати, що воно нічого не займає, було б неправдою, з якої
   * виросли б дві «активні» сесії одночасно.
   */
  const submitPastWorkout = useCallback(
    ({ startedAt, endedAt }: { startedAt: string; endedAt: string }) => {
      setLogPastOpen(false);
      requestWorkoutStart(() => {
        const workout = createWorkoutWithTimes({ startedAt });
        setPendingRetroEnd(workout.id, endedAt);
        setPendingRetroEndValue(endedAt);
        setActiveWorkoutId(workout.id);
        trackFizrukWorkoutStarted(workout.id, "past");
        if (onWorkoutStarted) onWorkoutStarted(workout.id);
        else setView("log");
      });
    },
    [createWorkoutWithTimes, onWorkoutStarted, requestWorkoutStart],
  );

  /**
   * 02-A "Повторити це тренування" — starts a fresh session pre-loaded
   * with the same exercises as `source` (sets reset, nothing carried
   * over except the exercise identity). Routed through
   * `requestWorkoutStart` so it respects the same "one active workout"
   * invariant/conflict dialog as every other start path.
   */
  const repeatWorkout = useCallback(
    (source: Workout) => {
      requestWorkoutStart(() => {
        const w = createWorkout();
        for (const item of source.items || []) {
          addItem(w.id, {
            exerciseId: item.exerciseId,
            nameUk: item.nameUk,
            primaryGroup: item.primaryGroup,
            musclesPrimary: item.musclesPrimary,
            musclesSecondary: item.musclesSecondary,
            type: item.type,
            ...(item.type === "strength"
              ? { sets: [{ weightKg: 0, reps: 0 }] }
              : {}),
            durationSec: 0,
            distanceM: 0,
          });
        }
        setActiveWorkoutId(w.id);
        trackFizrukWorkoutStarted(w.id, "repeat");
        if (onWorkoutStarted) onWorkoutStarted(w.id);
        else setView("log");
      });
    },
    [createWorkout, addItem, onWorkoutStarted, requestWorkoutStart],
  );

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
    locationFilter,
    setLocationFilter,
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
    activeWorkoutConflictOpen: pendingWorkoutStart !== null,
    finishActiveAndContinue: () => continuePendingWorkoutStart("finish"),
    discardActiveAndContinue: () => continuePendingWorkoutStart("discard"),
    cancelPendingWorkoutStart: () => setPendingWorkoutStart(null),
    form,
    setForm,
    activeWorkout,
    activeDuration,
    pendingRetroEnd,
    updatePendingRetroEnd,
    addExerciseToActive,
    handleExerciseInListClick,
    startWorkoutFromTemplate,
    repeatWorkout,
    lastByExerciseId,
    grouped,
    finishedCount,
    recentWorkouts,
    handlePullRefresh,
    journalQuery,
    handleQuickStart,
    logPastOpen,
    setLogPastOpen,
    submitPastWorkout,
    handleDeleteExerciseConfirm,
    handleRiskyTemplateConfirm,
    summarizeWorkoutForFinish,
    recoveryConflictsForExercise,
  };
}
