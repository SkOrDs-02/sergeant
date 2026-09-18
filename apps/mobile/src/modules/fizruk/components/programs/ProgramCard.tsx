/**
 * `ProgramCard` — single catalogue row on the Fizruk Programs screen.
 *
 * A small presentational component extracted from
 * `pages/Programs.tsx` so both the visual card and the button-state
 * logic can be exercised in isolation by jest snapshots and
 * interaction tests. Keeps no state of its own — the active-program
 * id is lifted up to `usePrograms`.
 *
 * Layout mirrors the web `ProgramCard` (see
 * `apps/web/src/modules/fizruk/pages/Programs.tsx` lines 54-150) with
 * the RN-native differences noted in `ui/Button.tsx` (no hover,
 * Pressable press-feedback instead of hover-scale).
 */

import type { TrainingProgramDef } from "@sergeant/fizruk-domain/domain";
import { formatProgramCadence } from "@sergeant/fizruk-domain/domain";
import { Text, View } from "react-native";

import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";

/** `0 = Mon … 6 = Sun`, matching the domain weekday index. */
const DAY_LABELS: readonly string[] = [
  "Пн",
  "Вт",
  "Ср",
  "Чт",
  "Пт",
  "Сб",
  "Нд",
];

export interface ProgramCardProps {
  program: TrainingProgramDef;
  /** `true` when this program is the currently-active one. */
  active: boolean;
  /** 0-indexed Monday-first weekday to highlight in the mini-calendar. */
  todayIndex: number;
  onActivate: (id: string) => void;
  onDeactivate: () => void;
  testID?: string;
}

export function ProgramCard({
  program,
  active,
  todayIndex,
  onActivate,
  onDeactivate,
  testID,
}: ProgramCardProps) {
  return (
    <Card
      variant={active ? "fizruk-soft" : "default"}
      radius="lg"
      padding="lg"
      testID={testID}
    >
      <View className="gap-3">
        <View className="gap-1.5">
          <View className="flex-row items-center gap-2 flex-wrap">
            <Text className="text-base font-bold text-fg flex-1">
              {program.name}
            </Text>
            {active ? (
              <View
                className="px-2 py-0.5 rounded-full bg-teal-100 border border-teal-300"
                testID={testID ? `${testID}-active-badge` : undefined}
              >
                <Text className="text-[10px] font-bold text-teal-800">
                  Активна
                </Text>
              </View>
            ) : null}
          </View>
          <Text className="text-xs text-fg-muted">
            {formatProgramCadence(program)}
          </Text>
          <Text className="text-sm text-fg leading-snug">
            {program.description}
          </Text>
        </View>

        <View className="flex-row items-center gap-1.5">
          {DAY_LABELS.map((label, i) => {
            const hasSession = program.schedule.some((s) => s.day - 1 === i);
            const isToday = i === todayIndex;
            const bg = hasSession
              ? isToday && active
                ? "bg-teal-600"
                : "bg-teal-100"
              : "bg-cream-200/60";
            const text = hasSession
              ? isToday && active
                ? "text-white"
                : "text-teal-800"
              : "text-fg-subtle";
            return (
              <View
                key={`${program.id}-d${i}`}
                className={`flex-1 items-center justify-center py-1 rounded ${bg}`}
              >
                <Text className={`text-[10px] font-bold ${text}`}>{label}</Text>
              </View>
            );
          })}
        </View>

        <View className="flex-row gap-2">
          {active ? (
            <Button
              variant="secondary"
              size="md"
              onPress={onDeactivate}
              className="flex-1"
              testID={testID ? `${testID}-deactivate` : undefined}
            >
              Деактивувати
            </Button>
          ) : (
            <Button
              variant="fizruk"
              size="md"
              onPress={() => onActivate(program.id)}
              className="flex-1"
              testID={testID ? `${testID}-activate` : undefined}
            >
              Активувати
            </Button>
          )}
        </View>
      </View>
    </Card>
  );
}
