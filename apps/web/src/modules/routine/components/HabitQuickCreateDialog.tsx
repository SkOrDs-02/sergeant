import { useEffect, useRef, useState } from "react";
import { useDialogFocusTrap } from "@shared/hooks/useDialogFocusTrap";
import { useToast } from "@shared/hooks/useToast";
import { hapticSuccess } from "@shared/lib/haptic";
import { cn } from "@shared/lib/cn";
import { createHabit, updateHabit } from "../lib/routineStorage";
import {
  emptyHabitDraft,
  habitDraftToPatch,
  normalizeReminderTimes,
  routineTodayDate,
} from "../lib/routineDraftUtils";
import { dateKeyFromDate } from "../lib/hubCalendarAggregate";
import { HabitForm, type HabitFormErrors } from "./settings/HabitForm";
import type { Habit, HabitDraft, RoutineState } from "../lib/types";
import type { Dispatch, SetStateAction } from "react";

export interface HabitQuickCreateDialogProps {
  open: boolean;
  routine: RoutineState;
  setRoutine: Dispatch<SetStateAction<RoutineState>>;
  onClose: () => void;
  /**
   * When set, the dialog is in edit mode for the given habit:
   * the draft is seeded from the habit, the title switches to
   * "Редагувати звичку", and save calls `updateHabit`.
   */
  editingId?: string | null;
  /**
   * Bumped by the parent every time the dialog is opened via an external
   * trigger (central FAB, PWA `add_habit` action, FTUX hero CTA, etc.)
   * so the habit form re-focuses its name input even if the user
   * reopens the dialog after closing it.
   */
  focusTick?: number;
}

function habitToDraft(habit: Habit): HabitDraft {
  return {
    name: habit.name || "",
    emoji: habit.emoji || "✓",
    tagIds: habit.tagIds || [],
    categoryId: habit.categoryId || null,
    recurrence: habit.recurrence || "daily",
    startDate: habit.startDate || dateKeyFromDate(routineTodayDate()),
    endDate: habit.endDate || "",
    timeOfDay: habit.timeOfDay || "",
    reminderTimes: normalizeReminderTimes(habit),
    weekdays:
      Array.isArray(habit.weekdays) && habit.weekdays.length
        ? habit.weekdays
        : [0, 1, 2, 3, 4, 5, 6],
    paused: habit.paused === true,
  };
}

/**
 * Bottom-sheet dialog for creating or editing a habit. Rendered on top
 * of the current view so that adding / editing a habit never yanks the
 * user into a different tab. Uses the same rich `HabitForm` as the
 * settings surface, so fields and validation stay in sync.
 */
export function HabitQuickCreateDialog({
  open,
  routine,
  setRoutine,
  onClose,
  editingId,
  focusTick,
}: HabitQuickCreateDialogProps) {
  const ref = useRef<HTMLDivElement>(null);
  useDialogFocusTrap(open, ref, { onEscape: onClose });
  const toast = useToast();
  const [draft, setDraft] = useState<HabitDraft>(() => emptyHabitDraft());
  const [internalFocusTick, setInternalFocusTick] = useState(0);
  const [errors, setErrors] = useState<HabitFormErrors>({});

  // Seed the draft every time the dialog opens. In create mode we reset
  // to an empty draft so reopens feel fresh; in edit mode we load the
  // current habit so the form reflects its latest persisted state.
  useEffect(() => {
    if (!open) return;
    if (editingId) {
      const habit = routine.habits.find((h) => h.id === editingId);
      setDraft(habit ? habitToDraft(habit) : emptyHabitDraft());
    } else {
      setDraft(emptyHabitDraft());
    }
    setErrors({});
    setInternalFocusTick((t) => t + 1);
    // Depend on `editingId` + `focusTick` — not `routine`, otherwise the
    // draft resets on every keystroke-driven routine update.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, editingId, focusTick]);

  // Clear field errors as soon as the user touches the relevant field
  // so the red border doesn't linger once they start fixing the input.
  useEffect(() => {
    if (errors.name && draft.name.trim()) {
      setErrors((e) => ({ ...e, name: undefined }));
    }
  }, [draft.name, errors.name]);
  useEffect(() => {
    if (
      errors.weekdays &&
      Array.isArray(draft.weekdays) &&
      draft.weekdays.length > 0
    ) {
      setErrors((e) => ({ ...e, weekdays: undefined }));
    }
  }, [draft.weekdays, errors.weekdays]);

  if (!open) return null;

  const handleSave = () => {
    const patch = habitDraftToPatch(draft);
    const nextErrors: HabitFormErrors = {};
    if (!patch.name) {
      nextErrors.name = "Додай назву звички.";
    }
    if (
      patch.recurrence === "weekly" &&
      (!patch.weekdays || patch.weekdays.length === 0)
    ) {
      nextErrors.weekdays = "Обери хоча б один день тижня.";
    }
    if (nextErrors.name || nextErrors.weekdays) {
      setErrors(nextErrors);
      return;
    }
    setErrors({});
    if (editingId) {
      setRoutine((s) => updateHabit(s, editingId, patch));
      hapticSuccess();
      toast.success("Звичку оновлено.");
    } else {
      setRoutine((s) => createHabit(s, patch));
      hapticSuccess();
      toast.success("Звичку створено.");
    }
    onClose();
  };

  const title = editingId ? "Редагувати звичку" : "Нова звичка";

  return (
    <div
      className="fixed inset-0 z-[200] flex items-end justify-center sm:items-center"
      role="presentation"
    >
      <div
        className="absolute inset-0 bg-text/40 backdrop-blur-sm motion-safe:animate-fade-in"
        onClick={onClose}
        aria-hidden
      />
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-labelledby="habit-quick-create-title"
        className={cn(
          "relative z-10 w-full max-w-md mx-0 sm:mx-4",
          "bg-bg rounded-t-3xl sm:rounded-3xl shadow-float border border-line",
          "max-h-[92dvh] overflow-hidden flex flex-col",
          "motion-safe:animate-in motion-safe:slide-in-from-bottom-4 motion-safe:duration-200",
        )}
      >
        <div className="flex items-center justify-between px-5 pt-4 pb-2">
          <h2
            id="habit-quick-create-title"
            className="text-base font-bold text-text"
          >
            {title}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="focus-ring w-11 h-11 min-w-[44px] min-h-[44px] flex items-center justify-center rounded-xl text-muted hover:text-text hover:bg-panelHi transition-colors"
            aria-label="Закрити"
          >
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden
            >
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-5 pb-5">
          <HabitForm
            routine={routine}
            habitDraft={draft}
            setHabitDraft={setDraft}
            editingId={editingId ?? null}
            onSave={handleSave}
            onCancel={onClose}
            focusTick={internalFocusTick}
            hideHeading
            errors={errors}
          />
        </div>
      </div>
    </div>
  );
}
