/**
 * Sergeant Routine — HabitsPage (React Native)
 *
 * Mobile port of `apps/web/src/modules/routine/components/settings/
 * ActiveHabitsSection.tsx` + `ArchivedHabitsSection.tsx` (merged into
 * a single scrollable page on mobile — the settings tab is already
 * the host and there's no room for a separate route).
 *
 * Scope of this PR:
 *  - List of **active** habits (sorted by `habitOrder`, via
 *    `sortHabitsByOrder`), with an empty-state when the user has
 *    none yet.
 *  - List of **archived** habits below the divider, collapsed by
 *    default. Restore + delete per row.
 *  - Per-row actions: ↑ / ↓ reorder, «Змінити» (opens the form in
 *    edit mode), «В архів» / «Відновити», «Видалити» (two-tap
 *    confirmation — a second press within ~5s commits the delete).
 *  - Floating «+ Add» button in the bottom-right that opens the
 *    `HabitForm` sheet in new-habit mode.
 *  - Long-press + drag reorder for the active habits list, via
 *    `DraggableHabitList` (`react-native-gesture-handler` +
 *    Reanimated). The ↑ / ↓ buttons stay in place as the keyboard /
 *    screen-reader accessibility fallback, so the two reorder paths
 *    share `useRoutineStore` under the hood (`setHabitOrder` on drop,
 *    `moveHabitInOrder` on button tap).
 *
 * ALL mutations go through `useRoutineStore` (the same MMKV-backed
 * hook that `Calendar.tsx` uses), so persistence is unified — no
 * second storage layer.
 *
 * Deferred to follow-up PRs (flagged in the PR body):
 *  - Habit detail sheet / completion history.
 *  - Category & tag CRUD from this page (web has `TagsSection` and
 *    `CategoriesSection` cards; those screens land in a dedicated
 *    sub-tab of Settings later).
 */

import { useCallback, useMemo, useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import {
  sortHabitsByOrder,
  type Habit,
  type HabitDraftPatch,
} from "@sergeant/routine-domain";

import { useToast } from "@/components/ui/Toast";
import { showUndoToast } from "@/lib/showUndoToast";

import { useRoutineStore } from "../../lib/routineStore";
import { DraggableHabitList } from "./DraggableHabitList";
import { HabitForm } from "./HabitForm";
import { HabitListItem } from "./HabitListItem";

type FormState =
  | { mode: "closed" }
  | { mode: "new" }
  | { mode: "edit"; habit: Habit };

export interface HabitsPageProps {
  /** Optional root `testID` — children derive stable sub-ids. */
  testID?: string;
}

export function HabitsPage({ testID }: HabitsPageProps) {
  const {
    routine,
    createHabit,
    updateHabit,
    setHabitArchived,
    deleteHabit,
    snapshotHabit,
    restoreHabit,
    moveHabitInOrder,
    setHabitOrder,
  } = useRoutineStore();
  const toast = useToast();

  const [formState, setFormState] = useState<FormState>({ mode: "closed" });
  const [archiveOpen, setArchiveOpen] = useState(false);

  const activeHabits = useMemo(
    () =>
      sortHabitsByOrder(
        routine.habits.filter((h) => !h.archived),
        routine.habitOrder || [],
      ),
    [routine.habits, routine.habitOrder],
  );

  const archivedHabits = useMemo(
    () => routine.habits.filter((h) => !!h.archived),
    [routine.habits],
  );

  const openNew = useCallback(() => {
    setFormState({ mode: "new" });
  }, []);

  const openEdit = useCallback((habit: Habit) => {
    setFormState({ mode: "edit", habit });
  }, []);

  const closeForm = useCallback(() => {
    setFormState({ mode: "closed" });
  }, []);

  const handleSubmit = useCallback(
    (patch: HabitDraftPatch) => {
      if (formState.mode === "edit") {
        updateHabit(formState.habit.id, patch);
      } else {
        createHabit(patch);
      }
    },
    [formState, createHabit, updateHabit],
  );

  // Single-tap delete + undo-toast (parity з web-ом). Знімок робимо
  // _до_ виклику `deleteHabit`, бо після reducer-а звички в `routine`
  // вже немає.
  const handleRequestDelete = useCallback(
    (id: string) => {
      const snapshot = snapshotHabit(id);
      if (!snapshot) return;
      deleteHabit(id);
      const habitName = snapshot.habit.name || "звичку";
      showUndoToast(toast, {
        msg: `Видалено звичку «${habitName}»`,
        onUndo: () => restoreHabit(snapshot),
      });
    },
    [deleteHabit, restoreHabit, snapshotHabit, toast],
  );

  // `pendingDeleteId` залишається у списку API DraggableHabitList для
  // зворотної сумісності, але після переходу на undo-toast pending-стану
  // більше нема — завжди передаємо `null`.
  const pendingDeleteId: string | null = null;

  const editingId = formState.mode === "edit" ? formState.habit.id : null;

  return (
    <SafeAreaView
      className="flex-1 bg-bg dark:bg-bg"
      edges={["top"]}
      testID={testID}
    >
      <View className="flex-row items-center gap-2 px-4 pt-4 pb-1">
        <Text className="text-[22px]">⚙️</Text>
        <Text className="text-[22px] font-bold text-fg flex-1">Звички</Text>
      </View>
      <Text className="px-4 text-sm text-fg-muted leading-snug mb-2">
        Додавай, редагуй і архівуй звички. Порядок у списку = порядок у
        календарі — використай ↑ / ↓ для зміни.
      </Text>

      <ScrollView
        className="flex-1"
        contentContainerStyle={{ padding: 16, paddingBottom: 96, gap: 12 }}
      >
        <View className="rounded-2xl border border-cream-300 bg-white px-3 py-2">
          <Text className="text-sm font-semibold text-fg mb-1">
            Активні звички
          </Text>
          {activeHabits.length === 0 ? (
            <View
              className="py-6 items-center"
              testID={testID ? `${testID}-empty` : undefined}
            >
              <Text className="text-sm text-fg-muted">Поки порожньо</Text>
              <Text className="text-xs text-fg-subtle mt-1 text-center">
                Натисни «+ Додати» нижче, щоб створити першу звичку.
              </Text>
            </View>
          ) : (
            <DraggableHabitList
              habits={activeHabits}
              onReorder={setHabitOrder}
              onMoveUp={(id) => moveHabitInOrder(id, -1)}
              onMoveDown={(id) => moveHabitInOrder(id, 1)}
              onStartEdit={openEdit}
              onArchive={(id) => setHabitArchived(id, true)}
              onRequestDelete={handleRequestDelete}
              editingId={editingId}
              pendingDeleteId={pendingDeleteId}
              testID={testID ? `${testID}-list` : undefined}
            />
          )}
        </View>

        <View className="rounded-2xl border border-cream-300 bg-white px-3 py-2">
          <Pressable
            onPress={() => setArchiveOpen((v) => !v)}
            accessibilityRole="button"
            accessibilityState={{ expanded: archiveOpen }}
            testID={testID ? `${testID}-archive-toggle` : undefined}
            className="flex-row items-center justify-between py-1"
          >
            <Text className="text-sm font-semibold text-fg">
              Архів{" "}
              <Text className="text-xs font-normal text-fg-muted">
                ({archivedHabits.length})
              </Text>
            </Text>
            <Text className="text-xs text-fg-muted">
              {archiveOpen ? "▲" : "▼"}
            </Text>
          </Pressable>
          {archiveOpen ? (
            archivedHabits.length === 0 ? (
              <Text className="text-xs text-fg-muted py-3">
                Архів порожній.
              </Text>
            ) : (
              <View>
                {archivedHabits.map((h) => (
                  <HabitListItem
                    key={h.id}
                    habit={h}
                    editing={false}
                    archived
                    onMoveUp={() => {}}
                    onMoveDown={() => {}}
                    onStartEdit={() => openEdit(h)}
                    onArchive={() => {}}
                    onUnarchive={() => setHabitArchived(h.id, false)}
                    onRequestDelete={() => handleRequestDelete(h.id)}
                    testID={testID ? `${testID}-archived-${h.id}` : undefined}
                  />
                ))}
              </View>
            )
          ) : null}
        </View>
      </ScrollView>

      <View className="absolute right-4 bottom-6">
        <Pressable
          onPress={openNew}
          accessibilityRole="button"
          accessibilityLabel="Додати звичку"
          testID={testID ? `${testID}-add` : undefined}
          className="h-14 px-5 rounded-full bg-coral-500 items-center justify-center shadow-lg"
        >
          <Text className="text-base font-bold text-white">+ Додати</Text>
        </Pressable>
      </View>

      <HabitForm
        open={formState.mode !== "closed"}
        onClose={closeForm}
        routine={routine}
        editingHabit={formState.mode === "edit" ? formState.habit : null}
        onSubmit={handleSubmit}
        testID={testID ? `${testID}-form` : undefined}
      />
    </SafeAreaView>
  );
}

export default HabitsPage;
