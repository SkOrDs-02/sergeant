/**
 * Last validated: 2026-05-14
 * Status: Active
 */
import { useMemo, useState } from "react";
import type { Dispatch, SetStateAction } from "react";
import { Button } from "@shared/components/ui/Button";
import { SectionHeading } from "@shared/components/ui/SectionHeading";
import { Sheet } from "@shared/components/ui/Sheet";
import { ConfirmDialog } from "@shared/components/ui/ConfirmDialog";
import { useToast } from "@shared/hooks/useToast";
import { showUndoToast } from "@shared/lib/ui/undoToast";
import { messages } from "@shared/i18n/uk";
import { completionNoteKey } from "../lib/completionNoteKey";
import { anchoredTodayKey } from "../lib/dayAnchor";
import {
  deleteHabit,
  restoreHabit,
  setHabitArchived,
  snapshotHabit,
} from "../lib/routineStorage";
import { RECURRENCE_OPTIONS, WEEKDAY_LABELS } from "../lib/routineConstants";
import { HabitQuickCreateDialog } from "./HabitQuickCreateDialog";
import { HabitMonthCalendar } from "./HabitMonthCalendar";
import { HabitPauseSection } from "./HabitPauseSection";
import { HabitStatsSection } from "./HabitStatsSection";
import { HabitStreakCanvas } from "./HabitStreakCanvas";
import type { Habit, RoutineState } from "../lib/types";
import { HabitGlyph } from "./HabitGlyph";
import { fillName } from "../lib/fillName";

function todayKey(): string {
  // Делегат на `lib/dayAnchor` — анкер доби routine і його мітка
  // `ROUTINE_DAY_ANCHOR` (яку журнал відміток пише в `day_anchor`)
  // мусять жити в одному файлі, інакше вони знову розійдуться.
  return anchoredTodayKey();
}

export interface HabitDetailSheetProps {
  habitId: string;
  routine: RoutineState;
  onClose: () => void;
  /**
   * When provided, the details sheet exposes desktop-reachable
   * «Редагувати» / «Видалити» actions in its footer. Editing reuses the
   * shared `HabitQuickCreateDialog` in edit mode; deleting goes through a
   * `ConfirmDialog` + undo-toast, mirroring the settings surface so the
   * destructive flow stays identical everywhere. Without it the sheet
   * renders read-only (callers that only show stats can omit it).
   */
  setRoutine?: Dispatch<SetStateAction<RoutineState>>;
}

interface NoteEntry {
  date: string;
  text: string;
}

export function HabitDetailSheet({
  habitId,
  routine,
  onClose,
  setRoutine,
}: HabitDetailSheetProps) {
  const toast = useToast();
  const [editOpen, setEditOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const foundHabit = routine.habits.find((h) => h.id === habitId);
  // Harness/product hardening (2026-08-04, CI critical-lane audit): the
  // sync engine can refresh `routine` from a still-catching-up SQLite read
  // (`refreshCachesAfterPull` → `refreshSqliteRoutineState`) while a
  // just-created habit's own dual-write hasn't landed locally yet — for one
  // or more renders `routine.habits` transiently omits it. Without a
  // bridge, `!habit` below unmounts this whole sheet (footer buttons
  // included), which is exactly the "resolved, then detached from the DOM,
  // retrying" loop the routine critical-flow lane hit on the footer
  // «Редагувати» button. Bridging to the last good value for the SAME
  // habitId rides out the blip; a real removal (delete/archive) always
  // pairs with an explicit `onClose()` from the caller, so this never
  // keeps a genuinely-gone habit on screen.
  const [lastGoodHabit, setLastGoodHabit] = useState<Habit | null>(
    foundHabit ?? null,
  );
  if (foundHabit && foundHabit !== lastGoodHabit) {
    setLastGoodHabit(foundHabit);
  }
  const habit =
    foundHabit ?? (lastGoodHabit?.id === habitId ? lastGoodHabit : null);
  const completions = useMemo(
    () => routine.completions[habitId] || [],
    [routine.completions, habitId],
  );
  const tk = todayKey();

  const tag = useMemo<string[]>(() => {
    if (!habit) return [];
    const ids = habit.tagIds || [];
    return ids
      .map((id) => routine.tags.find((t) => t.id === id)?.name)
      .filter((n): n is string => Boolean(n));
  }, [habit, routine.tags]);

  const category = useMemo(() => {
    if (!habit?.categoryId) return null;
    return (
      routine.categories.find((c) => c.id === habit.categoryId)?.name || null
    );
  }, [habit, routine.categories]);

  const categoryGlyph = useMemo(() => {
    if (!habit?.categoryId) return undefined;
    return routine.categories.find((c) => c.id === habit.categoryId)?.emoji;
  }, [habit, routine.categories]);

  const recLabel = habit
    ? RECURRENCE_OPTIONS.find((o) => o.value === (habit.recurrence || "daily"))
        ?.label || ""
    : "";

  const notes = useMemo<NoteEntry[]>(() => {
    const notesObj = routine.completionNotes || {};
    const items: NoteEntry[] = [];
    const sorted = [...completions].sort().reverse();
    for (const dk of sorted) {
      const k = completionNoteKey(habitId, dk);
      if (notesObj[k]) {
        items.push({ date: dk, text: notesObj[k] });
      }
      if (items.length >= 10) break;
    }
    return items;
  }, [completions, routine.completionNotes, habitId]);

  if (!habit) return null;

  const habitName = habit.name;
  const canMutate = typeof setRoutine === "function";
  const isOnce = (habit.recurrence || "daily") === "once";

  const handleConfirmDelete = () => {
    if (!setRoutine) return;
    let snapshot: ReturnType<typeof snapshotHabit> = null;
    setRoutine((s) => {
      snapshot = snapshotHabit(s, habitId);
      return deleteHabit(s, habitId);
    });
    setConfirmDelete(false);
    if (snapshot) {
      showUndoToast(toast, {
        msg: `Видалено звичку «${habitName}»`,
        onUndo: () => setRoutine((s) => restoreHabit(s, snapshot)),
      });
    }
    onClose();
  };

  // Архівування живе тут з 2026-08-03: раніше єдиним входом був список у
  // Налаштуваннях, тож користувач, що відкрив звичку з календаря, мав
  // вибір «видалити або нічого» — і видаляв разом з історією відміток.
  const handleToggleArchived = () => {
    if (!setRoutine) return;
    const nextArchived = !habit.archived;
    setRoutine((s) => setHabitArchived(s, habitId, nextArchived));
    showUndoToast(toast, {
      msg: fillName(
        nextArchived
          ? messages.routine.habitsTab.archived
          : messages.routine.habitsTab.restored,
        habitName,
      ),
      onUndo: () =>
        setRoutine((s) => setHabitArchived(s, habitId, !nextArchived)),
    });
    if (nextArchived) onClose();
  };

  const footer = canMutate ? (
    <div className="flex flex-col gap-2 sm:flex-row">
      <Button
        type="button"
        variant="secondary"
        className="flex-1"
        onClick={() => setEditOpen(true)}
      >
        {messages.actions.edit}
      </Button>
      <Button
        type="button"
        variant="secondary"
        className="flex-1"
        onClick={handleToggleArchived}
      >
        {habit.archived
          ? messages.routine.habitsTab.restoreAction
          : messages.routine.habitsTab.archiveAction}
      </Button>
      <Button
        type="button"
        variant="danger"
        className="flex-1"
        onClick={() => setConfirmDelete(true)}
      >
        {messages.actions.delete}
      </Button>
    </div>
  ) : undefined;

  const chips =
    tag.length > 0 || category ? (
      <div className="flex flex-wrap gap-1.5 mt-1.5">
        {tag.map((t) => (
          <span
            key={t}
            className="text-style-caption px-2 py-0.5 rounded-full bg-routine-soft border border-routine-soft-border text-routine-soft-fg font-medium"
          >
            {t}
          </span>
        ))}
        {category && (
          <span className="text-style-caption inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-panelHi border border-line text-muted font-medium">
            <HabitGlyph value={categoryGlyph} size="xs" optional />
            {category}
          </span>
        )}
      </div>
    ) : null;

  return (
    <>
      <Sheet
        open={!editOpen}
        onClose={onClose}
        title={
          <span className="flex items-center gap-2">
            <HabitGlyph value={habit.emoji} size="lg" />
            <span className="truncate">{habit.name}</span>
          </span>
        }
        description={chips}
        footer={footer}
        panelClassName="routine-sheet max-w-4xl"
        zIndex={200}
      >
        <div className="text-style-caption text-subtle space-y-0.5 mb-5">
          <p>
            {recLabel}
            {habit.timeOfDay ? ` · ${habit.timeOfDay}` : ""}
          </p>
          <p>
            {habit.startDate ? `з ${habit.startDate}` : ""}
            {habit.endDate ? ` до ${habit.endDate}` : ""}
            {!habit.startDate && !habit.endDate ? "Без обмежень дат" : ""}
          </p>
          {habit.recurrence === "weekly" &&
            habit.weekdays &&
            habit.weekdays.length > 0 && (
              <p>{habit.weekdays.map((i) => WEEKDAY_LABELS[i]).join(", ")}</p>
            )}
        </div>

        {/*
          Полотно серії — за ОДНУ звичку (рішення власника 2026-08-05).
          Саме тут воно чесне: пауза, «не зміг» і розклад різні в кожної
          звички, тож звести їх в одне полотно на всі звички означало б
          показати пʼять типів дня, які насправді належать різним правилам.
          Полотно на всі звички вже є окремо — `HabitHeatmap`.
        */}
        {/*
          Заголовок рендерить саме полотно (`HabitStreakCanvas` → h3), тож
          тут його немає: два однакові h3 підряд дублювались би і в тексті,
          і в heading-навігації скрінрідера.
        */}
        {/*
          Для `once` серій і відсотків не існує (канон §7 п.2, рішення
          2026-08-30): разова подія — не послідовність днів. Полотно і
          стрік/відсоткові картки ховаємо, лишається лише «Разів виконано».
        */}
        {isOnce ? null : (
          <section
            className="mb-5"
            aria-label={messages.routine.streakCanvas.heading}
          >
            <HabitStreakCanvas
              habit={habit}
              completions={completions}
              skips={routine.skips?.[habitId]}
              todayKey={tk}
            />
          </section>
        )}

        <HabitStatsSection
          habit={habit}
          completions={completions}
          todayKey={tk}
          skips={routine.skips?.[habitId]}
          isOnce={isOnce}
        />

        {setRoutine && (
          <HabitPauseSection
            habit={habit}
            todayKey={tk}
            setRoutine={setRoutine}
          />
        )}

        <HabitMonthCalendar
          habit={habit}
          completions={completions}
          todayKey={tk}
        />

        {notes.length > 0 && (
          <section className="mb-2" aria-label="Нотатки">
            <SectionHeading
              as="h3"
              size="xs"
              className="mb-2"
              variant="routine"
            >
              Останні нотатки
            </SectionHeading>
            <ul className="space-y-1.5">
              {notes.map((n) => (
                <li
                  key={n.date}
                  className="text-style-caption bg-panelHi/50 border border-line/40 rounded-xl px-3 py-2"
                >
                  <span className="text-subtle">{n.date}:</span>{" "}
                  <span className="text-text">{n.text}</span>
                </li>
              ))}
            </ul>
          </section>
        )}
      </Sheet>
      {canMutate && setRoutine && (
        <HabitQuickCreateDialog
          open={editOpen}
          routine={routine}
          setRoutine={setRoutine}
          onClose={() => setEditOpen(false)}
          editingId={habitId}
        />
      )}
      <ConfirmDialog
        open={confirmDelete}
        title={`Видалити звичку «${habitName}»?`}
        description="Відмітки по днях теж зникнуть. Дію не можна відмінити, хіба що одразу через «Скасувати» в підказці. Замість видалення можна відправити звичку в архів через Налаштування."
        confirmLabel={messages.actions.delete}
        onConfirm={handleConfirmDelete}
        onCancel={() => setConfirmDelete(false)}
      />
    </>
  );
}
