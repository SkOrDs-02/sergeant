/**
 * `MeasurementEntryRow` — one row in the Measurements history list.
 *
 * - Pressing the row body opens the edit sheet (owned by the parent).
 * - A trailing button surfaces the two-tap delete pattern used by
 *   `HabitsPage` / Finyk: first tap flips the row into a "confirm"
 *   state, a second tap within ~5 s commits the delete.
 *
 * Presentation only — pure formatting helpers live in
 * `@sergeant/fizruk-domain/domain/measurements`.
 */
import { useCallback } from "react";
import { Pressable, Text, View } from "react-native";

import {
  formatMeasurementDate,
  summariseMeasurementEntry,
  type MobileMeasurementEntry,
} from "@sergeant/fizruk-domain/domain";

import { Button } from "@/components/ui/Button";

export interface MeasurementEntryRowProps {
  entry: MobileMeasurementEntry;
  /** Whether the row is currently armed for delete (2-tap confirm). */
  pendingDelete: boolean;
  onEdit: (entry: MobileMeasurementEntry) => void;
  onRequestDelete: (id: string) => void;
  /** Optional root testID — sub-ids derive from it. */
  testID?: string;
}

export function MeasurementEntryRow({
  entry,
  pendingDelete,
  onEdit,
  onRequestDelete,
  testID,
}: MeasurementEntryRowProps) {
  const rowTestID = testID ?? `fizruk-measurements-row-${entry.id}`;

  const handlePress = useCallback(() => onEdit(entry), [entry, onEdit]);
  const handleDelete = useCallback(
    () => onRequestDelete(entry.id),
    [entry.id, onRequestDelete],
  );

  return (
    <View
      className="flex-row items-center gap-3 rounded-2xl bg-cream-50 border border-cream-200 p-3"
      testID={rowTestID}
    >
      <Pressable
        onPress={handlePress}
        className="flex-1"
        accessibilityLabel={`Редагувати запис ${formatMeasurementDate(entry.at)}`}
        testID={`${rowTestID}-edit`}
      >
        <Text className="text-sm font-semibold text-fg">
          {formatMeasurementDate(entry.at)}
        </Text>
        <Text
          className="text-xs text-fg-muted mt-0.5"
          numberOfLines={2}
          testID={`${rowTestID}-summary`}
        >
          {summariseMeasurementEntry(entry)}
        </Text>
      </Pressable>
      <Button
        variant={pendingDelete ? "destructive" : "danger"}
        size="sm"
        onPress={handleDelete}
        testID={`${rowTestID}-delete`}
        accessibilityLabel={
          pendingDelete ? "Підтвердити видалення" : "Видалити запис"
        }
      >
        {pendingDelete ? "Точно?" : "Видалити"}
      </Button>
    </View>
  );
}
