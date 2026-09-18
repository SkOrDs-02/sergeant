/**
 * `MeasurementEntryList` — scrollable history list for the
 * Measurements page. Renders one {@link MeasurementEntryRow} per
 * entry and owns the "no entries" empty-state copy.
 *
 * The list itself is pure presentational — state (which row is
 * pending delete, which row is being edited) is lifted into the
 * {@link import("../../pages/Measurements.js").Measurements} page.
 */
import { Text, View } from "react-native";

import type { MobileMeasurementEntry } from "@sergeant/fizruk-domain/domain";

import { MeasurementEntryRow } from "./MeasurementEntryRow";

export interface MeasurementEntryListProps {
  entries: readonly MobileMeasurementEntry[];
  pendingDeleteId: string | null;
  onEdit: (entry: MobileMeasurementEntry) => void;
  onRequestDelete: (id: string) => void;
  testID?: string;
}

export function MeasurementEntryList({
  entries,
  pendingDeleteId,
  onEdit,
  onRequestDelete,
  testID = "fizruk-measurements-list",
}: MeasurementEntryListProps) {
  if (entries.length === 0) {
    return (
      <View
        className="rounded-2xl border border-dashed border-cream-300 bg-cream-50 p-4 items-center"
        testID={`${testID}-empty`}
      >
        <Text className="text-sm font-semibold text-fg">Поки порожньо</Text>
        <Text className="text-xs text-fg-muted mt-1 text-center">
          Натисни «+ Додати» і запиши свій перший замір.
        </Text>
      </View>
    );
  }

  return (
    <View className="gap-2" testID={testID}>
      {entries.map((entry) => (
        <MeasurementEntryRow
          key={entry.id}
          entry={entry}
          pendingDelete={pendingDeleteId === entry.id}
          onEdit={onEdit}
          onRequestDelete={onRequestDelete}
        />
      ))}
    </View>
  );
}
