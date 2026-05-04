import { useCallback, useEffect, useMemo, useState } from "react";
import {
  safeReadStringLS,
  safeWriteLS,
  safeRemoveLS,
} from "@shared/lib/storage/storage";
import { requestCloudPull } from "@shared/lib/modules/cloudPullRequest";
import { PullToRefresh } from "@shared/components/ui/PullToRefresh";
import { Button } from "@shared/components/ui/Button";
import { ConfirmDialog } from "@shared/components/ui/ConfirmDialog";
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
import { useExerciseCatalog } from "../hooks/useExerciseCatalog";
import {
  useFizrukRestSound,
  type RestTimerState,
} from "../hooks/useFizrukRestSound";
import { useRecovery } from "../hooks/useRecovery";
import {
  useWorkoutTemplates,
  type WorkoutTemplate,
} from "../hooks/useWorkoutTemplates";
import { useWorkouts } from "../hooks/useWorkouts";
import { recoveryConflictsForExercise } from "@sergeant/fizruk-domain";
import type { RawExerciseDef } from "@sergeant/fizruk-domain/data";
import type {
  Workout,
  WorkoutFinishSummary,
  WorkoutGroup,
  WorkoutItem,
} from "@sergeant/fizruk-domain";
import {
  ACTIVE_WORKOUT_KEY,
  summarizeWorkoutForFinish,
} from "@sergeant/fizruk-domain";
import { WorkoutsHome } from "../components/workouts/WorkoutsHome";

type WorkoutsView = "home" | "catalog" | "log" | "templates";

/**
 * Mirrors `FinishFlashState` in `WorkoutJournalSection` / consumed by
 * `WorkoutFinishSheets`. Owned here so the `useState` setter can be
 * passed across both sheets without re-deriving the shape twice.
 */
interface FinishFlashState extends WorkoutFinishSummary {
  step: "wellbeing" | "summary";
  collapsed: boolean;
  workoutId: string;
  energy: number | null;
  mood: number | null;
  savedWellbeing?: { energy?: number | null; mood?: number | null } | null;
}

/**
 * The catalog `WorkoutItem` carries the workout `startedAt` when
 * resolved as the most recent occurrence of an exercise. We only attach
 * a single extra field, so widen the canonical domain item rather than
 * lying via `any`.
 */
type LastExerciseItem = WorkoutItem & { _startedAt?: string };

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
  const [retroDate, setRetroDate] = useState(() => {
    const x = new Date();
    return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, "0")}-${String(x.getDate()).padStart(2, "0")}`;
  });
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
  const activeWorkout = workouts.find((w) => w.id === activeWorkoutId) || null;

  const activeDuration = useMemo(() => {
    if (!activeWorkout?.startedAt) return null;
    const start = Date.parse(activeWorkout.startedAt);
    const end = activeWorkout.endedAt ? Date.parse(activeWorkout.endedAt) : now;
    if (!Number.isFinite(start) || !Number.isFinite(end) || end < start)
      return null;
    const sec = Math.floor((end - start) / 1000);
    const mm = String(Math.floor(sec / 60)).padStart(2, "0");
    const ss = String(sec % 60).padStart(2, "0");
    return `${mm}:${ss}`;
  }, [activeWorkout?.startedAt, activeWorkout?.endedAt, now]);

  useEffect(() => {
    if (!activeWorkoutId) safeRemoveLS(ACTIVE_WORKOUT_KEY);
    else safeWriteLS(ACTIVE_WORKOUT_KEY, activeWorkoutId);
  }, [activeWorkoutId]);

  // Clear a stale activeWorkoutId that no longer matches any workout
  // (e.g. the workout was deleted on another device before sync).
  useEffect(() => {
    if (!workoutsLoaded || !activeWorkoutId) return;
    if (!workouts.some((w) => w.id === activeWorkoutId)) {
      setActiveWorkoutId(null);
    }
  }, [workoutsLoaded, activeWorkoutId, workouts]);

  useEffect(() => {
    try {
      const m = sessionStorage.getItem("fizruk_workouts_mode");
      if (m === "templates") {
        setView("templates");
        sessionStorage.removeItem("fizruk_workouts_mode");
      } else if (m === "log") {
        setView("log");
        sessionStorage.removeItem("fizruk_workouts_mode");
      }
    } catch {}
  }, []);

  const { markCompletedNaturally } = useFizrukRestSound(restTimer);

  useEffect(() => {
    if (!restTimer || restTimer.remaining <= 0) return;
    const id = setInterval(() => {
      setRestTimer((r) => {
        if (!r || r.remaining <= 1) {
          markCompletedNaturally();
          return null;
        }
        return { ...r, remaining: r.remaining - 1 };
      });
    }, 1000);
    return () => clearInterval(id);
  }, [restTimer, markCompletedNaturally]);

  // Live timer tick — only when there is an active, unfinished workout
  useEffect(
    () => {
      if (!activeWorkout || activeWorkout.endedAt) return;
      const id = setInterval(() => setNow(Date.now()), 1000);
      return () => clearInterval(id);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps -- достатньо id/endedAt; повний об’єкт workout змінюється часто
    [activeWorkout?.id, activeWorkout?.endedAt],
  );

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
    const startedAt = new Date(y, mo - 1, d, hh, mm, 0, 0).toISOString();
    const w = createWorkoutWithTimes({ startedAt });
    setActiveWorkoutId(w.id);
    setRetroOpen(false);
  }, [retroDate, retroTime, createWorkoutWithTimes]);

  const lastByExerciseId = useMemo(() => {
    const out: Record<string, LastExerciseItem> = {};
    for (const w of workouts || []) {
      if (w.id === activeWorkoutId) continue;
      for (const it of w.items || []) {
        const exId = it.exerciseId;
        if (!exId) continue;
        const existing = out[exId];
        if (
          !existing ||
          (w.startedAt || "").localeCompare(existing._startedAt || "") > 0
        ) {
          out[exId] = { ...it, _startedAt: w.startedAt };
        }
      }
    }
    return out;
  }, [workouts, activeWorkoutId]);

  const grouped = useMemo(() => {
    const eqSet = equipmentFilter.length > 0 ? new Set(equipmentFilter) : null;
    const pool = eqSet
      ? list.filter((ex) => (ex.equipment ?? []).some((e) => eqSet.has(e)))
      : list;
    const m = new Map<string, RawExerciseDef[]>();
    for (const ex of pool) {
      const gid = ex.primaryGroup || "full_body";
      const bucket = m.get(gid);
      if (bucket) bucket.push(ex);
      else m.set(gid, [ex]);
    }
    const order = [
      "chest",
      "back",
      "shoulders",
      "biceps",
      "triceps",
      "forearms",
      "core",
      "quadriceps",
      "hamstrings",
      "calves",
      "glutes",
      "full_body",
      "cardio",
    ];
    const entries = Array.from(m.entries()).sort((a, b) => {
      const ai = order.indexOf(a[0]);
      const bi = order.indexOf(b[0]);
      return (
        (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi) ||
        a[0].localeCompare(b[0])
      );
    });
    return entries.map(([gid, items]) => ({
      id: gid,
      label: primaryGroupsUk[gid] || gid,
      items: items.slice(0, 80),
      total: items.length,
    }));
  }, [list, equipmentFilter, primaryGroupsUk]);

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
      aria-label="Завантажуємо тренування"
    >
      <Skeleton className="h-28 w-full" />
      <Skeleton className="h-20 w-full" />
      <Skeleton className="h-20 w-full" />
    </div>
  );

  return (
    <PullToRefresh onRefresh={handlePullRefresh} variant="fizruk">
      <div className="max-w-4xl mx-auto px-4 pt-4 page-tabbar-pad">
        <div className="flex items-center gap-3 mb-3">
          {view !== "home" ? (
            <button
              type="button"
              className="w-9 h-9 -ml-1 rounded-xl flex items-center justify-center text-text/80 hover:bg-surface-2"
              onClick={() => setView("home")}
              aria-label="Повернутись до тренувань"
            >
              ‹
            </button>
          ) : null}
          <div className="flex-1">
            <h1 className="text-style-title text-text">
              {view === "catalog"
                ? "Каталог вправ"
                : view === "templates"
                  ? "Шаблони"
                  : view === "log"
                    ? activeWorkout && !activeWorkout.endedAt
                      ? "Активне тренування"
                      : "Журнал"
                    : "Тренування"}
            </h1>
            {view === "home" ? (
              <p className="text-xs text-subtle mt-0.5">
                {activeWorkout && !activeWorkout.endedAt
                  ? `Активне · ${(activeWorkout.items || []).length} вправ`
                  : finishedCount > 0
                    ? `Завершено: ${finishedCount}`
                    : "Перше тренування — попереду"}
              </p>
            ) : null}
          </div>
          {view === "catalog" ? (
            <Button
              size="sm"
              className="h-9 min-h-[44px] px-4"
              onClick={() => setAddOpen(true)}
              aria-label="Додати вправу в каталог"
            >
              + Додати
            </Button>
          ) : null}
        </div>

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

      {/*
        Confirmation dialogs.

        The "Delete active workout" `ConfirmDialog` was removed in favour
        of the unified soft-delete flow (`onDeleteWorkout` in
        `WorkoutJournalSection`) that calls `deleteWorkout` immediately
        and surfaces a 5 s undo toast via `showUndoToast`. Per the
        unified-undo policy, only non-reversible flows (e.g. exercise
        removal that detaches the catalog entry) keep an explicit
        confirmation step.
      */}
      <ConfirmDialog
        open={deleteExerciseConfirm}
        title="Видалити вправу?"
        description="Вправу буде видалено з каталогу. Записи в тренуваннях залишаться."
        confirmLabel="Видалити"
        onConfirm={() => {
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
        onCancel={() => setDeleteExerciseConfirm(false)}
      />

      <ConfirmDialog
        open={!!riskyTemplateConfirm}
        title="М'язи ще відновлюються"
        description="У шаблоні є вправи на групи м'язів, які ще не відновились. Почати тренування все одно?"
        confirmLabel="Так, почати"
        cancelLabel="Скасувати"
        danger={false}
        onConfirm={() => {
          const tpl = riskyTemplateConfirm;
          setRiskyTemplateConfirm(null);
          if (!tpl) return;
          executeTemplateStart(tpl);
        }}
        onCancel={() => setRiskyTemplateConfirm(null)}
      />
    </PullToRefresh>
  );
}
