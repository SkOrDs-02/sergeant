/**
 * `WorkoutTemplateEditor` — name + exercise-picker form for the mobile
 * WorkoutTemplates sheet.
 *
 * Ported from the inline editor inside
 * `apps/web/src/modules/fizruk/components/WorkoutTemplatesSection.tsx`,
 * trimmed to the mobile-relevant feature set:
 *  - rename (default name `"Мій шаблон"`)
 *  - search the catalog + tap to append
 *  - reorder with ↑ / ↓
 *  - remove from the order list
 *
 * Superset / circuit groups stay as a web-only refinement for now; the
 * hook already round-trips the `groups` field unchanged, so an existing
 * template's groups survive an edit even though the mobile UI does not
 * yet expose group authoring (tracked in
 * `docs/mobile/react-native-migration.md` § 5.3 — a Phase 6 follow-up).
 */
import { exerciseDisplayName } from "@sergeant/fizruk-domain/domain";
import type { FizrukData } from "@sergeant/fizruk-domain";
import { useMemo, useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { ChevronDown, ChevronUp, X } from "lucide-react-native";

import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { SectionHeading } from "@/components/ui/SectionHeading";

import type {
  WorkoutTemplate,
  WorkoutTemplateGroup,
} from "../../hooks/useWorkoutTemplates";

type RawExerciseDef = FizrukData.RawExerciseDef;

export interface WorkoutTemplateEditorProps {
  /** `null` = create mode; otherwise = edit mode for an existing template. */
  template: WorkoutTemplate | null;
  exercises: readonly RawExerciseDef[];
  search(query: string): readonly RawExerciseDef[];
  onSave(
    name: string,
    orderIds: string[],
    groups: WorkoutTemplateGroup[],
  ): void;
  onCancel(): void;
  testID?: string;
}

const MAX_RESULTS = 40;

export function WorkoutTemplateEditor({
  template,
  exercises,
  search,
  onSave,
  onCancel,
  testID = "fizruk-workout-templates-editor",
}: WorkoutTemplateEditorProps) {
  const [name, setName] = useState(template?.name ?? "");
  const [orderIds, setOrderIds] = useState<string[]>(() =>
    template ? [...template.exerciseIds] : [],
  );
  // Preserve any existing group structure when editing — the editor
  // itself doesn't author groups yet (see file header), so we just keep
  // groups whose members still appear in the order list.
  const [groups] = useState<WorkoutTemplateGroup[]>(() =>
    template ? [...template.groups] : [],
  );
  const [query, setQuery] = useState("");

  const pickList = useMemo(
    () => search(query).slice(0, MAX_RESULTS),
    [search, query],
  );

  const byId = useMemo(() => {
    const m = new Map<string, RawExerciseDef>();
    for (const ex of exercises) {
      if (ex.id) m.set(ex.id, ex);
    }
    return m;
  }, [exercises]);

  const addEx = (ex: RawExerciseDef | undefined): void => {
    if (!ex?.id) return;
    setOrderIds((prev) => (prev.includes(ex.id) ? prev : [...prev, ex.id]));
  };

  const move = (idx: number, dir: 1 | -1): void => {
    setOrderIds((prev) => {
      const j = idx + dir;
      if (j < 0 || j >= prev.length) return prev;
      const next = [...prev];
      const a = next[idx];
      const b = next[j];
      if (a === undefined || b === undefined) return prev;
      next[idx] = b;
      next[j] = a;
      return next;
    });
  };

  const removeAt = (idx: number): void => {
    setOrderIds((prev) => prev.filter((_, i) => i !== idx));
  };

  const handleSave = (): void => {
    if (orderIds.length === 0) return;
    const finalName = name.trim() || "Мій шаблон";
    const survivingGroups = groups
      .map((g) => ({
        ...g,
        itemIds: g.itemIds.filter((id) => orderIds.includes(id)),
      }))
      .filter((g) => g.itemIds.length >= 2);
    onSave(finalName, orderIds, survivingGroups);
  };

  return (
    <View className="gap-3" testID={testID}>
      <Input
        label="Назва шаблону"
        placeholder="Мій шаблон"
        value={name}
        onChangeText={setName}
        accessibilityLabel="Назва шаблону"
        testID={`${testID}-name`}
      />

      <View className="gap-2">
        <SectionHeading size="xs">Додати вправу з каталогу</SectionHeading>
        <Input
          placeholder="Пошук вправи…"
          value={query}
          onChangeText={setQuery}
          accessibilityLabel="Пошук вправи для шаблону"
          testID={`${testID}-search`}
        />
        <Card variant="flat" radius="lg" padding="none">
          <ScrollView
            className="max-h-48"
            keyboardShouldPersistTaps="handled"
            testID={`${testID}-search-results`}
          >
            {pickList.length === 0 ? (
              <Text className="text-xs text-fg-muted text-center py-4">
                Нічого не знайдено
              </Text>
            ) : (
              pickList.map((ex) => (
                <Pressable
                  key={ex.id}
                  accessibilityRole="button"
                  accessibilityLabel={`Додати ${exerciseDisplayName(ex)}`}
                  onPress={() => addEx(ex)}
                  className="px-3 py-3 min-h-[44px] border-b border-cream-200 active:bg-cream-100"
                  testID={`${testID}-pick-${ex.id}`}
                >
                  <Text className="text-sm text-fg">
                    {exerciseDisplayName(ex)}
                  </Text>
                </Pressable>
              ))
            )}
          </ScrollView>
        </Card>
      </View>

      <View className="gap-2">
        <SectionHeading size="xs">Порядок ({orderIds.length})</SectionHeading>
        {orderIds.length === 0 ? (
          <Text className="text-sm text-fg-muted text-center py-4">
            Додай хоча б одну вправу
          </Text>
        ) : (
          <View className="gap-1.5">
            {orderIds.map((id, idx) => {
              const ex = byId.get(id);
              return (
                <View
                  key={`${id}_${idx}`}
                  className="flex-row items-center gap-2 rounded-xl border border-cream-300 bg-cream-50 px-2 py-1.5"
                  testID={`${testID}-row-${id}`}
                >
                  <Text className="text-xs text-fg-subtle w-5 text-center">
                    {idx + 1}
                  </Text>
                  <Text className="flex-1 text-sm text-fg" numberOfLines={1}>
                    {ex ? exerciseDisplayName(ex) : id}
                  </Text>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Вище"
                    onPress={() => move(idx, -1)}
                    className="w-11 h-11 items-center justify-center"
                    testID={`${testID}-up-${id}`}
                  >
                    <ChevronUp size={18} color="#57534e" />
                  </Pressable>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Нижче"
                    onPress={() => move(idx, 1)}
                    className="w-11 h-11 items-center justify-center"
                    testID={`${testID}-down-${id}`}
                  >
                    <ChevronDown size={18} color="#57534e" />
                  </Pressable>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Прибрати з шаблону"
                    onPress={() => removeAt(idx)}
                    className="w-11 h-11 items-center justify-center"
                    testID={`${testID}-remove-${id}`}
                  >
                    <X size={18} color="#b91c1c" />
                  </Pressable>
                </View>
              );
            })}
          </View>
        )}
      </View>

      <View className="flex-row gap-2 pt-2">
        <Button
          variant="primary"
          size="lg"
          className="flex-1"
          onPress={handleSave}
          disabled={orderIds.length === 0}
          testID={`${testID}-save`}
        >
          Зберегти
        </Button>
        <Button
          variant="ghost"
          size="lg"
          className="flex-1"
          onPress={onCancel}
          testID={`${testID}-cancel`}
        >
          Скасувати
        </Button>
      </View>
    </View>
  );
}
