/**
 * Last validated: 2026-05-19
 * Status: Active
 */
import { useEffect, useMemo, useState, type ChangeEvent } from "react";
import { cn } from "@shared/lib/ui/cn";
import { SectionHeading } from "@shared/components/ui/SectionHeading";
import { Button } from "@shared/components/ui/Button";
import { Card } from "@shared/components/ui/Card";
import { Input } from "@shared/components/ui/Input";
import { searchFieldProps } from "@shared/lib/ui/searchFieldProps";
import { Segmented } from "@shared/components/ui/Segmented";
import { EmptyState } from "@shared/components/ui/EmptyState";
import { WeekDayStrip, WeekShiftControls } from "./WeekDayStrip";
import { HabitDetailSheet } from "./HabitDetailSheet";
import { FizrukDayPlanSheet } from "@fizruk/components/planning/FizrukDayPlanSheet";
import { SwipeToAction } from "@shared/components/ui/SwipeToAction";
import { completionNoteKey } from "../lib/completionNoteKey";
import { useCompletionNoteDrafts } from "../hooks/useCompletionNoteDrafts";
import { DayReportSheet } from "./DayReportSheet";
import type { HabitSkip } from "@sergeant/routine-domain";
import { RoutineCalendarHero } from "./RoutineCalendarHero";
import { RoutineCalendarMonthGrid } from "./RoutineCalendarMonthGrid";
import { RoutineFilterChips } from "./RoutineFilterChips";
import {
  parseDateKey,
  habitScheduledOnDate,
} from "../lib/hubCalendarAggregate";
import { addDays, dateKeyFromDate } from "../lib/weekUtils";
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
import { emitHubBus } from "@shared/lib/modules/hubBus";
import { useAskAiQuotaExhausted } from "@shared/lib/insights/useAskAiQuota";
import { useStreakRecordPendingInsight } from "../hooks/useStreakRecordPendingInsight";
import { useTodoEveningInsight } from "../hooks/useTodoEveningInsight";
import type { HubCalendarEvent } from "../lib/types";
import { Icon } from "@shared/components/ui/Icon";
import { formatUaWeekdayDate } from "@shared/lib/time/uaWeekdayDate";

type GroupedListItem =
  { kind: "header"; label: string } | { kind: "event"; e: HubCalendarEvent };

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
    onSetHabitSkip,
    onClearHabitSkip,
  } = useRoutineCalendarActions();

  const streakInsight = useStreakRecordPendingInsight(routine);
  const eveningInsight = useTodoEveningInsight(routine);
  const askAiDisabled = useAskAiQuotaExhausted();

  const [listQueryDraft, setListQueryDraft] = useState(listQuery || "");
  const [prevListQuery, setPrevListQuery] = useState(listQuery);
  if (listQuery !== prevListQuery) {
    setPrevListQuery(listQuery);
    setListQueryDraft(listQuery || "");
  }
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

  // Позначки «не зміг» саме за цей день, зведені в `habitId → HabitSkip`.
  const skipsForToday = useMemo(() => {
    const out: Record<string, HabitSkip> = {};
    for (const [habitId, byDate] of Object.entries(routine.skips || {})) {
      const s = byDate?.[todayKey];
      if (s) out[habitId] = s;
    }
    return out;
  }, [routine.skips, todayKey]);

  // Завтрашній ключ для узгодження стрічки з чипами (див. `onSelectDay`).
  const tomorrowKey = useMemo(
    () => dateKeyFromDate(addDays(parseDateKey(todayKey), 1)),
    [todayKey],
  );

  const dayLabel = formatUaWeekdayDate(parseDateKey(todayKey), {
    withYear: true,
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
        timeMode={timeMode}
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
              onAskAi={() =>
                emitHubBus("openChat", {
                  message: streakInsight.askAiPrompt,
                  autoSend: false,
                })
              }
              askAiDisabled={askAiDisabled}
            />
          )}
          {eveningInsight && (
            <InsightCard
              id={eveningInsight.id}
              title={eveningInsight.title}
              subtitle={eveningInsight.subtitle}
              onActivate={() => applyTimeMode("today")}
              onAskAi={() =>
                emitHubBus("openChat", {
                  message: eveningInsight.askAiPrompt,
                  autoSend: false,
                })
              }
              askAiDisabled={askAiDisabled}
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
        skipsForDay={skipsForToday}
        onSetSkip={(habitId, reason) =>
          onSetHabitSkip(habitId, todayKey, reason)
        }
        onClearSkip={(habitId) => onClearHabitSkip(habitId, todayKey)}
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

      {/* Підпис над чипами — репорт тестера 2026-08-17: голий ряд
          «Сьогодні / Завтра / Тиждень / Місяць» читався як перемикач
          статистики, хоча він фільтрує список нижче (найпростіший доказ, що
          це не звіт — чип «Завтра»). Копірайт розводить дві поверхні
          словами; сама статистика живе на вкладці «Статистика». */}
      <div className="flex flex-col gap-1.5">
        <SectionHeading as="p" size="xs" variant="routine">
          Показувати у стрічці
        </SectionHeading>
        <p className="text-style-body text-subtle">
          Фільтр списку нижче. Підсумки – на вкладці «Статистика».
        </p>

        <Segmented
          style="soft"
          size="sm"
          variant="routine"
          ariaLabel="Діапазон стрічки"
          // AI-DANGER: без `overflow-x-auto` навмисно. Чотири чипи діапазону
          // вміщаються в найвужчий підтримуваний екран, а якщо колись не
          // вмістяться — перенесуться рядком (`flex-wrap` у `Segmented`).
          // Горизонтальний скролер тут не потрібен, зате він створював
          // композиторний шар, який iOS малював зі зсувом: заливка обраного
          // чипа зʼявлялась на сусідньому ПРАВОРУЧ (обрано «Тиждень» —
          // рожевий «Місяць»). Репорт власника 2026-08-17, підтверджено
          // зсувом на двох незалежних рядах.
          className="[&>button]:shrink-0"
          items={timeModeItems}
          value={timeMode}
          onChange={applyTimeMode}
        />
      </div>

      <Card variant="default" radius="lg" padding="sm" className="bg-panel/80">
        {/* Шеврони тут, а не в ряду днів: там вони забирали 100px і не давали
            сімці клітинок влізти без скролера (див. `WeekDayStrip`). */}
        <div className="mb-2 flex items-center justify-between gap-2">
          <SectionHeading as="p" size="xs" variant="routine">
            Тиждень
          </SectionHeading>
          <WeekShiftControls onShiftWeek={shiftWeekStrip} />
        </div>
        <WeekDayStrip
          anchorKey={selectedDay}
          selectedDay={selectedDay}
          todayKey={todayKey}
          onSelectDay={(k) => {
            setSelectedDay(k);
            // Стрічка узгоджена з чипами: тап по сьогоднішній даті дає режим
            // `today`, по завтрашній — `tomorrow`, і лише довільний день —
            // `day`. Раніше будь-який тап давав `day`, тож навіть після
            // вибору СЬОГОДНІ знизу висів припис «Обрано один день…», і
            // зняти його можна було тільки чипом (репорт власника
            // 2026-08-17). Діапазон від цього не змінюється: для
            // `today`/`tomorrow` він такий самий однодневний, як для `day`
            // із тією ж датою (`useRoutineDerivedData` § range).
            setTimeMode(
              k === todayKey ? "today" : k === tomorrowKey ? "tomorrow" : "day",
            );
          }}
        />
        {timeMode === "day" && (
          <p className="mt-2 text-center text-style-caption text-subtle">
            Обрано один день, натисни «Сьогодні» або «Тиждень», щоб повернути
            зріз
          </p>
        )}
      </Card>

      <Input
        className="routine-touch-field w-full max-w-md"
        {...searchFieldProps("routine-feed-search")}
        placeholder="Пошук у стрічці…"
        value={listQueryDraft}
        onChange={(e: ChangeEvent<HTMLInputElement>) =>
          setListQueryDraft(e.target.value)
        }
        aria-label="Пошук подій"
      />

      <RoutineFilterChips
        tagFilter={tagFilter}
        setTagFilter={setTagFilter}
        onClearFilter={() => setTagFilter(null)}
        tagChips={tagChips}
        showFizruk={routine.prefs.showFizrukInCalendar !== false}
        showFinykSubs={routine.prefs.showFinykSubscriptionsInCalendar !== false}
      />

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
            description="Потім вона зʼявиться тут і в календарі, з відмітками по днях."
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
          // Per-day habit list is small (typically <20 items), so a plain map
          // is simpler and avoids Virtuoso's zero-height container problem when
          // the component lives in a normal page flow without a bounded scroll
          // container.
          <div>
            {flatGroupedItems.map((item) => {
              const key =
                item.kind === "header" ? `h_${item.label}` : `e_${item.e?.id}`;
              if (item.kind === "header") {
                return (
                  <SectionHeading
                    key={key}
                    as="h3"
                    size="xs"
                    className="mb-2 mt-3"
                    variant="routine"
                  >
                    {item.label}
                  </SectionHeading>
                );
              }
              const e = item.e;
              // Capture as a const so TypeScript narrows it to `string` inside
              // the guarded closures below without a non-null assertion.
              const habitId = e.habitId;
              return (
                <div key={key} className="mb-2">
                  <SwipeToAction
                    onSwipeRight={
                      habitId && !e.completed
                        ? () => onToggleHabit(habitId, e.date)
                        : undefined
                    }
                    onSwipeLeft={
                      habitId && e.completed
                        ? () => onToggleHabit(habitId, e.date)
                        : undefined
                    }
                    leftLabel="Виконано"
                    leftColor="bg-success"
                    rightLabel="Скасувати"
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
                          <p className="font-semibold text-text text-style-body leading-snug">
                            {e.title}
                          </p>
                          <p className="text-style-caption text-subtle mt-0.5">
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
                          {habitId && (
                            <Button
                              iconOnly
                              size="md"
                              variant="ghost"
                              type="button"
                              onClick={() => onToggleHabit(habitId, e.date)}
                              className={cn(
                                "rounded-xl border text-style-title",
                                e.completed ? C.done : "border-line text-muted",
                              )}
                              aria-label={
                                e.completed ? "Скасувати виконання" : "Виконано"
                              }
                              title={e.completed ? "Скасувати" : "Виконано"}
                            >
                              <Icon
                                name={e.completed ? "check" : "circle-outline"}
                                size={18}
                                aria-hidden
                              />
                            </Button>
                          )}
                        </div>
                      </div>
                      {habitId &&
                        e.completed &&
                        (() => {
                          const noteKey = completionNoteKey(habitId, e.date);
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
                                    habitId,
                                    e.date,
                                    ev.target.value,
                                  )
                                }
                                onBlur={() => {
                                  flushNoteDraft(habitId, e.date);
                                  // Collapse if the user cleared the note.
                                  if (value.trim().length === 0) {
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
            })}
          </div>
        )}
      </section>
      {detailHabitId && (
        <HabitDetailSheet
          habitId={detailHabitId}
          routine={routine}
          setRoutine={setRoutine}
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
