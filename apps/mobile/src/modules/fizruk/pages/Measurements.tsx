/**
 * Fizruk / Measurements page — mobile (Phase 6 · Measurements PR).
 *
 * Web counterpart: `apps/web/src/modules/fizruk/pages/Measurements.tsx`.
 * Full port of the numeric-data side of the web page: history list +
 * weight trend card + bottom-sheet form for create / edit / delete.
 *
 * Photo progress is deliberately out of scope for the Phase 6
 * migration — this page is numeric data only.
 *
 * Architecture:
 *  - `useMeasurements` (MMKV-backed) owns list persistence.
 *  - Pure selectors / validators / reducers live in
 *    `@sergeant/fizruk-domain/domain/measurements`.
 *  - `buildWeightTrend` is reused from the existing
 *    `domain/progress` module (do NOT duplicate).
 *  - Sub-components live in `../components/measurements/*`.
 */
import { useCallback, useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import type { MobileMeasurementEntry } from "@sergeant/fizruk-domain/domain";

import { useToast } from "@/components/ui/Toast";
import { showUndoToast } from "@/lib/showUndoToast";

import {
  MeasurementEntryForm,
  MeasurementEntryList,
  MeasurementsTrendCard,
} from "../components/measurements";
import { useMeasurements } from "../hooks/useMeasurements";

type FormState =
  | { mode: "closed" }
  | { mode: "new" }
  | { mode: "edit"; entry: MobileMeasurementEntry };

export interface MeasurementsProps {
  /** Optional root testID — sub-ids derive from it. */
  testID?: string;
}

export function Measurements({
  testID = "fizruk-measurements",
}: MeasurementsProps) {
  const { entries, add, update, remove, restore } = useMeasurements();
  const toast = useToast();

  const [formState, setFormState] = useState<FormState>({ mode: "closed" });

  const openNew = useCallback(() => setFormState({ mode: "new" }), []);
  const openEdit = useCallback(
    (entry: MobileMeasurementEntry) => setFormState({ mode: "edit", entry }),
    [],
  );
  const closeForm = useCallback(() => setFormState({ mode: "closed" }), []);

  const handleSubmit = useCallback(
    (draft: Parameters<typeof add>[0]) => {
      if (formState.mode === "edit") {
        update(formState.entry.id, draft);
      } else {
        add(draft);
      }
    },
    [formState, add, update],
  );

  // Single-tap delete + undo-toast (parity з web-ом і з HabitsPage).
  const handleRequestDelete = useCallback(
    (id: string) => {
      const snapshot = entries.find((e) => e.id === id);
      if (!snapshot) return;
      remove(id);
      showUndoToast(toast, {
        msg: "Запис вимірювання видалено",
        onUndo: () => restore(snapshot),
      });
    },
    [entries, remove, restore, toast],
  );

  // Після переходу на undo-toast pending-стану більше нема — лишили
  // `pendingDeleteId` у ПРОП-списку листа для зворотної сумісності.
  const pendingDeleteId: string | null = null;

  const editingEntry = formState.mode === "edit" ? formState.entry : null;

  return (
    <SafeAreaView
      className="flex-1 bg-cream-50"
      edges={["top"]}
      testID={testID}
    >
      <View className="flex-row items-center gap-2 px-4 pt-4 pb-1">
        <Text className="text-[22px]">📏</Text>
        <Text className="text-[22px] font-bold text-fg flex-1">
          Вимірювання
        </Text>
      </View>
      <Text className="px-4 text-sm text-fg-muted leading-snug mb-3">
        Вага, обхвати та самопочуття — все в одному місці. Записи зберігаються
        локально й синхронізуються через CloudSync.
      </Text>

      <ScrollView
        className="flex-1"
        contentContainerStyle={{ padding: 16, paddingBottom: 120, gap: 16 }}
      >
        <MeasurementsTrendCard entries={entries} testID={`${testID}-trend`} />

        <View className="flex-row items-baseline justify-between">
          <Text className="text-sm font-semibold text-fg">Історія</Text>
          <Text className="text-xs text-fg-muted" testID={`${testID}-count`}>
            {entries.length > 0 ? `${entries.length} записів` : ""}
          </Text>
        </View>

        <MeasurementEntryList
          entries={entries}
          pendingDeleteId={pendingDeleteId}
          onEdit={openEdit}
          onRequestDelete={handleRequestDelete}
          testID={`${testID}-list`}
        />
      </ScrollView>

      {/* Floating action button — matches the `HabitsPage` FAB spec. */}
      <View className="absolute right-4 bottom-6" pointerEvents="box-none">
        <Pressable
          accessibilityLabel="Додати замір"
          onPress={openNew}
          className="h-14 rounded-full bg-teal-600 px-5 flex-row items-center justify-center shadow-md"
          testID={`${testID}-add`}
        >
          <Text className="text-white text-base font-semibold">+ Додати</Text>
        </Pressable>
      </View>

      <MeasurementEntryForm
        open={formState.mode !== "closed"}
        onClose={closeForm}
        editingEntry={editingEntry}
        onSubmit={handleSubmit}
        testID={`${testID}-form`}
      />
    </SafeAreaView>
  );
}

export default Measurements;
