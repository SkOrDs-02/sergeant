import { useState } from "react";
import { ConfirmDialog } from "@shared/components/ui/ConfirmDialog";
import { useToast } from "@shared/hooks/useToast";
import { showUndoToast } from "@shared/lib/ui/undoToast";
import { useRoutineState } from "../../modules/routine/hooks/useRoutineState";
import {
  deleteHabit,
  restoreHabit,
  snapshotHabit,
} from "../../modules/routine/lib/routineStorage";
import { HabitDetailSheet } from "../../modules/routine/components/HabitDetailSheet";
import { HabitQuickCreateDialog } from "../../modules/routine/components/HabitQuickCreateDialog";
import { TagsSection } from "../../modules/routine/components/settings/TagsSection";
import { CategoriesSection } from "../../modules/routine/components/settings/CategoriesSection";
import { ActiveHabitsSection } from "../../modules/routine/components/settings/ActiveHabitsSection";
import { ArchivedHabitsSection } from "../../modules/routine/components/settings/ArchivedHabitsSection";
import type {
  CategoryDraft,
  PendingHabitDeletion,
} from "../../modules/routine/lib/types";
import {
  SettingsGroup,
  SettingsSubGroup,
  ToggleRow,
} from "./SettingsPrimitives";

export function RoutineSection() {
  const toast = useToast();
  const { routine, setRoutine, updatePref } = useRoutineState();

  const [tagDraft, setTagDraft] = useState<string>("");
  const [catDraft, setCatDraft] = useState<CategoryDraft>({
    name: "",
    emoji: "",
  });

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDialogFocusTick, setEditDialogFocusTick] = useState(0);
  const [detailHabitId, setDetailHabitId] = useState<string | null>(null);
  const [deleteHabitPending, setDeleteHabitPending] =
    useState<PendingHabitDeletion | null>(null);

  const closeEditDialog = () => setEditingId(null);

  return (
    <SettingsGroup title="Рутина" emoji="✅">
      <SettingsSubGroup title="Календар">
        <ToggleRow
          label="Показувати тренування з Фізрука в календарі"
          description="Заплановані тренування з Фізрука зʼявляться у місячному календарі поряд зі звичками."
          checked={routine.prefs?.showFizrukInCalendar !== false}
          onChange={(checked) => updatePref("showFizrukInCalendar", checked)}
        />
        <ToggleRow
          label="Показувати планові платежі підписок Фініка в календарі"
          description="Майбутні списання за підписками зʼявлятимуться у календарі рутини поруч із завданнями дня."
          checked={routine.prefs?.showFinykSubscriptionsInCalendar !== false}
          onChange={(checked) =>
            updatePref("showFinykSubscriptionsInCalendar", checked)
          }
        />
      </SettingsSubGroup>

      <SettingsSubGroup title="Звички">
        <div className="space-y-4">
          <p className="text-xs text-subtle leading-snug">
            Нові звички додаються через кнопку «+» в центрі нижньої навігації
            «Рутини». Тут можна редагувати, архівувати й видаляти наявні.
          </p>

          <ActiveHabitsSection
            routine={routine}
            setRoutine={setRoutine}
            editingId={editingId}
            onEdit={(h) => {
              setEditingId(h.id);
              setEditDialogFocusTick((t) => t + 1);
            }}
            onCancelEditIf={(id) => {
              if (editingId === id) closeEditDialog();
            }}
            onOpenDetails={(id) => setDetailHabitId(id)}
            onRequestDelete={(pending) => setDeleteHabitPending(pending)}
          />

          <ArchivedHabitsSection
            routine={routine}
            setRoutine={setRoutine}
            onRequestDelete={(pending) => setDeleteHabitPending(pending)}
          />
        </div>
      </SettingsSubGroup>

      <SettingsSubGroup title="Теги та категорії">
        <div className="space-y-4">
          <TagsSection
            routine={routine}
            setRoutine={setRoutine}
            tagDraft={tagDraft}
            setTagDraft={setTagDraft}
          />
          <CategoriesSection
            routine={routine}
            setRoutine={setRoutine}
            catDraft={catDraft}
            setCatDraft={setCatDraft}
          />
        </div>
      </SettingsSubGroup>

      <HabitQuickCreateDialog
        open={!!editingId}
        routine={routine}
        setRoutine={setRoutine}
        onClose={closeEditDialog}
        editingId={editingId}
        focusTick={editDialogFocusTick}
      />

      <ConfirmDialog
        open={!!deleteHabitPending}
        title={
          deleteHabitPending?.archived
            ? `Видалити «${deleteHabitPending?.name}» назавжди?`
            : `Видалити звичку «${deleteHabitPending?.name}»?`
        }
        description={
          deleteHabitPending?.archived
            ? "Звичку буде видалено повністю разом з усіма відмітками."
            : "Відмітки по днях теж зникнуть. Замість видалення можна відправити звичку в архів."
        }
        confirmLabel="Видалити"
        onConfirm={() => {
          if (deleteHabitPending) {
            const pending = deleteHabitPending;
            let snapshot: ReturnType<typeof snapshotHabit> = null;
            setRoutine((s) => {
              snapshot = snapshotHabit(s, pending.id);
              return deleteHabit(s, pending.id);
            });
            if (!pending.archived && editingId === pending.id) {
              closeEditDialog();
            }
            if (snapshot) {
              showUndoToast(toast, {
                msg: `Видалено звичку «${pending.name}»`,
                onUndo: () => setRoutine((s) => restoreHabit(s, snapshot)),
              });
            }
          }
          setDeleteHabitPending(null);
        }}
        onCancel={() => setDeleteHabitPending(null)}
      />

      {detailHabitId && (
        <HabitDetailSheet
          habitId={detailHabitId}
          routine={routine}
          onClose={() => setDetailHabitId(null)}
        />
      )}
    </SettingsGroup>
  );
}
