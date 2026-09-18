/**
 * `ExerciseCatalogSection` — searchable, grouped-by-primary-group
 * exercise library for the mobile Фізрук / Workouts page.
 *
 * Filtering / sorting / grouping all run through the pure helpers in
 * `@sergeant/fizruk-domain/domain/workouts` so the web and mobile
 * pages stay in lock-step on the selector contract.
 */
import {
  buildExerciseCatalogGroups,
  exerciseDisplayName,
  PRIMARY_GROUP_ORDER,
  type WorkoutExerciseCatalogEntry,
} from "@sergeant/fizruk-domain/domain";
import { memo, useCallback, useMemo, useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";

import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";

const EMPTY_RECORD: Record<string, string> = {};

export interface ExerciseCatalogSectionProps {
  exercises: readonly WorkoutExerciseCatalogEntry[];
  primaryGroupsUk?: Record<string, string>;
  equipmentUk?: Record<string, string>;
  onPickExercise?(ex: WorkoutExerciseCatalogEntry): void;
  /** Long-press handler — typically navigates to the exercise detail page. */
  onInspectExercise?(ex: WorkoutExerciseCatalogEntry): void;
  /**
   * Controlled filter (optional). When omitted the section owns its
   * own search + primary-group state.
   */
  query?: string;
  onQueryChange?(next: string): void;
  primaryGroup?: string | null;
  onPrimaryGroupChange?(next: string | null): void;
  equipment?: readonly string[];
  onEquipmentChange?(next: string[]): void;
  /** Optional root testID — sub-ids derive from it. */
  testID?: string;
}

function PrimaryGroupChips({
  groupsUk,
  selected,
  onChange,
  testID,
}: {
  groupsUk: Record<string, string>;
  selected: string | null;
  onChange(next: string | null): void;
  testID: string;
}) {
  const knownOrder = [...PRIMARY_GROUP_ORDER];
  const allKeys = Object.keys(groupsUk);
  const extras = allKeys.filter((k) => !knownOrder.includes(k)).sort();
  const ids = [...knownOrder.filter((k) => groupsUk[k]), ...extras];

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
      contentContainerStyle={{ gap: 8, paddingVertical: 2 }}
      testID={testID}
    >
      <Chip
        label="Усі"
        active={selected === null}
        onPress={() => onChange(null)}
        testID={`${testID}-all`}
      />
      {ids.map((id) => (
        <Chip
          key={id}
          label={groupsUk[id] ?? id}
          active={selected === id}
          onPress={() => onChange(selected === id ? null : id)}
          testID={`${testID}-${id}`}
        />
      ))}
    </ScrollView>
  );
}

function EquipmentChips({
  equipmentUk,
  selected,
  onChange,
  testID,
}: {
  equipmentUk: Record<string, string>;
  selected: readonly string[];
  onChange(next: string[]): void;
  testID: string;
}) {
  const ids = Object.keys(equipmentUk);
  if (ids.length === 0) return null;

  const toggle = (id: string) => {
    const arr = [...selected];
    const idx = arr.indexOf(id);
    if (idx >= 0) arr.splice(idx, 1);
    else arr.push(id);
    onChange(arr);
  };

  return (
    <View className="gap-1">
      <Text className="text-xs font-semibold text-fg-muted px-1">
        Обладнання
      </Text>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ gap: 8, paddingVertical: 2 }}
        testID={testID}
      >
        {ids.map((id) => (
          <Chip
            key={id}
            label={equipmentUk[id] ?? id}
            active={selected.includes(id)}
            onPress={() => toggle(id)}
            testID={`${testID}-${id}`}
          />
        ))}
        {selected.length > 0 && (
          <Chip
            label="Скинути"
            active={false}
            onPress={() => onChange([])}
            testID={`${testID}-reset`}
          />
        )}
      </ScrollView>
    </View>
  );
}

function Chip({
  label,
  active,
  onPress,
  testID,
}: {
  label: string;
  active: boolean;
  onPress(): void;
  testID: string;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      accessibilityLabel={label}
      onPress={onPress}
      testID={testID}
      className={
        active
          ? "px-3 h-8 rounded-full bg-teal-600 flex-row items-center justify-center"
          : "px-3 h-8 rounded-full bg-cream-100 border border-cream-300 flex-row items-center justify-center"
      }
    >
      <Text
        className={
          active
            ? "text-xs font-semibold text-white"
            : "text-xs font-semibold text-fg"
        }
      >
        {label}
      </Text>
    </Pressable>
  );
}

function ExerciseRow({
  exercise,
  onPress,
  onLongPress,
  testID,
}: {
  exercise: WorkoutExerciseCatalogEntry;
  onPress?: () => void;
  onLongPress?: () => void;
  testID: string;
}) {
  const title = exerciseDisplayName(exercise);
  const groupLabel = exercise.primaryGroupUk ?? exercise.primaryGroup ?? "";

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Додати ${title}`}
      accessibilityHint={
        onLongPress ? "Утримайте, щоб відкрити деталі вправи" : undefined
      }
      onPress={onPress}
      onLongPress={onLongPress}
      testID={testID}
      className="px-3 py-3 rounded-xl border border-cream-300 bg-cream-50 flex-row items-center justify-between"
    >
      <View className="flex-1 pr-2">
        <Text className="text-sm font-semibold text-fg" numberOfLines={2}>
          {title}
        </Text>
        {groupLabel ? (
          <Text className="text-xs text-fg-muted mt-0.5" numberOfLines={1}>
            {groupLabel}
          </Text>
        ) : null}
      </View>
      {onPress ? (
        <Text className="text-teal-700 text-base font-bold">+</Text>
      ) : null}
    </Pressable>
  );
}

export const ExerciseCatalogSection = memo(function ExerciseCatalogSection({
  exercises,
  primaryGroupsUk = EMPTY_RECORD,
  equipmentUk = EMPTY_RECORD,
  onPickExercise,
  onInspectExercise,
  query: controlledQuery,
  onQueryChange,
  primaryGroup: controlledPrimaryGroup,
  onPrimaryGroupChange,
  equipment: controlledEquipment,
  onEquipmentChange,
  testID = "fizruk-workouts-catalog",
}: ExerciseCatalogSectionProps) {
  const [uncontrolledQuery, setUncontrolledQuery] = useState("");
  const [uncontrolledGroup, setUncontrolledGroup] = useState<string | null>(
    null,
  );
  const [uncontrolledEquipment, setUncontrolledEquipment] = useState<string[]>(
    [],
  );

  const query = controlledQuery ?? uncontrolledQuery;
  const primaryGroup =
    controlledPrimaryGroup === undefined
      ? uncontrolledGroup
      : controlledPrimaryGroup;
  const equipment = controlledEquipment ?? uncontrolledEquipment;

  const handleQueryChange = useCallback(
    (next: string) => {
      if (onQueryChange) onQueryChange(next);
      else setUncontrolledQuery(next);
    },
    [onQueryChange],
  );

  const handlePrimaryGroupChange = useCallback(
    (next: string | null) => {
      if (onPrimaryGroupChange) onPrimaryGroupChange(next);
      else setUncontrolledGroup(next);
    },
    [onPrimaryGroupChange],
  );

  const handleEquipmentChange = useCallback(
    (next: string[]) => {
      if (onEquipmentChange) onEquipmentChange(next);
      else setUncontrolledEquipment(next);
    },
    [onEquipmentChange],
  );

  const groups = useMemo(
    () =>
      buildExerciseCatalogGroups(exercises, {
        query,
        primaryGroup,
        equipment: equipment.length > 0 ? equipment : null,
        primaryGroupsUk,
      }),
    [exercises, query, primaryGroup, equipment, primaryGroupsUk],
  );

  return (
    <View className="gap-3" testID={testID}>
      <Input
        value={query}
        onChangeText={handleQueryChange}
        placeholder="Шукати вправу"
        type="search"
        accessibilityLabel="Пошук вправи"
        testID={`${testID}-search`}
      />
      <PrimaryGroupChips
        groupsUk={primaryGroupsUk}
        selected={primaryGroup ?? null}
        onChange={handlePrimaryGroupChange}
        testID={`${testID}-chips`}
      />
      <EquipmentChips
        equipmentUk={equipmentUk}
        selected={equipment}
        onChange={handleEquipmentChange}
        testID={`${testID}-equipment`}
      />

      {groups.length === 0 ? (
        <Card
          variant="flat"
          radius="lg"
          padding="lg"
          testID={`${testID}-empty`}
        >
          <Text className="text-sm font-semibold text-fg">
            Нічого не знайдено
          </Text>
          <Text className="text-xs text-fg-muted mt-1">
            Спробуй інший пошук або очисти фільтр по групі.
          </Text>
        </Card>
      ) : (
        <View className="gap-4">
          {groups.map((group) => (
            <View
              key={group.id}
              className="gap-2"
              testID={`${testID}-group-${group.id}`}
            >
              <View className="flex-row items-center justify-between px-1">
                <Text className="text-xs font-semibold uppercase text-fg-muted">
                  {group.label}
                </Text>
                <Text className="text-xs text-fg-muted">
                  {group.items.length}/{group.total}
                </Text>
              </View>
              <View className="gap-2">
                {group.items.map((exercise) => (
                  <ExerciseRow
                    key={exercise.id}
                    exercise={exercise}
                    onPress={
                      onPickExercise
                        ? () => onPickExercise(exercise)
                        : undefined
                    }
                    onLongPress={
                      onInspectExercise
                        ? () => onInspectExercise(exercise)
                        : undefined
                    }
                    testID={`${testID}-row-${exercise.id}`}
                  />
                ))}
              </View>
            </View>
          ))}
        </View>
      )}
    </View>
  );
});
