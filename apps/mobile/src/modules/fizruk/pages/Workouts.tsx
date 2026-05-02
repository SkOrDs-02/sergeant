/**
 * Fizruk / Workouts page — home + subview layout.
 *
 * Replaces the older 3-tab layout (Каталог / Журнал / Шаблони + scattered
 * top-right nav) with a single home screen fronted by the active-workout
 * panel. Recent sessions surface inline and the catalog opens as a
 * dedicated subview (back chevron → home), which gives the page one clear
 * primary action ("Почати тренування") instead of five competing ones.
 *
 * Internal state machine:
 *   `view = 'home'    ` — active/start hero + recent 3 journal rows +
 *                         quick-link tile to the catalog.
 *   `view = 'catalog' ` — full-screen exercise catalog (search +
 *                         grouped list + detail tap).
 *   `view = 'journal' ` — full journal list grouped by day.
 *
 * All CRUD (start/finish workout, add exercise to active workout, log
 * sets) still flows through `useActiveFizrukWorkout` / `useFizrukWorkouts`
 * just like before. Only the chrome changed.
 */

import {
  computeWorkoutSummary,
  exerciseDisplayName,
  type WorkoutExerciseCatalogEntry,
  type WorkoutSet,
} from "@sergeant/fizruk-domain/domain";
import { EXERCISES, PRIMARY_GROUPS_UK } from "@sergeant/fizruk-domain/data";
import { useCallback, useMemo, useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { router } from "expo-router";

import { hapticSuccess, hapticTap, hapticWarning } from "@sergeant/shared";

import { BackButton } from "@/components/ui/BackButton";
import { Card } from "@/components/ui/Card";

import { RestTimerOverlay } from "../components/RestTimerOverlay";
import {
  ActiveSetEditor,
  ExerciseCatalogSection,
  WorkoutActivePanel,
  WorkoutJournalSection,
} from "../components/workouts";
import {
  useActiveFizrukWorkout,
  useElapsedSeconds,
} from "../hooks/useActiveFizrukWorkout";
import { useCustomExercises } from "../hooks/useCustomExercises";
import {
  useFizrukWorkouts,
  type FizrukWorkout,
  type FizrukWorkoutItem,
} from "../hooks/useFizrukWorkouts";

type WorkoutsView = "home" | "catalog" | "journal";

interface SetEditorState {
  workoutId: string;
  itemId: string;
  setIndex: number | null;
  exerciseName: string;
  initial: WorkoutSet | null;
}

export interface WorkoutsProps {
  /** Optional root testID — sub-ids derive from it. */
  testID?: string;
}

export function Workouts({ testID = "fizruk-workouts" }: WorkoutsProps) {
  const { workouts, createWorkout, endWorkout, addItem, updateItem } =
    useFizrukWorkouts();
  const { exercises: customExercises } = useCustomExercises();

  const {
    activeWorkoutId,
    setActiveWorkoutId,
    clearActiveWorkout,
    restTimer,
    startRestTimer,
    cancelRestTimer,
  } = useActiveFizrukWorkout();

  const [view, setView] = useState<WorkoutsView>("home");
  const [setEditor, setSetEditor] = useState<SetEditorState | null>(null);

  const catalog = useMemo<WorkoutExerciseCatalogEntry[]>(() => {
    const custom: WorkoutExerciseCatalogEntry[] = customExercises.map((ex) => ({
      id: ex.id,
      name: { uk: ex.nameUk },
      primaryGroup: ex.primaryGroup,
      muscles: {
        primary: ex.musclesPrimary,
        secondary: ex.musclesSecondary,
      },
    }));
    const seen = new Set<string>();
    const out: WorkoutExerciseCatalogEntry[] = [];
    for (const ex of custom) {
      if (!ex.id || seen.has(ex.id)) continue;
      seen.add(ex.id);
      out.push(ex);
    }
    for (const ex of EXERCISES) {
      if (!ex.id || seen.has(ex.id)) continue;
      seen.add(ex.id);
      out.push(ex as WorkoutExerciseCatalogEntry);
    }
    return out;
  }, [customExercises]);

  const activeWorkout = useMemo<FizrukWorkout | null>(
    () => workouts.find((w) => w.id === activeWorkoutId) ?? null,
    [workouts, activeWorkoutId],
  );

  const elapsedSec = useElapsedSeconds(
    activeWorkout?.endedAt ? null : (activeWorkout?.startedAt ?? null),
  );

  const finishedCount = useMemo(
    () => workouts.filter((w) => w.endedAt).length,
    [workouts],
  );

  const handleStart = useCallback(() => {
    hapticSuccess();
    const created = createWorkout();
    setActiveWorkoutId(created.id);
    // Jump straight into the catalog so the next tap can add an
    // exercise — matches the mental model of "I pressed Start, now
    // what do I do first".
    setView("catalog");
  }, [createWorkout, setActiveWorkoutId]);

  const handleFinish = useCallback(() => {
    if (!activeWorkoutId) return;
    hapticSuccess();
    endWorkout(activeWorkoutId);
    clearActiveWorkout();
    cancelRestTimer();
    setView("home");
  }, [activeWorkoutId, cancelRestTimer, clearActiveWorkout, endWorkout]);

  const handleStartRest = useCallback(
    (sec: number) => {
      hapticTap();
      startRestTimer(sec);
    },
    [startRestTimer],
  );

  const handlePickExercise = useCallback(
    (ex: WorkoutExerciseCatalogEntry) => {
      if (!activeWorkoutId) {
        hapticWarning();
        const created = createWorkout();
        setActiveWorkoutId(created.id);
        const isCardio = ex.primaryGroup === "cardio";
        const itemPatch: Partial<FizrukWorkoutItem> = {
          exerciseId: ex.id,
          nameUk: exerciseDisplayName(ex),
          primaryGroup: ex.primaryGroup,
          musclesPrimary: ex.muscles?.primary ?? [],
          musclesSecondary: ex.muscles?.secondary ?? [],
          type: isCardio ? "distance" : "strength",
          sets: isCardio ? undefined : [],
        };
        addItem(created.id, itemPatch);
        return;
      }
      hapticTap();
      const isCardio = ex.primaryGroup === "cardio";
      addItem(activeWorkoutId, {
        exerciseId: ex.id,
        nameUk: exerciseDisplayName(ex),
        primaryGroup: ex.primaryGroup,
        musclesPrimary: ex.muscles?.primary ?? [],
        musclesSecondary: ex.muscles?.secondary ?? [],
        type: isCardio ? "distance" : "strength",
        sets: isCardio ? undefined : [],
      });
    },
    [activeWorkoutId, addItem, createWorkout, setActiveWorkoutId],
  );

  const handleInspectExercise = useCallback(
    (ex: WorkoutExerciseCatalogEntry) => {
      hapticTap();
      router.push({
        pathname: "/fizruk/exercise",
        params: { id: ex.id },
      });
    },
    [],
  );

  const openNewSetEditor = useCallback(
    (item: FizrukWorkoutItem) => {
      if (!activeWorkoutId) return;
      setSetEditor({
        workoutId: activeWorkoutId,
        itemId: item.id,
        setIndex: null,
        exerciseName: item.nameUk || "Вправа",
        initial: null,
      });
    },
    [activeWorkoutId],
  );

  const openEditSetEditor = useCallback(
    (item: FizrukWorkoutItem, setIndex: number) => {
      if (!activeWorkoutId) return;
      const seed = item.sets?.[setIndex] ?? null;
      setSetEditor({
        workoutId: activeWorkoutId,
        itemId: item.id,
        setIndex,
        exerciseName: item.nameUk || "Вправа",
        initial: seed,
      });
    },
    [activeWorkoutId],
  );

  const handleSetSubmit = useCallback(
    (set: WorkoutSet) => {
      if (!setEditor) return;
      const workout = workouts.find((w) => w.id === setEditor.workoutId);
      if (!workout) return;
      const item = workout.items.find((it) => it.id === setEditor.itemId);
      if (!item) return;
      const existing: WorkoutSet[] = Array.isArray(item.sets)
        ? (item.sets.slice() as WorkoutSet[])
        : [];
      if (setEditor.setIndex === null) {
        existing.push(set);
      } else {
        existing[setEditor.setIndex] = set;
      }
      updateItem(setEditor.workoutId, setEditor.itemId, { sets: existing });
      setSetEditor(null);
    },
    [setEditor, updateItem, workouts],
  );

  const closeSetEditor = useCallback(() => setSetEditor(null), []);

  const activeItems = activeWorkout?.items ?? [];

  const recentWorkouts = useMemo(
    () =>
      [...workouts]
        .sort(
          (a, b) =>
            new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime(),
        )
        .slice(0, 3),
    [workouts],
  );

  const subtitle = activeWorkout
    ? `Активне · ${activeItems.length} вправ`
    : finishedCount > 0
      ? `Завершено: ${finishedCount}`
      : "Перше тренування — попереду";

  return (
    <SafeAreaView
      className="flex-1 bg-cream-50"
      edges={["top"]}
      testID={testID}
    >
      <View className="flex-row items-center gap-3 px-4 pt-4 pb-1">
        {view !== "home" ? (
          <BackButton
            variant="ghost"
            size="sm"
            onPress={() => setView("home")}
            autoNavigate={false}
            testID={`${testID}-back`}
          />
        ) : (
          <Text className="text-[22px]">🏋️</Text>
        )}
        <View className="flex-1">
          <Text className="text-[22px] font-bold text-fg">
            {view === "catalog"
              ? "Каталог вправ"
              : view === "journal"
                ? "Журнал"
                : "Тренування"}
          </Text>
          {view === "home" ? (
            <Text className="text-xs text-fg-muted mt-0.5">{subtitle}</Text>
          ) : null}
        </View>
      </View>

      <ScrollView
        className="flex-1"
        contentContainerStyle={{ padding: 16, paddingBottom: 140, gap: 16 }}
        testID={`${testID}-scroll`}
      >
        {/* Active-workout strip stays visible across all subviews so the
            elapsed timer + "Завершити" button are always reachable
            while browsing the catalog or journal. */}
        <WorkoutActivePanel
          activeWorkoutId={activeWorkoutId}
          elapsedSec={elapsedSec}
          onStart={handleStart}
          onFinish={handleFinish}
          onStartRest={handleStartRest}
          testID={`${testID}-active`}
        />

        {view === "home" ? (
          <>
            {activeWorkout && activeItems.length > 0 ? (
              <View className="gap-3" testID={`${testID}-items`}>
                <Text className="text-sm font-semibold text-fg px-1">
                  Вправи тренування
                </Text>
                <View className="gap-3">
                  {activeItems.map((item) => (
                    <ActiveItemCard
                      key={item.id}
                      item={item}
                      onAddSet={() => openNewSetEditor(item)}
                      onEditSet={(setIndex) =>
                        openEditSetEditor(item, setIndex)
                      }
                      testID={`${testID}-item-${item.id}`}
                    />
                  ))}
                </View>
              </View>
            ) : null}

            <View className="gap-3" testID={`${testID}-quicklinks`}>
              <Text className="text-sm font-semibold text-fg px-1">
                Довідники
              </Text>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Каталог вправ"
                onPress={() => {
                  hapticTap();
                  setView("catalog");
                }}
                testID={`${testID}-open-catalog`}
              >
                {({ pressed }) => (
                  <Card
                    variant="default"
                    radius="lg"
                    padding="md"
                    className={pressed ? "opacity-80" : ""}
                  >
                    <View className="flex-row items-center gap-3">
                      <Text className="text-2xl">📚</Text>
                      <View className="flex-1">
                        <Text className="text-sm font-semibold text-fg">
                          Каталог вправ
                        </Text>
                        <Text className="text-[11px] text-fg-muted mt-0.5">
                          Пошук · групи м&apos;язів · своя вправа
                        </Text>
                      </View>
                      <Text className="text-fg-subtle text-lg">›</Text>
                    </View>
                  </Card>
                )}
              </Pressable>
            </View>

            <View className="gap-3" testID={`${testID}-recent`}>
              <View className="flex-row items-center justify-between px-1">
                <Text className="text-sm font-semibold text-fg">
                  О��танні тренування
                </Text>
                {workouts.length > 0 ? (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Всі тренування"
                    onPress={() => {
                      hapticTap();
                      setView("journal");
                    }}
                    testID={`${testID}-open-journal`}
                    hitSlop={8}
                  >
                    <Text className="text-xs font-semibold text-teal-700">
                      Всі →
                    </Text>
                  </Pressable>
                ) : null}
              </View>
              {recentWorkouts.length > 0 ? (
                <View className="gap-2">
                  {recentWorkouts.map((w) => (
                    <RecentWorkoutRow
                      key={w.id}
                      workout={w}
                      isActive={w.id === activeWorkoutId}
                      testID={`${testID}-recent-${w.id}`}
                    />
                  ))}
                </View>
              ) : (
                <Card variant="flat" radius="lg" padding="lg">
                  <Text className="text-sm text-fg-muted">
                    Після першого завершеного тренування тут з&apos;являться
                    останні сесії.
                  </Text>
                </Card>
              )}
            </View>
          </>
        ) : null}

        {view === "catalog" ? (
          <ExerciseCatalogSection
            onInspectExercise={handleInspectExercise}
            exercises={catalog}
            primaryGroupsUk={PRIMARY_GROUPS_UK}
            onPickExercise={handlePickExercise}
            testID={`${testID}-catalog`}
          />
        ) : null}

        {view === "journal" ? (
          <WorkoutJournalSection
            workouts={workouts}
            activeWorkoutId={activeWorkoutId}
            testID={`${testID}-journal`}
          />
        ) : null}
      </ScrollView>

      {restTimer ? (
        <RestTimerOverlay restTimer={restTimer} onCancel={cancelRestTimer} />
      ) : null}

      <ActiveSetEditor
        open={!!setEditor}
        onClose={closeSetEditor}
        exerciseName={setEditor?.exerciseName ?? ""}
        setIndex={
          setEditor?.setIndex === null || setEditor === null
            ? undefined
            : setEditor.setIndex + 1
        }
        initialSet={setEditor?.initial ?? null}
        onSubmit={handleSetSubmit}
        testID={`${testID}-set-editor`}
      />
    </SafeAreaView>
  );
}

interface ActiveItemCardProps {
  item: FizrukWorkoutItem;
  onAddSet(): void;
  onEditSet(setIndex: number): void;
  testID?: string;
}

function ActiveItemCard({
  item,
  onAddSet,
  onEditSet,
  testID,
}: ActiveItemCardProps) {
  const sets = item.sets ?? [];
  return (
    <Card variant="default" radius="lg" padding="md" testID={testID}>
      <Text className="text-sm font-semibold text-fg">
        {item.nameUk || "Вправа"}
      </Text>
      {sets.length > 0 ? (
        <View className="mt-2 gap-1">
          {sets.map((set, idx) => (
            <Pressable
              key={idx}
              accessibilityRole="button"
              accessibilityLabel={`Сет ${idx + 1}: ${set.weightKg} кг × ${set.reps}`}
              onPress={() => onEditSet(idx)}
              testID={`${testID}-set-${idx}`}
              className="flex-row items-center justify-between py-1.5 px-2 rounded-lg bg-cream-100"
            >
              <Text className="text-xs text-fg-muted">Сет {idx + 1}</Text>
              <Text className="text-sm font-semibold text-fg">
                {set.weightKg} кг × {set.reps}
              </Text>
            </Pressable>
          ))}
        </View>
      ) : null}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Додати сет"
        onPress={onAddSet}
        testID={`${testID}-add-set`}
        className="mt-3 h-10 rounded-xl bg-teal-600 items-center justify-center"
      >
        <Text className="text-sm font-semibold text-white">+ Додати сет</Text>
      </Pressable>
    </Card>
  );
}

interface RecentWorkoutRowProps {
  workout: FizrukWorkout;
  isActive: boolean;
  testID?: string;
}

function RecentWorkoutRow({
  workout,
  isActive,
  testID,
}: RecentWorkoutRowProps) {
  const summary = useMemo(
    () => computeWorkoutSummary(workout as never),
    [workout],
  );
  const started = new Date(workout.startedAt);
  const dateLabel = started.toLocaleDateString("uk-UA", {
    day: "numeric",
    month: "short",
  });
  const parts: string[] = [];
  if (summary.itemCount > 0) parts.push(`${summary.itemCount} вправ`);
  if (summary.setCount > 0) parts.push(`${summary.setCount} сетів`);
  const durMin = summary.durationSec
    ? Math.max(1, Math.round(summary.durationSec / 60))
    : null;
  if (durMin !== null) parts.push(`${durMin} хв`);
  const subtitle = parts.length ? parts.join(" · ") : "порожнє тренування";

  return (
    <View
      className="px-3 py-3 rounded-xl border border-cream-300 bg-cream-50 flex-row items-center justify-between"
      testID={testID}
    >
      <View className="flex-1 pr-2">
        <View className="flex-row items-center gap-2">
          <Text className="text-sm font-semibold text-fg">{dateLabel}</Text>
          {isActive ? (
            <Text className="text-[10px] uppercase font-bold text-teal-700 bg-teal-100 px-2 py-0.5 rounded-full">
              Активне
            </Text>
          ) : !summary.isFinished ? (
            <Text className="text-[10px] uppercase font-bold text-amber-700 bg-amber-100 px-2 py-0.5 rounded-full">
              Чернетка
            </Text>
          ) : null}
        </View>
        <Text className="text-xs text-fg-muted mt-0.5" numberOfLines={1}>
          {subtitle}
        </Text>
      </View>
    </View>
  );
}
