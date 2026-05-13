/**
 * `WorkoutTemplateRow` — single row in the mobile WorkoutTemplates sheet.
 *
 * Mirrors the web row inside
 * `apps/web/src/modules/fizruk/components/WorkoutTemplatesSection.tsx`:
 * shows the template name, exercise-count subtitle plus three actions —
 * "Почати" / "Редагувати" / "Видалити". The web component uses raw
 * <button> + Tooltip + ConfirmDialog; on mobile we substitute
 * `Pressable` + `accessibilityLabel`.
 *
 * Delete confirmation lives in the parent so the sheet can show a single
 * shared ConfirmDialog instead of one per row.
 */
import { memo } from "react";
import { Pressable, Text, View } from "react-native";
import { Play, Pencil, Trash2 } from "lucide-react-native";

import { Card } from "@/components/ui/Card";

import type { WorkoutTemplate } from "../../hooks/useWorkoutTemplates";

export interface WorkoutTemplateRowProps {
  template: WorkoutTemplate;
  onStart(): void;
  onEdit(): void;
  onDelete(): void;
  testID?: string;
}

function WorkoutTemplateRowBase({
  template,
  onStart,
  onEdit,
  onDelete,
  testID,
}: WorkoutTemplateRowProps) {
  const count = template.exerciseIds.length;
  const subtitle =
    count === 0
      ? "Порожній шаблон"
      : count === 1
        ? "1 вправа"
        : `${count} вправ`;

  return (
    <Card variant="default" radius="lg" padding="md" testID={testID}>
      <View className="flex-row items-center gap-3">
        <View className="flex-1 min-w-0">
          <Text className="text-sm font-semibold text-fg" numberOfLines={1}>
            {template.name}
          </Text>
          <Text className="text-[11px] text-fg-muted mt-0.5">{subtitle}</Text>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Почати тренування з шаблону «${template.name}»`}
          onPress={onStart}
          disabled={count === 0}
          className={
            count === 0
              ? "h-11 px-3 rounded-xl bg-cream-200 items-center justify-center flex-row gap-1"
              : "h-11 px-3 rounded-xl bg-teal-600 items-center justify-center flex-row gap-1"
          }
          testID={testID ? `${testID}-start` : undefined}
        >
          <Play size={14} color={count === 0 ? "#a8a29e" : "#ffffff"} />
          <Text
            className={
              count === 0
                ? "text-xs font-semibold text-fg-subtle"
                : "text-xs font-semibold text-white"
            }
          >
            Почати
          </Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Редагувати шаблон «${template.name}»`}
          onPress={onEdit}
          className="w-11 h-11 rounded-xl bg-cream-100 items-center justify-center"
          testID={testID ? `${testID}-edit` : undefined}
        >
          <Pencil size={16} color="#57534e" />
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Видалити шаблон «${template.name}»`}
          onPress={onDelete}
          className="w-11 h-11 rounded-xl bg-cream-100 items-center justify-center"
          testID={testID ? `${testID}-delete` : undefined}
        >
          <Trash2 size={16} color="#b91c1c" />
        </Pressable>
      </View>
    </Card>
  );
}

export const WorkoutTemplateRow = memo(WorkoutTemplateRowBase);
