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
import { HABITS_FOCUS_FALLBACK } from "./habits/focusFallback";
import { focusFallbackTarget } from "@shared/lib/ui/focusFallback";
import { ArchivedHabitsSection } from "./habits/ArchivedHabitsSection";
import { HabitDetailSheet } from "./HabitDetailSheet";
import { HabitQuickCreateDialog } from "./HabitQuickCreateDialog";
import { FORM_DRAFT_IDS, peekFormDraft } from "@shared/lib/storage/formDrafts";

const COPY = messages.routine.habitsTab;

export interface RoutineHabitsPanelProps {
  routine: RoutineState;
  setRoutine: Dispatch<SetStateAction<RoutineState>>;
  hidden?: boolean;
}

const habitsFocusFallback = focusFallbackTarget(HABITS_FOCUS_FALLBACK);

export function RoutineHabitsPanel({
  routine,
  setRoutine,
  hidden,
}: RoutineHabitsPanelProps) {
  const toast = useToast();
  const [editingId, setEditingId] = useState<string | null>(null);
  // Недописана нова звичка переживає замок застосунку (sec-13): діалог
  // відкривається з чернеткою, яку лишив `HabitQuickCreateDialog`.
  const [creatingHabit, setCreatingHabit] = useState(
    () => peekFormDraft(FORM_DRAFT_IDS.routineHabit) !== null,
  );
  const [editDialogFocusTick, setEditDialogFocusTick] = useState(0);
  const [detailHabitId, setDetailHabitId] = useState<string | null>(null);
  const [deleteHabitPending, setDeleteHabitPending] =
    useState<PendingHabitDeletion | null>(null);

  const closeHabitDialog = () => {
    setEditingId(null);
    setCreatingHabit(false);
  };

  return (
    <div
      role="tabpanel"
      id="routine-panel-habits"
      aria-labelledby="routine-tab-habits"
      hidden={hidden}
      className="space-y-7"
    >
      <ActiveHabitsSection
        routine={routine}
        setRoutine={setRoutine}
        editingId={editingId}
        onEdit={(h) => {
          setCreatingHabit(false);
          setEditingId(h.id);
          setEditDialogFocusTick((t) => t + 1);
        }}
        onCancelEditIf={(id) => {
          if (editingId === id) closeHabitDialog();
        }}
        onOpenDetails={(id) => setDetailHabitId(id)}
        onCreateHabit={() => {
          setEditingId(null);
          setCreatingHabit(true);
          setEditDialogFocusTick((t) => t + 1);
        }}
        onRequestDelete={(pending) => setDeleteHabitPending(pending)}
      />

      <ArchivedHabitsSection
        routine={routine}
        setRoutine={setRoutine}
        onRequestDelete={(pending) => setDeleteHabitPending(pending)}
      />

      <HabitQuickCreateDialog
        open={creatingHabit || !!editingId}
        routine={routine}
        setRoutine={setRoutine}
        onClose={closeHabitDialog}
        editingId={editingId}
        focusTick={editDialogFocusTick}
        returnFocusFallback={habitsFocusFallback}
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
              closeHabitDialog();
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
        returnFocusFallback={habitsFocusFallback}
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
