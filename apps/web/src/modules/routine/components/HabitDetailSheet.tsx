/**
 * Last validated: 2026-05-14
 * Status: Active
 */
import { useMemo, useState } from "react";
import { Measure } from "@shared/components/ui/Measure";
import type { Dispatch, SetStateAction } from "react";
import { cn } from "@shared/lib/ui/cn";
import { Button } from "@shared/components/ui/Button";
import { Icon } from "@shared/components/ui/Icon";
import { IconButton } from "@shared/components/ui/IconButton";
import { SectionHeading } from "@shared/components/ui/SectionHeading";
import { Sheet } from "@shared/components/ui/Sheet";
import { ConfirmDialog } from "@shared/components/ui/ConfirmDialog";
import { useToast } from "@shared/hooks/useToast";
import { showUndoToast } from "@shared/lib/ui/undoToast";
import { messages } from "@shared/i18n/uk";
import { getKyivDateParts } from "@shared/lib/time/kyivTime";
import {
  dateKeyMinusDays,
  habitScheduledOnDate,
  monthGrid,
} from "@sergeant/routine-domain";
import { completionNoteKey } from "../lib/completionNoteKey";
import { anchoredTodayKey } from "../lib/dayAnchor";
import {
  flexibleStreakBreakdown,
  habitCompletionRate,
  maxStreakAllTime,
} from "../lib/streaks";
import {
  deleteHabit,
  restoreHabit,
  setHabitArchived,
  snapshotHabit,
} from "../lib/routineStorage";
import {
  ROUTINE_THEME as C,
  RECURRENCE_OPTIONS,
  WEEKDAY_LABELS,
} from "../lib/routineConstants";
import { HabitQuickCreateDialog } from "./HabitQuickCreateDialog";
import { HabitPauseSection } from "./HabitPauseSection";
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

/**
 * Rolling `days`-window completion percentage, delegated to the canonical
 * `habitCompletionRate` (unification audit 2026-08-31, finding 1.23):
 * without it, this card's own loop skipped the `once`-habit exclusion
 * (`habitCountsTowardMetrics`) that the rest of the module already
 * respects, so a one-off event showed a percentage nowhere else in the
 * product does. `habitCompletionRate` doesn't accept `skips` either, so
 * part of the divergence from the hero (which does) remains until that
 * option lands here too.
 */
function completionPct(
  habit: Habit,
  completions: string[],
  days: number,
): number | null {
  const tk = todayKey();
  const { scheduled, rate } = habitCompletionRate(
    habit,
    completions,
    dateKeyMinusDays(tk, days - 1),
    tk,
  );
  if (scheduled === 0) return null;
  return Math.round(rate * 100);
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

interface MonthCursor {
  y: number;
  m: number;
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

  // Kyiv "current month" for the calendar cursor so it matches the
  // user's domain calendar (consolidated page-audit § Theme 1 — 09 F3).
  const nowKyiv = getKyivDateParts();
  const [calMonth, setCalMonth] = useState<MonthCursor>({
    y: nowKyiv.year,
    m: nowKyiv.month - 1,
  });

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

  // Гнучкий стрік (канон §4): показуємо не лише число, а й з чого воно
  // склалось — інакше «серія 12» при двох днях відпустки всередині
  // виглядає як помилка підрахунку.
  const streak = useMemo(
    () =>
      habit
        ? flexibleStreakBreakdown(habit, completions, tk, {
            skipsForHabit: routine.skips?.[habitId],
          })
        : null,
    [habit, completions, tk, routine.skips, habitId],
  );
  const currentStreak = streak?.days ?? 0;
  // AI-CONTEXT: тут був `streakHint` — рядок «пауза: 2 дн. · не зміг: 1 дн. ·
  // заморозки: 1» під числом серії. Прибрано 2026-08-05 разом із додаванням
  // `HabitStreakCanvas` вище: полотно показує ті самі пʼять типів дня формою
  // клітинки, тобто видно, ЯКІ саме дні були паузою, а не лише скільки їх.
  // Тримати обидва означало б лишити рівно той патерн, який полотно й
  // заміняє — одне число плюс текстове виправдання під ним
  // (`docs/05-design/design/anti-slop-strategy.md` §5 P3).
  const bestStreak = useMemo(
    () => (habit ? maxStreakAllTime(habit, completions) : 0),
    [habit, completions],
  );
  const totalDone = completions.length;

  const pct7 = useMemo(
    () => (habit ? completionPct(habit, completions, 7) : null),
    [habit, completions],
  );
  const pct30 = useMemo(
    () => (habit ? completionPct(habit, completions, 30) : null),
    [habit, completions],
  );
  const pct90 = useMemo(
    () => (habit ? completionPct(habit, completions, 90) : null),
    [habit, completions],
  );

  const cells = useMemo(
    () => monthGrid(calMonth.y, calMonth.m).cells,
    [calMonth.y, calMonth.m],
  );
  const completionSet = useMemo(() => new Set(completions), [completions]);

  const calMonthTitle = new Date(calMonth.y, calMonth.m, 1).toLocaleDateString(
    "uk-UA",
    {
      month: "long",
      year: "numeric",
    },
  );

  const goCalMonth = (delta: number) => {
    setCalMonth((c) => {
      let m = c.m + delta;
      let y = c.y;
      if (m > 11) {
        m = 0;
        y++;
      }
      if (m < 0) {
        m = 11;
        y--;
      }
      return { y, m };
    });
  };

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

        <section className="mb-5" aria-label="Статистика">
          <SectionHeading as="h3" size="xs" className="mb-2" variant="routine">
            Статистика
          </SectionHeading>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {!isOnce && (
              <div className={C.statCard}>
                <p className="text-style-headline text-text tabular-nums">
                  {currentStreak}
                </p>
                <p className="text-style-caption text-subtle mt-0.5">
                  Поточна серія
                </p>
              </div>
            )}
            {!isOnce && (
              <div className={C.statCard}>
                <p className="text-style-headline text-text tabular-nums">
                  {bestStreak}
                </p>
                <p className="text-style-caption text-subtle mt-0.5">
                  Макс серія
                </p>
              </div>
            )}
            <div className={C.statCard}>
              <p className="text-style-headline text-text tabular-nums">
                {totalDone}
              </p>
              <p className="text-style-caption text-subtle mt-0.5">
                Разів виконано
              </p>
            </div>
            {!isOnce && (
              <div className={C.statCard}>
                <div className="flex items-baseline justify-center gap-1.5">
                  {pct7 !== null && (
                    <Measure
                      value={pct7}
                      unit="%"
                      className="text-style-label text-text"
                    />
                  )}
                  {pct30 !== null && (
                    <Measure
                      value={pct30}
                      unit="%"
                      className="text-style-caption text-muted"
                    />
                  )}
                  {pct90 !== null && (
                    <Measure
                      value={pct90}
                      unit="%"
                      className="text-style-caption text-subtle"
                    />
                  )}
                  {pct7 === null && pct30 === null && pct90 === null && (
                    <span className="text-style-label text-muted">—</span>
                  )}
                </div>
                <p className="text-style-caption text-subtle mt-0.5">
                  % за 7 / 30 / 90 д
                </p>
              </div>
            )}
          </div>
        </section>

        {setRoutine && (
          <HabitPauseSection
            habit={habit}
            todayKey={tk}
            setRoutine={setRoutine}
          />
        )}

        <section className="mb-5" aria-label="Календар виконань">
          <div className="flex items-center justify-between mb-2">
            <SectionHeading as="h3" size="xs" variant="routine">
              Календар
            </SectionHeading>
            <div className="flex items-center gap-2">
              <IconButton
                size="xs"
                variant="ghost"
                onClick={() => goCalMonth(-1)}
                className="rounded-xl border border-line text-muted"
                aria-label="Попередній місяць"
              >
                <Icon name="chevron-left" size="xs" />
              </IconButton>
              <span className="text-style-caption text-text min-w-28 text-center capitalize">
                {calMonthTitle}
              </span>
              <IconButton
                size="xs"
                variant="ghost"
                onClick={() => goCalMonth(1)}
                className="rounded-xl border border-line text-muted"
                aria-label="Наступний місяць"
              >
                <Icon name="chevron-right" size="xs" />
              </IconButton>
            </div>
          </div>
          <div className="grid grid-cols-7 gap-1">
            {WEEKDAY_LABELS.map((wd) => (
              <div
                key={wd}
                className="text-center text-style-caption text-subtle font-medium pb-1"
              >
                {wd}
              </div>
            ))}
            {cells.map((day, i) => {
              if (day === null) return <div key={`e${i}`} />;
              const dk = `${calMonth.y}-${String(calMonth.m + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
              const scheduled = habitScheduledOnDate(habit, dk);
              const done = completionSet.has(dk);
              const isToday = dk === tk;
              return (
                <div
                  key={dk}
                  className={cn(
                    "aspect-square flex items-center justify-center rounded-xl text-style-caption transition-colors",
                    done
                      ? "bg-routine-surface2 dark:bg-routine-surface-dark/15 text-routine-strong dark:text-routine border border-routine-ring/40 dark:border-routine-border-dark/30 font-bold"
                      : scheduled
                        ? "bg-panelHi/60 text-muted border border-line/30"
                        : "text-subtle/50",
                    isToday &&
                      "ring-1 ring-routine-ring/60 dark:ring-routine-border-dark/50",
                  )}
                  title={
                    done
                      ? `${dk}: виконано`
                      : scheduled
                        ? `${dk}: заплановано`
                        : dk
                  }
                >
                  {day}
                </div>
              );
            })}
          </div>
          <div className="flex items-center gap-3 mt-2 text-style-caption text-subtle">
            <span className="flex items-center gap-1">
              <span className="inline-block w-3 h-3 rounded bg-routine-surface2 dark:bg-routine-surface-dark/15 border border-routine-ring/40 dark:border-routine-border-dark/30" />
              Виконано
            </span>
            <span className="flex items-center gap-1">
              <span className="inline-block w-3 h-3 rounded bg-panelHi/60 border border-line/30" />
              Заплановано
            </span>
          </div>
        </section>

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
