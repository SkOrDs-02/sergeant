/**
 * Fizruk / Exercise-detail page — mobile port (Phase 6 / PR-F-follow-up).
 *
 * Web counterpart: `apps/web/src/modules/fizruk/pages/Exercise.tsx` (637 LOC).
 *
 * Renders the full detail view for a single exercise:
 *   1. Header — title + uk-UA primary-muscle chips.
 *   2. New-PR banner (conditional).
 *   3. Summary cards — personal record + "next time" suggestion (driven by
 *      the hoisted pure helpers in `@sergeant/fizruk-domain`).
 *   4. Two weekly trend charts (1RM + volume) via `victory-native`.
 *   5. Optional cardio trend charts for distance sessions.
 *   6. Load calculator (Сила / Гіпертрофія / Витривалість) when a 1RM
 *      estimate exists.
 *   7. History list — newest-first, capped at 20 rows like web.
 *   8. Sticky CTAs — add to the active workout (or start one first).
 *
 * All aggregation is delegated to
 * `@sergeant/fizruk-domain/domain/workouts/exerciseDetail` so both
 * platforms share the same contract.
 */
import {
  buildLoadCalculatorZones,
  collectExerciseHistory,
  computeExerciseBest,
  computeExerciseCardioTrend,
  computeExerciseWeeklyTrend,
  exerciseDisplayName,
  suggestExerciseNextSet,
  type WorkoutExerciseCatalogEntry,
} from "@sergeant/fizruk-domain/domain";
import { EXERCISES, MUSCLES_UK } from "@sergeant/fizruk-domain/data";
import { router } from "expo-router";
import { useCallback, useMemo } from "react";
import { ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { hapticSuccess, hapticTap } from "@sergeant/shared";

import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";

import {
  ExerciseHeader,
  ExerciseHistoryList,
  ExerciseLoadCalculator,
  ExerciseNewPRBanner,
  ExerciseSummaryCards,
  ExerciseTrendChart,
} from "../components/exercise";
import { useActiveFizrukWorkout } from "../hooks/useActiveFizrukWorkout";
import { useCustomExercises } from "../hooks/useCustomExercises";
import {
  useFizrukWorkouts,
  type FizrukWorkout,
} from "../hooks/useFizrukWorkouts";
import { toDomainWorkouts } from "../lib/toDomain";
import { fizrukRouteFor } from "../shell/fizrukRoute";

export interface ExerciseProps {
  /** Exercise id from the route. When absent, renders an error card. */
  exerciseId?: string;
  /** Optional root testID — sub-ids derive from it. */
  testID?: string;
}

type CatalogExercise = WorkoutExerciseCatalogEntry & {
  muscles?: {
    primary?: readonly string[];
    secondary?: readonly string[];
  };
  description?: { uk?: string; en?: string } | string | null;
};

function resolveCatalogExercise(
  exerciseId: string | undefined,
  customExercises: ReadonlyArray<{
    id: string;
    nameUk: string;
    primaryGroup?: string;
    musclesPrimary?: string[];
    musclesSecondary?: string[];
  }>,
): CatalogExercise | null {
  if (!exerciseId) return null;
  const custom = customExercises.find((ex) => ex?.id === exerciseId);
  if (custom) {
    return {
      id: custom.id,
      name: { uk: custom.nameUk },
      primaryGroup: custom.primaryGroup,
      muscles: {
        primary: custom.musclesPrimary ?? [],
        secondary: custom.musclesSecondary ?? [],
      },
    };
  }
  const builtin = (EXERCISES as readonly CatalogExercise[]).find(
    (ex) => ex?.id === exerciseId,
  );
  return builtin ?? null;
}

function resolveMuscleLabels(
  exercise: CatalogExercise | null,
  fallbackName: string | null,
): string[] {
  const ids = exercise?.muscles?.primary ?? [];
  const labels = ids
    .map((id) => MUSCLES_UK?.[id] ?? id)
    .filter((label): label is string => Boolean(label));
  if (labels.length > 0) return labels;
  // Fall back to the primary-group label when no granular muscles are set.
  return fallbackName ? [] : [];
}

export function Exercise({
  exerciseId,
  testID = "fizruk-exercise",
}: ExerciseProps) {
  const { workouts, createWorkout, addItem } = useFizrukWorkouts();
  const { exercises: customExercises } = useCustomExercises();
  const { activeWorkoutId, setActiveWorkoutId } = useActiveFizrukWorkout();

  const catalogEntry = useMemo(
    () => resolveCatalogExercise(exerciseId, customExercises),
    [exerciseId, customExercises],
  );

  const history = useMemo(
    () => collectExerciseHistory(toDomainWorkouts(workouts), exerciseId ?? ""),
    [workouts, exerciseId],
  );

  const best = useMemo(() => computeExerciseBest(history), [history]);
  const suggestedNext = useMemo(
    () => suggestExerciseNextSet(best.lastTop),
    [best.lastTop],
  );
  const strengthTrend = useMemo(
    () => computeExerciseWeeklyTrend(history),
    [history],
  );
  const cardioTrend = useMemo(
    () => computeExerciseCardioTrend(history),
    [history],
  );
  const loadZones = useMemo(
    () => buildLoadCalculatorZones(best.best1rm),
    [best.best1rm],
  );

  const title = useMemo(() => {
    if (catalogEntry) return exerciseDisplayName(catalogEntry);
    const fromHistory = history[0]?.item;
    if (fromHistory?.nameUk) return fromHistory.nameUk;
    return "Вправа";
  }, [catalogEntry, history]);

  const muscleLabels = useMemo(
    () => resolveMuscleLabels(catalogEntry, title),
    [catalogEntry, title],
  );

  const description = useMemo<string | null>(() => {
    const raw: unknown = catalogEntry?.description;
    if (!raw) return null;
    if (typeof raw === "string") return raw;
    if (typeof raw === "object") {
      const obj = raw as { uk?: string; en?: string };
      return obj.uk ?? obj.en ?? null;
    }
    return null;
  }, [catalogEntry]);

  const hasStrength = useMemo(
    () =>
      strengthTrend.rmPoints.length > 0 ||
      history.some((h) => h.item?.type === "strength"),
    [history, strengthTrend.rmPoints.length],
  );
  const hasCardio = cardioTrend.pacePoints.length > 0;

  const handleAddToWorkout = useCallback(() => {
    if (!exerciseId || !catalogEntry) return;
    let targetId = activeWorkoutId;
    if (!targetId) {
      const created = createWorkout();
      targetId = created.id;
      setActiveWorkoutId(targetId);
    }
    const inserted = addItem(targetId, {
      exerciseId,
      nameUk: typeof title === "string" ? title : undefined,
      primaryGroup: catalogEntry.primaryGroup,
      musclesPrimary: catalogEntry.muscles?.primary
        ? [...catalogEntry.muscles.primary]
        : undefined,
      musclesSecondary: catalogEntry.muscles?.secondary
        ? [...catalogEntry.muscles.secondary]
        : undefined,
      type: "strength",
      sets: [],
    });
    if (inserted) {
      hapticSuccess();
      router.push(fizrukRouteFor("workouts"));
    }
  }, [
    exerciseId,
    catalogEntry,
    activeWorkoutId,
    createWorkout,
    setActiveWorkoutId,
    addItem,
    title,
  ]);

  const handleOpenJournal = useCallback(() => {
    hapticTap();
    router.push(fizrukRouteFor("workouts"));
  }, []);

  if (!exerciseId) {
    return (
      <SafeAreaView
        edges={["top"]}
        className="flex-1 bg-cream-100"
        testID={`${testID}-invalid`}
      >
        <View className="px-4 pt-4">
          <Card variant="flat" radius="lg" padding="lg">
            <Text className="text-sm text-fg-muted">Невірний ID вправи</Text>
          </Card>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView
      edges={["top"]}
      className="flex-1 bg-cream-100"
      testID={testID}
    >
      <ScrollView
        contentContainerStyle={{
          paddingHorizontal: 16,
          paddingVertical: 16,
          gap: 12,
        }}
        keyboardShouldPersistTaps="handled"
      >
        <ExerciseHeader
          title={title}
          muscleLabels={muscleLabels}
          description={description}
          testID={`${testID}-header`}
        />

        {best.isNewPR ? (
          <ExerciseNewPRBanner testID={`${testID}-new-pr`} />
        ) : null}

        <ExerciseSummaryCards
          best={best}
          suggestedNext={suggestedNext}
          testID={`${testID}-summary`}
        />

        {hasStrength ? (
          <Card variant="default" radius="lg" padding="md">
            <Text className="text-[10px] uppercase font-bold text-fg-muted mb-2">
              Прогресія 1RM (за тижнями)
            </Text>
            <ExerciseTrendChart
              points={strengthTrend.rmPoints}
              strokeColor="rgb(22 163 74)"
              unit=" кг"
              label="1RM"
              testIDPrefix={`${testID}-trend-rm`}
            />
          </Card>
        ) : null}

        {hasStrength ? (
          <Card variant="default" radius="lg" padding="md">
            <Text className="text-[10px] uppercase font-bold text-fg-muted mb-2">
              Обʼєм тренування (кг × повтори)
            </Text>
            <ExerciseTrendChart
              points={strengthTrend.volPoints}
              strokeColor="rgb(99 102 241)"
              unit=" кг"
              label="Обсяг"
              testIDPrefix={`${testID}-trend-vol`}
            />
          </Card>
        ) : null}

        {hasCardio ? (
          <Card variant="default" radius="lg" padding="md">
            <Text className="text-[10px] uppercase font-bold text-fg-muted mb-2">
              Темп (хв/км)
            </Text>
            <ExerciseTrendChart
              points={cardioTrend.pacePoints.map((p, i) => ({
                value: p.value,
                dateLabel: p.dateLabel,
                weekKey: `pace-${i}`,
              }))}
              strokeColor="rgb(234 88 12)"
              unit=" хв/км"
              label="Темп"
              testIDPrefix={`${testID}-trend-pace`}
            />
            <Text className="text-[10px] text-fg-subtle mt-1">
              Менше — краще (швидший темп)
            </Text>
          </Card>
        ) : null}

        {hasCardio ? (
          <Card variant="default" radius="lg" padding="md">
            <Text className="text-[10px] uppercase font-bold text-fg-muted mb-2">
              Дистанція (км)
            </Text>
            <ExerciseTrendChart
              points={cardioTrend.distPoints.map((p, i) => ({
                value: p.value,
                dateLabel: p.dateLabel,
                weekKey: `dist-${i}`,
              }))}
              strokeColor="rgb(6 182 212)"
              unit=" км"
              label="Дистанція"
              testIDPrefix={`${testID}-trend-dist`}
            />
          </Card>
        ) : null}

        {loadZones.length > 0 ? (
          <ExerciseLoadCalculator zones={loadZones} testID={`${testID}-load`} />
        ) : null}

        <Card variant="default" radius="lg" padding="md">
          <Text className="text-[10px] uppercase font-bold text-fg-muted mb-2">
            Історія сетів
          </Text>
          <ExerciseHistoryList history={history} testID={`${testID}-history`} />
          <View className="mt-3 gap-2">
            <Button
              variant="fizruk"
              size="lg"
              onPress={handleAddToWorkout}
              accessibilityLabel={
                activeWorkoutId
                  ? "Додати вправу в активне тренування"
                  : "Почати тренування й додати вправу"
              }
              testID={`${testID}-add-to-workout`}
              disabled={!catalogEntry}
            >
              {activeWorkoutId
                ? "Додати в активне тренування"
                : "Почати тренування"}
            </Button>
            <Button
              variant="fizruk-soft"
              size="lg"
              onPress={handleOpenJournal}
              accessibilityLabel="Перейти до журналу тренувань"
              testID={`${testID}-open-journal`}
            >
              Перейти до журналу
            </Button>
          </View>
        </Card>
      </ScrollView>
    </SafeAreaView>
  );
}

export default Exercise;

export function _resolveCatalogExerciseForTest(
  exerciseId: string | undefined,
  customExercises: ReadonlyArray<{
    id: string;
    nameUk: string;
    primaryGroup?: string;
    musclesPrimary?: string[];
    musclesSecondary?: string[];
  }>,
): CatalogExercise | null {
  return resolveCatalogExercise(exerciseId, customExercises);
}

type FizrukWorkoutForTest = FizrukWorkout;
export type { FizrukWorkoutForTest };
