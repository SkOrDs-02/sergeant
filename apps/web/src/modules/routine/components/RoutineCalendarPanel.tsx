import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
} from "react";
import { Virtuoso } from "react-virtuoso";
import { cn } from "@shared/lib/ui/cn";
import { SectionHeading } from "@shared/components/ui/SectionHeading";
import { Button } from "@shared/components/ui/Button";
import { Card } from "@shared/components/ui/Card";
import { Input } from "@shared/components/ui/Input";
import { Segmented } from "@shared/components/ui/Segmented";
import { EmptyState } from "@shared/components/ui/EmptyState";
import { WeekDayStrip } from "./WeekDayStrip";
import { HabitDetailSheet } from "./HabitDetailSheet";
import { FizrukDayPlanSheet } from "./FizrukDayPlanSheet";
import { SwipeToAction } from "@shared/components/ui/SwipeToAction";
import { completionNoteKey } from "../lib/completionNoteKey";
import { DayReportSheet } from "./DayReportSheet";
import { RoutineCalendarHero } from "./RoutineCalendarHero";
import { RoutineCalendarMonthGrid } from "./RoutineCalendarMonthGrid";
import {
  FIZRUK_GROUP_LABEL,
  parseDateKey,
  habitScheduledOnDate,
} from "../lib/hubCalendarAggregate";
import {
  ROUTINE_THEME as C,
  ROUTINE_TIME_MODES as TIME_MODES,
  type RoutineTimeModeId,
} from "../lib/routineConstants";
import { setCompletionNote } from "../lib/routineStorage";
import {
  useRoutineCalendarActions,
  useRoutineCalendarData,
} from "../context/RoutineCalendarContext";
import type { HubCalendarEvent } from "../lib/types";

type GroupedListItem =
  | { kind: "header"; label: string }
  | { kind: "event"; e: HubCalendarEvent };

const timeModeItems: ReadonlyArray<{
  value: RoutineTimeModeId;
  label: string;
}> = TIME_MODES.map((tm) => ({ value: tm.id, label: tm.label }));

export interface RoutineCalendarPanelProps {
  hidden?: boolean;
}

export function RoutineCalendarPanel({
  hidden: panelHidden,
}: RoutineCalendarPanelProps) {
  const {
    rangeLabel,
    headlineDate,
    filtered,
    routine,
    currentStreak,
    completionRate,
    dayProgress,
    timeMode,
    selectedDay,
    todayKey,
    shiftWeekStrip,
    setSelectedDay,
    setTimeMode,
    listQuery,
    setListQuery,
    tagFilter,
    setTagFilter,
    tagChips,
    monthCursor,
    monthTitle,
    goMonth,
    goToToday,
    cells,
    dayCounts,
    listIsEmpty,
    hasListFilter,
    hasNoHabits,
    grouped,
    canBulkMark,
  } = useRoutineCalendarData();

  const {
    applyTimeMode,
    onToggleHabit,
    setRoutine,
    onOpenModule,
    onBulkMarkDay,
    onOpenQuickAddHabit,
  } = useRoutineCalendarActions();
  const [listQueryDraft, setListQueryDraft] = useState(listQuery || "");
  useEffect(() => {
    setListQueryDraft(listQuery || "");
  }, [listQuery]);
  useEffect(() => {
    const id = setTimeout(() => setListQuery(listQueryDraft), 200);
    return () => clearTimeout(id);
  }, [listQueryDraft, setListQuery]);
  const [dayReportOpen, setDayReportOpen] = useState(false);
  const [detailHabitId, setDetailHabitId] = useState<string | null>(null);
  const [fizrukPlanDateKey, setFizrukPlanDateKey] = useState<string | null>(
    null,
  );

  // Completion-note drafts. Typing into the "Нотатка до відмітки" input used
  // to call `setRoutine` → `saveRoutineState` → `localStorage.setItem`
  // (serialising the entire routine) on every keystroke, which also
  // triggered a `postMessage` to the service worker and a re-read of the
  // full routine state via `ROUTINE_EVENT`. On larger states (many habits /
  // many completions) that produced visible input lag, especially on
  // mobile. Now keystrokes only touch local state; a debounced flush
  // persists the final value.
  type NoteDraft = { habitId: string; dateKey: string; value: string };
  const [noteDrafts, setNoteDrafts] = useState<Record<string, NoteDraft>>({});
  const noteDraftsRef = useRef(noteDrafts);
  useEffect(() => {
    noteDraftsRef.current = noteDrafts;
  }, [noteDrafts]);
  const noteTimersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(
    new Map(),
  );
  const flushNoteDraft = useCallback(
    (habitId: string, dateKey: string) => {
      const key = completionNoteKey(habitId, dateKey);
      const draft = noteDraftsRef.current[key];
      if (!draft) return;
      setRoutine((s) =>
        setCompletionNote(s, draft.habitId, draft.dateKey, draft.value),
      );
      setNoteDrafts((prev) => {
        if (!(key in prev)) return prev;
        const next = { ...prev };
        delete next[key];
        return next;
      });
    },
    [setRoutine],
  );
  const scheduleNoteFlush = useCallback(
    (habitId: string, dateKey: string, value: string) => {
      const key = completionNoteKey(habitId, dateKey);
      setNoteDrafts((prev) => ({
        ...prev,
        [key]: { habitId, dateKey, value },
      }));
      const timers = noteTimersRef.current;
      const prior = timers.get(key);
      if (prior) clearTimeout(prior);
      timers.set(
        key,
        setTimeout(() => {
          timers.delete(key);
          flushNoteDraft(habitId, dateKey);
        }, 300),
      );
    },
    [flushNoteDraft],
  );
  useEffect(() => {
    const timers = noteTimersRef.current;
    return () => {
      // Flush any outstanding drafts synchronously on unmount so nothing is
      // silently dropped when the user navigates away mid-typing.
      const drafts = Object.values(noteDraftsRef.current);
      if (drafts.length > 0) {
        setRoutine((s) => {
          let next = s;
          for (const d of drafts) {
            next = setCompletionNote(next, d.habitId, d.dateKey, d.value);
          }
          return next;
        });
      }
      for (const timer of timers.values()) clearTimeout(timer);
      timers.clear();
    };
  }, [setRoutine]);

  const flatGroupedItems = useMemo<GroupedListItem[]>(() => {
    const items: GroupedListItem[] = [];
    for (const [label, rows] of grouped || []) {
      items.push({ kind: "header", label });
      for (const e of rows || []) items.push({ kind: "event", e });
    }
    return items;
  }, [grouped]);

  const scheduledHabitsForReport = routine.habits
    .filter((h) => !h.archived && habitScheduledOnDate(h, todayKey))
    .map((h) => ({
      ...h,
      completed: (routine.completions[h.id] || []).includes(todayKey),
    }));

  const dayLabel = parseDateKey(todayKey).toLocaleDateString("uk-UA", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
  return (
    <div
      role="tabpanel"
      id="routine-panel-calendar"
      aria-labelledby="routine-tab-calendar"
      hidden={panelHidden}
      className="space-y-4"
    >
      <RoutineCalendarHero
        rangeLabel={rangeLabel}
        headlineDate={headlineDate}
        dayProgress={dayProgress}
        filteredCount={filtered.length}
        activeHabitsCount={routine.habits.filter((h) => !h.archived).length}
        completionRate={completionRate}
        currentStreak={currentStreak}
        onOpenDayReport={() => setDayReportOpen(true)}
      />

      <DayReportSheet
        open={dayReportOpen}
        onClose={() => setDayReportOpen(false)}
        dayLabel={dayLabel}
        scheduledHabits={scheduledHabitsForReport}
        onToggleHabit={onToggleHabit}
        dateKey={todayKey}
      />

      {canBulkMark && (
        <div className="flex justify-center">
          <Button
            type="button"
            className={cn("w-full max-w-md font-bold", C.primary)}
            onClick={onBulkMarkDay}
          >
            Відмітити всі звички на цей день
          </Button>
        </div>
      )}

      <Segmented
        style="soft"
        size="sm"
        variant="routine"
        ariaLabel="Часовий діапазон"
        items={timeModeItems}
        value={timeMode}
        onChange={applyTimeMode}
      />

      <Card variant="default" radius="lg" padding="sm" className="bg-panel/80">
        <SectionHeading as="p" size="xs" className="mb-2">
          Тиждень
        </SectionHeading>
        <WeekDayStrip
          anchorKey={selectedDay}
          selectedDay={selectedDay}
          todayKey={todayKey}
          onSelectDay={(k) => {
            setSelectedDay(k);
            setTimeMode("day");
          }}
          onShiftWeek={shiftWeekStrip}
        />
        {timeMode === "day" && (
          <p className="mt-2 text-center text-2xs text-subtle">
            Обрано один день — натисни «Сьогодні» або «Тиждень», щоб повернути
            зріз
          </p>
        )}
      </Card>

      <Input
        className="routine-touch-field w-full max-w-md"
        placeholder="Пошук у стрічці…"
        value={listQueryDraft}
        onChange={(e: ChangeEvent<HTMLInputElement>) =>
          setListQueryDraft(e.target.value)
        }
        aria-label="Пошук подій"
      />

      <div className="flex flex-wrap gap-1.5 items-center">
        <SectionHeading as="span" size="xs" className="w-full sm:w-auto">
          Теги
        </SectionHeading>
        <button
          type="button"
          onClick={() => setTagFilter(null)}
          className={cn(
            "text-style-caption px-2.5 py-1.5 rounded-full border",
            tagFilter === null ? C.chipOn : C.chipOff,
          )}
        >
          Усі
        </button>
        {routine.prefs.showFizrukInCalendar !== false && (
          <button
            type="button"
            onClick={() =>
              setTagFilter((f) => (f === "__fizruk" ? null : "__fizruk"))
            }
            className={cn(
              "text-style-caption px-2.5 py-1.5 rounded-full border",
              tagFilter === "__fizruk"
                ? "border-sky-400/50 bg-sky-500/10 text-text"
                : C.chipOff,
            )}
          >
            {FIZRUK_GROUP_LABEL}
          </button>
        )}
        {routine.prefs.showFinykSubscriptionsInCalendar !== false && (
          <button
            type="button"
            onClick={() =>
              setTagFilter((f) => (f === "__finyk_sub" ? null : "__finyk_sub"))
            }
            className={cn(
              "text-style-caption px-2.5 py-1.5 rounded-full border max-w-[200px] truncate",
              tagFilter === "__finyk_sub"
                ? "border-emerald-500/40 bg-emerald-500/10 text-text"
                : C.chipOff,
            )}
          >
            Підписки Фініка
          </button>
        )}
        {tagChips.map((name) => (
          <button
            key={name}
            type="button"
            onClick={() => setTagFilter((f) => (f === name ? null : name))}
            className={cn(
              "text-style-caption px-2.5 py-1.5 rounded-full border max-w-[160px] truncate",
              tagFilter === name ? C.chipOn : C.chipOff,
            )}
          >
            {name}
          </button>
        ))}
      </div>

      {timeMode === "month" && (
        <RoutineCalendarMonthGrid
          monthCursor={monthCursor}
          monthTitle={monthTitle}
          cells={cells}
          dayCounts={dayCounts}
          selectedDay={selectedDay}
          goMonth={goMonth}
          goToToday={goToToday}
          onSelectDay={setSelectedDay}
          showFizrukShortcut={routine.prefs.showFizrukInCalendar !== false}
          onPlanFizruk={setFizrukPlanDateKey}
          flatGroupedItems={flatGroupedItems}
          onToggleHabit={onToggleHabit}
        />
      )}

      <section className="space-y-4 pb-2">
        {listIsEmpty && hasListFilter && (
          <EmptyState
            title="Нічого не знайдено"
            description={`За цим фільтром подій немає${hasNoHabits ? " (і звичок ще немає)" : ""}.`}
            action={
              <Button
                type="button"
                variant="ghost"
                className="border border-line"
                onClick={() => {
                  setTagFilter(null);
                  setListQuery("");
                }}
              >
                Скинути фільтри
              </Button>
            }
          />
        )}
        {listIsEmpty && !hasListFilter && hasNoHabits && (
          <EmptyState
            className={C.emptyStateWarm}
            title="Почни з однієї звички"
            description="Потім вона зʼявиться тут і в календарі. Відтискання вже можна лічити блоком вище."
            action={
              <Button
                type="button"
                className={cn("w-full max-w-xs font-bold", C.primary)}
                onClick={() => onOpenQuickAddHabit()}
              >
                Додати звичку в «Рутина»
              </Button>
            }
          />
        )}
        {listIsEmpty && !hasListFilter && !hasNoHabits && (
          <EmptyState
            compact
            title="Порожній період"
            description={
              <>
                У цьому періоді подій немає. Перевір регулярність звичок або{" "}
                <button
                  type="button"
                  className={C.linkAccent}
                  onClick={() => setFizrukPlanDateKey(selectedDay)}
                >
                  заплануй тренування
                </button>
                .
              </>
            }
          />
        )}
        {flatGroupedItems.length > 0 && (
          <Virtuoso<GroupedListItem>
            data={flatGroupedItems}
            computeItemKey={(_, item) =>
              item.kind === "header" ? `h_${item.label}` : `e_${item.e?.id}`
            }
            itemContent={(_, item) => {
              if (item.kind === "header") {
                return (
                  <SectionHeading as="h3" size="sm" className="mb-2 mt-3">
                    {item.label}
                  </SectionHeading>
                );
              }
              const e = item.e;
              return (
                <div className="mb-2">
                  <SwipeToAction
                    onSwipeRight={
                      e.habitId && !e.completed
                        ? () => onToggleHabit(e.habitId!, e.date)
                        : undefined
                    }
                    onSwipeLeft={
                      e.habitId && e.completed
                        ? () => onToggleHabit(e.habitId!, e.date)
                        : undefined
                    }
                    leftLabel="✓ Виконано"
                    leftColor="bg-success"
                    rightLabel="↩ Скасувати"
                    rightColor="bg-muted"
                  >
                    <div
                      className={cn(
                        "overflow-hidden rounded-2xl border border-line bg-panel pl-4 pr-4 py-3 shadow-card flex flex-col gap-2 border-l-4",
                        e.fizruk
                          ? "border-l-sky-500"
                          : e.finykSub
                            ? "border-l-emerald-500"
                            : e.habitId
                              ? C.habitRowAccent
                              : "border-l-transparent",
                        e.completed && e.habitId && "opacity-90",
                      )}
                    >
                      <div className="flex items-start justify-between gap-3 sm:gap-2">
                        <div
                          className={cn(
                            "min-w-0 flex-1",
                            (e.habitId || e.fizruk) && "cursor-pointer",
                          )}
                          role={e.habitId || e.fizruk ? "button" : undefined}
                          tabIndex={e.habitId || e.fizruk ? 0 : undefined}
                          onClick={() => {
                            if (e.habitId) setDetailHabitId(e.habitId);
                            else if (e.fizruk) setFizrukPlanDateKey(e.date);
                          }}
                          onKeyDown={(ev) => {
                            if (
                              (e.habitId || e.fizruk) &&
                              (ev.key === "Enter" || ev.key === " ")
                            ) {
                              ev.preventDefault();
                              if (e.habitId) setDetailHabitId(e.habitId);
                              else if (e.fizruk) setFizrukPlanDateKey(e.date);
                            }
                          }}
                          aria-label={
                            e.habitId
                              ? `Деталі: ${e.title}`
                              : e.fizruk
                                ? `План тренування: ${e.title}`
                                : undefined
                          }
                        >
                          <p className="font-semibold text-text text-base leading-snug">
                            {e.title}
                          </p>
                          <p className="text-xs text-subtle mt-0.5">
                            {parseDateKey(e.date).toLocaleDateString("uk-UA", {
                              weekday: "short",
                              day: "numeric",
                              month: "short",
                            })}{" "}
                            · {e.subtitle}
                          </p>
                        </div>
                        <div className="flex items-start gap-2 shrink-0">
                          {e.fizruk && (
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-9! px-3! text-xs! border border-sky-400/30 bg-sky-500/5"
                              type="button"
                              onClick={() => setFizrukPlanDateKey(e.date)}
                            >
                              Деталі
                            </Button>
                          )}
                          {e.finykSub && typeof onOpenModule === "function" && (
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-9! px-3! text-xs! border border-emerald-500/25 bg-emerald-500/5"
                              type="button"
                              onClick={() =>
                                onOpenModule("finyk", { hash: "assets" })
                              }
                            >
                              Фінік
                            </Button>
                          )}
                          {e.habitId && (
                            <button
                              type="button"
                              onClick={() => onToggleHabit(e.habitId!, e.date)}
                              className={cn(
                                "w-10 h-10 rounded-xl border flex items-center justify-center text-base font-bold transition-colors",
                                e.completed
                                  ? C.done
                                  : "border-line hover:bg-panelHi text-muted",
                              )}
                              aria-label={
                                e.completed ? "Скасувати виконання" : "Виконано"
                              }
                              title={e.completed ? "Скасувати" : "Виконано"}
                            >
                              {e.completed ? "✓" : "○"}
                            </button>
                          )}
                        </div>
                      </div>
                      {e.habitId &&
                        e.completed &&
                        (() => {
                          const noteKey = completionNoteKey(e.habitId, e.date);
                          const draft = noteDrafts[noteKey];
                          const value =
                            draft !== undefined
                              ? draft.value
                              : routine.completionNotes?.[noteKey] || "";
                          return (
                            <Input
                              className="routine-touch-field w-full min-w-0"
                              placeholder="Нотатка до відмітки"
                              value={value}
                              onChange={(ev) =>
                                scheduleNoteFlush(
                                  e.habitId!,
                                  e.date,
                                  ev.target.value,
                                )
                              }
                              onBlur={() => flushNoteDraft(e.habitId!, e.date)}
                            />
                          );
                        })()}
                    </div>
                  </SwipeToAction>
                </div>
              );
            }}
          />
        )}
      </section>
      {detailHabitId && (
        <HabitDetailSheet
          habitId={detailHabitId}
          routine={routine}
          onClose={() => setDetailHabitId(null)}
        />
      )}
      <FizrukDayPlanSheet
        dateKey={fizrukPlanDateKey}
        onClose={() => setFizrukPlanDateKey(null)}
      />
    </div>
  );
}
