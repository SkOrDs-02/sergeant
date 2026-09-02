import { useState } from "react";
import {
  normalizeWeeklyTargetHistory,
  resolveHabitGlyph,
  routineUid,
  weeklyTargetForDate,
} from "@sergeant/routine-domain";
import { useToast } from "@shared/hooks/useToast";
import { hapticSuccess } from "@shared/lib/adapters/haptic";
import { cn } from "@shared/lib/ui/cn";
import { Sheet } from "@shared/components/ui/Sheet";
import {
  classifyDateBound,
  DATE_INVALID_MESSAGE,
} from "@shared/lib/time/dateBounds";
import { FirstRunHintBanner } from "../../../core/onboarding/FirstRunHintBanner";
import { createHabit, updateHabit } from "../lib/routineStorage";
import {
  emptyHabitDraft,
  habitDraftToPatch,
  normalizeReminderTimes,
  routineTodayDate,
} from "../lib/routineDraftUtils";
import { dateKeyFromDate } from "../lib/hubCalendarAggregate";
import { Button } from "@shared/components/ui/Button";
import { HabitForm, type HabitFormErrors } from "./settings/HabitForm";
import type { Habit, HabitDraft, RoutineState } from "../lib/types";
import type { Dispatch, SetStateAction } from "react";
import { messages } from "@shared/i18n/uk";

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
  /**
   * When true, render a `<FirstRunHintBanner />` at the top of the
   * dialog framing this first habit as preliminary — used by the
   * per-module first-run flow that auto-opens the dialog on the user's
   * first Routine entry. See `core/onboarding/useModuleFirstRun.ts`.
   */
  firstRunHint?: boolean;
  /** Dismiss callback for the first-run hint banner. */
  onDismissFirstRunHint?: () => void;
}

function habitToDraft(habit: Habit): HabitDraft {
  return {
    name: habit.name || "",
    emoji: resolveHabitGlyph(habit.emoji),
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
    weeklyTarget: weeklyTargetForDate(
      habit,
      dateKeyFromDate(routineTodayDate()),
    ),
    weeklyTargetHistory: normalizeWeeklyTargetHistory(
      habit.weeklyTargetHistory,
    ),
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
  firstRunHint,
  onDismissFirstRunHint,
}: HabitQuickCreateDialogProps) {
  const toast = useToast();
  const [draft, setDraft] = useState<HabitDraft>(() => emptyHabitDraft());
  const [internalFocusTick, setInternalFocusTick] = useState(0);
  const [errors, setErrors] = useState<HabitFormErrors>({});

  const [draftId, setDraftId] = useState("");

  const [prevOpenKey, setPrevOpenKey] = useState("");
  const openKey = `${open}:${editingId ?? ""}:${focusTick ?? 0}`;
  // AI-DANGER: закриття мусить СКИДАТИ ключ, інакше повторне відкриття
  // того самого аркуша для тієї самої звички не переcіює чернетку.
  // `focusTick` тут не рятує: `HabitDetailSheet` його не передає (завжди
  // 0), тож для пари (та сама звичка, той самий тік) ключ після закриття
  // лишався рівним попередньому, умова нижче не спрацьовувала — і форма
  // показувала СТАРУ чернетку замість поточних полів звички. Зміна дати,
  // зроблена деінде (або в попередньому відкритті), у формі не бачилась
  // до перезавантаження сторінки, а «Зберегти зміни» могло записати назад
  // застарілі значення.
  if (!open && prevOpenKey !== "") {
    setPrevOpenKey("");
  }
  if (open && openKey !== prevOpenKey) {
    setPrevOpenKey(openKey);
    setDraftId(routineUid("hab"));
    if (editingId) {
      const habit = routine.habits.find((h) => h.id === editingId);
      setDraft(habit ? habitToDraft(habit) : emptyHabitDraft());
    } else {
      setDraft(emptyHabitDraft());
    }
    setErrors({});
    setInternalFocusTick((t) => t + 1);
  }

  if (errors.name && draft.name.trim()) {
    setErrors((e) => ({ ...e, name: undefined }));
  }
  if (
    errors.weekdays &&
    Array.isArray(draft.weekdays) &&
    draft.weekdays.length > 0
  ) {
    setErrors((e) => ({ ...e, weekdays: undefined }));
  }

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
    if (draft.startDate && classifyDateBound(draft.startDate) === "invalid") {
      nextErrors.startDate = DATE_INVALID_MESSAGE;
    }
    if (draft.endDate && classifyDateBound(draft.endDate) === "invalid") {
      nextErrors.endDate = DATE_INVALID_MESSAGE;
    }
    if (
      draft.startDate &&
      draft.endDate &&
      draft.endDate < draft.startDate &&
      !nextErrors.endDate
    ) {
      nextErrors.endDate = "Кінець не може бути раніше за початок.";
    }
    if (Object.values(nextErrors).some(Boolean)) {
      setErrors(nextErrors);
      // Порожня назва — найчастіший фейл сабміту, і повідомлення про нього
      // легко лишається поза полем зору (форма скролиться, кнопка «Додати»
      // внизу). Тик повертає фокус і скрол на поле назви — те саме, що
      // робить відкриття аркуша (browser QA 2026-08-05, F-011).
      if (nextErrors.name) setInternalFocusTick((t) => t + 1);
      return;
    }
    setErrors({});
    if (editingId) {
      setRoutine((s) => updateHabit(s, editingId, patch));
      hapticSuccess();
      toast.success("Звичку оновлено.");
    } else {
      // id фіксується на відкриття аркуша — подвійний тап приходить у
      // `applyCreateHabit` з тим самим id і відкидається як дубль.
      setRoutine((s) => createHabit(s, { ...patch, id: draftId }));
      hapticSuccess();
      toast.success("Звичку створено.");
    }
    onClose();
  };

  const title = editingId ? "Редагувати звичку" : "Нова звичка";

  // Sticky footer keeps the primary CTA in the viewport regardless of how
  // long the form scrolls. Without it, a habit with the advanced disclosure
  // open pushes "Додати звичку" below the fold and forces a scroll-hunt on
  // every save. Rendered via the Sheet footer slot (outside the scroll area).
  const footer = (
    <div className={cn("flex gap-2", editingId ? "flex-row" : "flex-col")}>
      {editingId && (
        <Button
          type="button"
          variant="secondary"
          className="flex-1"
          onClick={onClose}
        >
          {messages.actions.cancel}
        </Button>
      )}
      <Button
        type="button"
        variant="routine"
        className="w-full"
        onClick={handleSave}
      >
        {editingId ? "Зберегти зміни" : "Додати звичку"}
      </Button>
    </div>
  );

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={title}
      zIndex={200}
      panelClassName="max-w-md"
      footer={footer}
    >
      {firstRunHint && !editingId && (
        <FirstRunHintBanner
          variant="routine"
          title={messages.routine.firstRun.title}
          description={messages.routine.firstRun.description}
          onDismiss={onDismissFirstRunHint ?? (() => {})}
          className="mb-3"
        />
      )}
      <HabitForm
        routine={routine}
        habitDraft={draft}
        setHabitDraft={setDraft}
        editingId={editingId ?? null}
        onSave={handleSave}
        onCancel={onClose}
        focusTick={internalFocusTick}
        hideHeading
        hideActions
        errors={errors}
      />
    </Sheet>
  );
}
