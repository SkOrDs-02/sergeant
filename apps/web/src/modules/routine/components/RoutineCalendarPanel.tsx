/**
 * Last validated: 2026-05-19
 * Status: Active
 */
import { useEffect, useMemo, useState, type ChangeEvent } from "react";
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
import { useCompletionNoteDrafts } from "../hooks/useCompletionNoteDrafts";
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
import {
  useRoutineCalendarActions,
  useRoutineCalendarData,
} from "../context/RoutineCalendarContext";
import { InsightCard } from "@shared/components/ui/InsightCard";
import { useStreakRecordPendingInsight } from "../hooks/useStreakRecordPendingInsight";
import { useTodoEveningInsight } from "../hooks/useTodoEveningInsight";
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

  const streakInsight = useStreakRecordPendingInsight(routine);
  const eveningInsight = useTodoEveningInsight(routine);

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

  // Completion-note draft store (debounced 300 ms flush + unmount safety)
  // lives in `hooks/useCompletionNoteDrafts.ts` so this panel stays under
  // the `max-lines:600` Hard Rule. See the hook for the WHY (keystroke
  // localStorage thrash) and unmount-flush invariant.
  const {
    noteDrafts,
    noteDraftsRef,
    noteExpanded,
    setNoteExpanded,
    scheduleNoteFlush,
    flushNoteDraft,
  } = useCompletionNoteDrafts(setRoutine);

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

      {/* Phase 5c — routine insight triggers (streak-record-pending,
          todo-evening). At most 2 simultaneously; each card is independently
          dismissible via useInsightDismissal (localStorage-backed). */}
      {(streakInsight ?? eveningInsight) && (
        <div className="flex flex-col gap-1.5">
          {streakInsight && (
            <InsightCard
              id={streakInsight.id}
              title={streakInsight.title}
              subtitle={streakInsight.subtitle}
              onActivate={() => applyTimeMode("today")}
            />
          )}
          {eveningInsight && (
            <InsightCard
              id={eveningInsight.id}
              title={eveningInsight.title}
              subtitle={eveningInsight.subtitle}
              onActivate={() => applyTimeMode("today")}
            />
          )}
        </div>
      )}

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
          <p className="mt-2 text-center text-style-caption text-subtle">
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

      <div
        className="flex flex-wrap gap-1.5 items-center"
        role="group"
        aria-label="Фільтр за тегом"
      >
        <SectionHeading as="span" size="xs" className="w-full sm:w-auto">
          Теги
        </SectionHeading>
        <button
          type="button"
          aria-pressed={tagFilter === null}
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
            aria-pressed={tagFilter === "__fizruk"}
            onClick={() =>
              setTagFilter((f) => (f === "__fizruk" ? null : "__fizruk"))
            }
            className={cn(
              "text-style-caption px-2.5 py-1.5 rounded-full border",
              tagFilter === "__fizruk"
                ? "border-info/50 bg-info/10 text-text"
                : C.chipOff,
            )}
          >
            {FIZRUK_GROUP_LABEL}
          </button>
        )}
        {routine.prefs.showFinykSubscriptionsInCalendar !== false && (
          <button
            type="button"
            aria-pressed={tagFilter === "__finyk_sub"}
            onClick={() =>
              setTagFilter((f) => (f === "__finyk_sub" ? null : "__finyk_sub"))
            }
            className={cn(
              "text-style-caption px-2.5 py-1.5 rounded-full border max-w-[200px] truncate",
              tagFilter === "__finyk_sub"
                ? "border-success/40 bg-success/10 text-text"
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
            aria-pressed={tagFilter === name}
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
                variant="secondary"
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
                {/* Inline link inside body text — WCAG 2.5.5 exception
                    "inline links in flowing text". data-compact opts out of
                    the global 44×44 floor so the text baseline stays aligned. */}
                <button
                  type="button"
                  data-compact
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
                          ? "border-l-info"
                          : e.finykSub
                            ? "border-l-success"
                            : e.habitId
                              ? C.habitRowAccent
                              : "border-l-transparent",
                        e.completed && e.habitId && "opacity-90",
                      )}
                    >
                      <div className="flex items-start justify-between gap-3 sm:gap-2">
                        <div
                          className={cn(
                            "min-w-0 flex-1 flex flex-col justify-center",
                            (e.habitId || e.fizruk) &&
                              "cursor-pointer min-h-[44px]",
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
                              variant="secondary"
                              className="h-9! px-3! text-xs! bg-info/5"
                              type="button"
                              onClick={() => setFizrukPlanDateKey(e.date)}
                            >
                              Деталі
                            </Button>
                          )}
                          {e.finykSub && typeof onOpenModule === "function" && (
                            <Button
                              size="sm"
                              variant="secondary"
                              className="h-9! px-3! text-xs! bg-success/5"
                              type="button"
                              onClick={() =>
                                onOpenModule("finyk", { hash: "assets" })
                              }
                            >
                              Фінік
                            </Button>
                          )}
                          {e.habitId && (
                            <Button
                              iconOnly
                              size="md"
                              variant="ghost"
                              type="button"
                              onClick={() => onToggleHabit(e.habitId!, e.date)}
                              className={cn(
                                "rounded-xl border text-style-subtitle",
                                e.completed ? C.done : "border-line text-muted",
                              )}
                              aria-label={
                                e.completed ? "Скасувати виконання" : "Виконано"
                              }
                              title={e.completed ? "Скасувати" : "Виконано"}
                            >
                              {e.completed ? "✓" : "○"}
                            </Button>
                          )}
                        </div>
                      </div>
                      {e.habitId &&
                        e.completed &&
                        (() => {
                          const noteKey = completionNoteKey(e.habitId, e.date);
                          const draft = noteDrafts[noteKey];
                          const savedValue =
                            routine.completionNotes?.[noteKey] || "";
                          const value =
                            draft !== undefined ? draft.value : savedValue;
                          // Auto-expand if the row already has a note value so
                          // existing text is never hidden behind the trigger.
                          const isExpanded =
                            noteExpanded[noteKey] ?? savedValue.length > 0;
                          if (isExpanded) {
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
                                onBlur={() => {
                                  flushNoteDraft(e.habitId!, e.date);
                                  // Collapse if the user cleared the note.
                                  const flushedValue =
                                    noteDraftsRef.current[noteKey]?.value ??
                                    savedValue;
                                  if (flushedValue.trim().length === 0) {
                                    setNoteExpanded((p) => {
                                      const next = { ...p };
                                      delete next[noteKey];
                                      return next;
                                    });
                                  }
                                }}
                              />
                            );
                          }
                          return (
                            <button
                              type="button"
                              className="text-style-caption text-subtle min-h-[44px] min-w-[44px] px-1 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                              onClick={() =>
                                setNoteExpanded((p) => ({
                                  ...p,
                                  [noteKey]: true,
                                }))
                              }
                            >
                              + Нотатка
                            </button>
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
