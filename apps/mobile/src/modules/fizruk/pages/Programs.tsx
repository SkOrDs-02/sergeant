/**
 * Fizruk / Programs page — mobile (Phase 6 · PR-F).
 *
 * Web counterpart: `apps/web/src/modules/fizruk/pages/Programs.tsx`
 * (231 LOC). Full port of the training-program catalogue:
 *
 *  - Top "Сьогоднішня сесія" hero card — shows the scheduled session
 *    for the active program on today's weekday, a rest-day fallback,
 *    or an empty state nudging activation.
 *  - Scrollable catalogue of `ProgramCard`s, one per built-in program.
 *    Each card shows name, cadence (days/week · duration), description,
 *    a mini weekday strip, and an Активувати / Деактивувати control.
 *  - When the user taps "Почати" on the hero card we mint a new
 *    active-workout id via `useActiveFizrukWorkout` so the shared
 *    timer + `RestTimerOverlay` picks it up — same path the web page
 *    takes via `handleStartProgramWorkout` (minus the workout-CRUD
 *    layer, which still lives in the web inline state and lands with
 *    a later PR).
 *
 * Pure logic — catalogue, today-session resolution, cadence
 * formatters — lives in `@sergeant/fizruk-domain/domain/programs`
 * and is covered by vitest in isolation.
 */

import type { TodayProgramSession } from "@sergeant/fizruk-domain/domain";
import { weekdayIndex } from "@sergeant/fizruk-domain/domain";
import { useCallback, useMemo } from "react";
import { ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { ProgramCard, TodaySessionCard } from "../components/programs";
import { useActiveFizrukWorkout } from "../hooks/useActiveFizrukWorkout";
import { usePrograms } from "../hooks/usePrograms";

export interface ProgramsProps {
  /** Optional root testID — sub-ids derive from it. */
  testID?: string;
}

export function Programs({ testID = "fizruk-programs" }: ProgramsProps) {
  const {
    programs,
    activeProgramId,
    activeProgram,
    todaySession,
    activateProgram,
    deactivateProgram,
  } = usePrograms();

  const { setActiveWorkoutId } = useActiveFizrukWorkout();

  const todayIndex = useMemo(() => weekdayIndex(), []);

  const handleStart = useCallback(
    (session: TodayProgramSession) => {
      // Mint a stable id per start so the shared timer / overlay can
      // pick it up. Workout-CRUD (sets / items / groups) still lives
      // in the legacy web inline state and lands in a follow-up PR.
      setActiveWorkoutId(
        `program-${session.programId}-${session.schedule.sessionKey}-${Date.now()}`,
      );
    },
    [setActiveWorkoutId],
  );

  return (
    <SafeAreaView
      className="flex-1 bg-cream-50"
      edges={["top"]}
      testID={testID}
    >
      <View className="flex-row items-center gap-2 px-4 pt-4 pb-1">
        <Text className="text-[22px]">🗓️</Text>
        <Text className="text-[22px] font-bold text-fg flex-1">Програми</Text>
      </View>
      <Text className="px-4 text-sm text-fg-muted leading-snug mb-3">
        Готові програми тренувань. Активуй одну, сьогоднішня сесія зʼявиться
        вгорі з кнопкою «Почати».
      </Text>

      <ScrollView
        className="flex-1"
        contentContainerStyle={{ padding: 16, paddingBottom: 120, gap: 14 }}
      >
        <TodaySessionCard
          activeProgram={activeProgram}
          todaySession={todaySession}
          onStart={handleStart}
          testID={`${testID}-today`}
        />

        {programs.length === 0 ? (
          <View
            className="items-center justify-center py-10"
            testID={`${testID}-empty`}
          >
            <Text className="text-sm text-fg-muted">
              Каталог порожній, спробуй пізніше.
            </Text>
          </View>
        ) : (
          <View className="gap-3" testID={`${testID}-list`}>
            <Text className="text-sm font-semibold text-fg">
              Каталог програм
            </Text>
            {programs.map((program) => (
              <ProgramCard
                key={program.id}
                program={program}
                active={program.id === activeProgramId}
                todayIndex={todayIndex}
                onActivate={activateProgram}
                onDeactivate={deactivateProgram}
                testID={`${testID}-card-${program.id}`}
              />
            ))}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

export default Programs;
