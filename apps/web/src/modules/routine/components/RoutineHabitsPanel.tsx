/**
 * Last validated: 2026-08-03
 * Status: Active
 *
 * Вкладка «Звички» модуля Рутина — керування списком звичок.
 *
 * AI-CONTEXT: до 2026-08-03 цей екран жив у Налаштуваннях
 * (`core/settings/RoutineSection` → підгрупа «Звички») і дублював модуль:
 * ті самі редагувати / деталі / видалити, лише через інший вхід. Але дві
 * речі існували ТІЛЬКИ там — порядок звичок (= порядок у календарі) і
 * архів (архівувати / відновити / видалити назавжди), — тож видалити блок
 * без переносу означало б тихо втратити функціонал.
 *
 * Тому блок переїхав сюди: керування звичками тепер має один дім, усередині
 * модуля, поруч із календарем і статистикою. У Налаштуваннях лишились суто
 * налаштування — календарні тумблери, теги й категорії.
 */
import { useState, type Dispatch, type SetStateAction } from "react";
import { ConfirmDialog } from "@shared/components/ui/ConfirmDialog";
import { messages } from "@shared/i18n/uk";
import { fillName } from "../lib/fillName";
import { useToast } from "@shared/hooks/useToast";
import { showUndoToast } from "@shared/lib/ui/undoToast";
import {
  deleteHabit,
  restoreHabit,
  snapshotHabit,
} from "../lib/routineStorage";
import type { PendingHabitDeletion, RoutineState } from "../lib/types";
import { ActiveHabitsSection } from "./habits/ActiveHabitsSection";
import { ArchivedHabitsSection } from "./habits/ArchivedHabitsSection";
import { HabitDetailSheet } from "./HabitDetailSheet";
import { HabitQuickCreateDialog } from "./HabitQuickCreateDialog";

const COPY = messages.routine.habitsTab;

export interface RoutineHabitsPanelProps {
  routine: RoutineState;
  setRoutine: Dispatch<SetStateAction<RoutineState>>;
  hidden?: boolean;
  /** Перемкнути користувача на вкладку календаря (порожній стан). */
  onOpenCalendar?: () => void;
}

export function RoutineHabitsPanel({
  routine,
  setRoutine,
  hidden,
  onOpenCalendar,
}: RoutineHabitsPanelProps) {
  const toast = useToast();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDialogFocusTick, setEditDialogFocusTick] = useState(0);
  const [detailHabitId, setDetailHabitId] = useState<string | null>(null);
  const [deleteHabitPending, setDeleteHabitPending] =
    useState<PendingHabitDeletion | null>(null);

  const closeEditDialog = () => setEditingId(null);

  return (
    <div
      role="tabpanel"
      id="routine-panel-habits"
      aria-labelledby="routine-tab-habits"
      hidden={hidden}
      className="space-y-4"
    >
      <p className="text-style-body text-subtle leading-snug">{COPY.intro}</p>

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
        {...(onOpenCalendar ? { onOpenCalendar } : {})}
        onRequestDelete={(pending) => setDeleteHabitPending(pending)}
      />

      <ArchivedHabitsSection
        routine={routine}
        setRoutine={setRoutine}
        onRequestDelete={(pending) => setDeleteHabitPending(pending)}
      />

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
            ? fillName(COPY.deleteArchivedTitle, deleteHabitPending?.name ?? "")
            : fillName(COPY.deleteActiveTitle, deleteHabitPending?.name ?? "")
        }
        description={
          deleteHabitPending?.archived
            ? COPY.deleteArchivedDescription
            : COPY.deleteActiveDescription
        }
        confirmLabel={messages.actions.delete}
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
                msg: fillName(COPY.deleted, pending.name),
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
          setRoutine={setRoutine}
          onClose={() => setDetailHabitId(null)}
        />
      )}
    </div>
  );
}
