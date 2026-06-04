/**
 * Fizruk / PlanCalendar — monthly training plan screen (mobile port).
 *
 * Phase 6 / PR-G. Mobile port of
 * `apps/web/src/modules/fizruk/pages/PlanCalendar.tsx` (349 LOC). All
 * pure state + date logic lives in `@sergeant/fizruk-domain/domain/plan`
 * so mobile and web share the same `MonthlyPlanState` semantics and
 * produce byte-identical buckets of planned workouts per day.
 *
 * Scope for this PR:
 *  1. Monday-first month grid with template + planned-workout indicator
 *     per day. Today's cell is visually highlighted.
 *  2. "Today" quick-action that snaps the cursor back to the current
 *     month.
 *  3. Month-prev / month-next navigation.
 *  4. Tap-day opens a bottom `Sheet` listing planned workouts for that
 *     date and the set of `WorkoutTemplate`s the user has defined. The
 *     top "Без плану" row clears the template for the date.
 *  5. Empty-state card when the month has zero templates and zero
 *     planned workouts (with a CTA that nudges the user to Workouts).
 *
 * Intentionally OUT of scope for this PR (will come in follow-ups):
 *  - Recovery-forecast section (needs `useExerciseCatalog` / `useRecovery`
 *    on mobile — neither is ported yet).
 *  - Reminder settings UI (`reminderEnabled` / `reminderHour` /
 *    `reminderMinute`) — the hook surfaces the state but the UI lands
 *    with the Fizruk settings PR.
 *
 * Workouts are still read directly from MMKV under the shared fizruk
 * `WORKOUTS_STORAGE_KEY` because the workouts overlay path on mobile
 * uses the `useFizrukWorkouts` hook from a different surface. Workout
 * templates were migrated to SQLite in Stage 12 PR
 * #057f-tombstone-mobile-stage12 — reads now flow through the
 * `useWorkoutTemplates` hook. Wellbeing entries (used here as
 * recovery-forecast input) were migrated to SQLite in Stage 12.5 PR
 * #057f2-tombstone-mobile-stage12-5 — reads now flow through the
 * `useWellbeing` hook (cache overlay). The aggregation remains pure
 * (`aggregatePlannedByDate` from `@sergeant/fizruk-domain`) so swapping
 * to a typed hook later is a one-line change. Imports use the
 * package's subpath entrypoints (`/constants`, `/domain/plan/index`,
 * `/domain/types`) to avoid pulling in the non-strict `lib/*` JS
 * files through the top-level barrel — same pattern as `Workouts.tsx`
 * / `Atlas.tsx`.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";

import { WORKOUTS_STORAGE_KEY } from "@sergeant/fizruk-domain/constants";
import {
  aggregatePlannedByDate,
  computeRecoveryForecast,
  dateKeyFromYMD,
  monthCursorFromDate,
  monthGrid,
  monthIsEmpty,
  shiftMonthCursor,
  todayDateKey,
  type DayRecoveryForecast,
  type MonthCursor,
  type PlannedWorkoutLike,
} from "@sergeant/fizruk-domain/domain/plan/index";
import { MUSCLES_UK } from "@sergeant/fizruk-domain/data/index";
import type {
  DailyLogEntry,
  Workout,
  WorkoutTemplate,
} from "@sergeant/fizruk-domain/domain/types";

import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Sheet } from "@/components/ui/Sheet";
import { _getMMKVInstance, safeReadLS } from "@/lib/storage";

import { fizrukRouteFor } from "../shell/fizrukRoute";
import { useMonthlyPlan } from "../hooks/useMonthlyPlan";
import { useWellbeing, type WellbeingEntry } from "../hooks/useWellbeing";
import { useWorkoutTemplates } from "../hooks/useWorkoutTemplates";
import { PlanCalendarHeader } from "../components/plan/PlanCalendarHeader";
import { CalendarGrid } from "../components/plan/CalendarGrid";
import { DaySheet } from "../components/plan/DaySheet";

/** Narrow the raw MMKV payload into `PlannedWorkoutLike[]`. */
function readWorkouts(): PlannedWorkoutLike[] {
  const raw = safeReadLS<unknown>(WORKOUTS_STORAGE_KEY, []);
  if (!Array.isArray(raw)) return [];
  return raw.filter(
    (w): w is PlannedWorkoutLike =>
      !!w &&
      typeof w === "object" &&
      typeof (w as { id?: unknown }).id === "string",
  );
}

/**
 * Project the wellbeing-hook entries into the `DailyLogEntry` shape
 * expected by `computeRecoveryForecast`. `useWellbeing` persists
 * `{ date, energy, sleepHours }` (now sourced from the SQLite warm
 * cache after Stage 12.5 PR #057f2-tombstone-mobile-stage12-5) whereas
 * the recovery math reads `{ at, energyLevel, sleepHours }` — we
 * bridge the two here rather than changing either schema.
 */
function projectWellbeingForRecovery(
  entries: ReadonlyArray<Partial<WellbeingEntry>>,
): DailyLogEntry[] {
  const out: DailyLogEntry[] = [];
  for (const entry of entries) {
    if (!entry || typeof entry !== "object") continue;
    const date = typeof entry.date === "string" ? entry.date : null;
    if (!date) continue;
    out.push({
      id: date,
      at: date,
      energyLevel: typeof entry.energy === "number" ? entry.energy : null,
      sleepHours:
        typeof entry.sleepHours === "number" ? entry.sleepHours : null,
    });
  }
  return out;
}

interface OpenSheet {
  dateKey: string;
  day: number;
  templateId: string | null;
  planned: PlannedWorkoutLike[];
}

function formatMonthTitle(y: number, m: number): string {
  try {
    return new Date(y, m, 1).toLocaleDateString("uk-UA", {
      month: "long",
      year: "numeric",
    });
  } catch {
    return `${y}-${String(m + 1).padStart(2, "0")}`;
  }
}

function formatSheetTitle(key: string): string {
  try {
    return new Date(`${key}T12:00:00`).toLocaleDateString("uk-UA", {
      weekday: "long",
      day: "numeric",
      month: "long",
    });
  } catch {
    return key;
  }
}

export interface PlanCalendarProps {
  /** `Date.now()` seam for deterministic jest tests. */
  now?: Date;
  /**
   * Dependency-injected templates + workouts for jest tests. Production
   * code leaves both unset and the component reads from MMKV via
   * `safeReadLS`.
   */
  templates?: readonly WorkoutTemplate[];
  workouts?: readonly PlannedWorkoutLike[];
  /**
   * Optional daily-log seam mirroring the shape emitted by
   * `useWellbeing`. Injected by jest fixtures; production reads from
   * MMKV via `readDailyLog`.
   */
  dailyLog?: ReadonlyArray<Partial<DailyLogEntry>>;
}

export function PlanCalendar({
  now: nowOverride,
  templates: injectedTemplates,
  workouts: injectedWorkouts,
  dailyLog: injectedDailyLog,
}: PlanCalendarProps = {}) {
  const now = useMemo(() => nowOverride ?? new Date(), [nowOverride]);
  const [cursor, setCursor] = useState<MonthCursor>(() =>
    monthCursorFromDate(now),
  );

  const { days, getTemplateForDate, setDayTemplate } = useMonthlyPlan();

  // Stage 12 / PR #057f-tombstone-mobile-stage12: workout templates
  // come from the `useWorkoutTemplates` hook (SQLite cache + dual-write
  // overlay). When the screen is rendered with explicitly injected
  // templates we still respect them (test/preview path).
  const hookTemplates = useWorkoutTemplates().templates;
  const templates = useMemo<WorkoutTemplate[]>(() => {
    if (injectedTemplates) return [...injectedTemplates];
    return hookTemplates as readonly WorkoutTemplate[] as WorkoutTemplate[];
  }, [injectedTemplates, hookTemplates]);

  // Workouts are still read synchronously from MMKV here: they have
  // their own SQLite overlay via `useFizrukWorkouts` surfaces
  // elsewhere, and wiring them through this screen is out of scope
  // for the tombstone PR. We re-read on mount + whenever the MMKV
  // key changes so edits from the Workouts screen reflect here without
  // a full navigation cycle.
  const [workouts, setWorkouts] = useState<PlannedWorkoutLike[]>(() =>
    injectedWorkouts ? [...injectedWorkouts] : readWorkouts(),
  );

  // Stage 12.5 / PR #057f2-tombstone-mobile-stage12-5 — wellbeing
  // entries come from the `useWellbeing` hook (SQLite cache + dual-write
  // overlay). When the screen is rendered with explicitly injected
  // dailyLog we still respect it (test/preview path).
  const wellbeingEntries = useWellbeing().entries;
  const dailyLog = useMemo<ReadonlyArray<Partial<DailyLogEntry>>>(
    () => (injectedDailyLog ? injectedDailyLog : wellbeingEntries),
    [injectedDailyLog, wellbeingEntries],
  );

  useEffect(() => {
    if (injectedWorkouts) return;
    const mmkv = _getMMKVInstance();
    const sub = mmkv.addOnValueChangedListener((key) => {
      if (key === WORKOUTS_STORAGE_KEY) {
        setWorkouts(readWorkouts());
      }
    });
    return () => sub.remove();
  }, [injectedWorkouts]);

  const plannedByDate = useMemo(
    () => aggregatePlannedByDate(workouts),
    [workouts],
  );

  const { cells } = useMemo(
    () => monthGrid(cursor.y, cursor.m),
    [cursor.y, cursor.m],
  );

  // Recovery forecast keyed by date for every numbered cell in the
  // current month grid. Treats workouts as `Partial<Workout>[]` — the
  // MMKV payload only overlaps partially with the strict type, which
  // is exactly what `computeRecoveryForecast` accepts.
  const recoveryForecast = useMemo<Record<string, DayRecoveryForecast>>(() => {
    const keys: string[] = [];
    for (const day of cells) {
      if (day == null) continue;
      keys.push(dateKeyFromYMD(cursor.y, cursor.m, day));
    }
    return computeRecoveryForecast(
      keys,
      workouts as ReadonlyArray<Partial<Workout>>,
      MUSCLES_UK,
      {
        nowMs: now.getTime(),
        dailyLogEntries: projectWellbeingForRecovery(dailyLog),
      },
    );
  }, [cells, cursor.y, cursor.m, workouts, dailyLog, now]);

  const monthTitle = useMemo(
    () => formatMonthTitle(cursor.y, cursor.m),
    [cursor.y, cursor.m],
  );

  const isEmpty = useMemo(
    () =>
      monthIsEmpty(
        { reminderEnabled: true, reminderHour: 0, reminderMinute: 0, days },
        plannedByDate,
        cursor.y,
        cursor.m,
      ),
    [days, plannedByDate, cursor.y, cursor.m],
  );

  const todayKey = useMemo(() => todayDateKey(now), [now]);
  const [sheet, setSheet] = useState<OpenSheet | null>(null);

  const go = useCallback((delta: number) => {
    setCursor((c) => shiftMonthCursor(c, delta));
  }, []);

  const goToday = useCallback(() => {
    setCursor(monthCursorFromDate(now));
  }, [now]);

  const openDay = useCallback(
    (day: number) => {
      const key = dateKeyFromYMD(cursor.y, cursor.m, day);
      setSheet({
        dateKey: key,
        day,
        templateId: getTemplateForDate(key),
        planned: plannedByDate[key] ?? [],
      });
    },
    [cursor.y, cursor.m, getTemplateForDate, plannedByDate],
  );

  const sheetForecast = sheet ? recoveryForecast[sheet.dateKey] : null;

  const applySheet = useCallback(
    (templateId: string | null) => {
      if (!sheet) return;
      setDayTemplate(sheet.dateKey, templateId);
      setSheet(null);
    },
    [sheet, setDayTemplate],
  );

  const closeSheet = useCallback(() => setSheet(null), []);

  const templateSummary =
    days && Object.keys(days).length > 0
      ? `${Object.keys(days).length} днів із шаблоном`
      : "Ще немає призначених шаблонів";

  return (
    <SafeAreaView className="flex-1 bg-cream-50" edges={["bottom"]}>
      <ScrollView
        className="flex-1"
        contentContainerStyle={{ padding: 16, paddingBottom: 32, gap: 14 }}
      >
        <View>
          <Text className="text-[22px] font-bold text-fg">План на місяць</Text>
          <Text className="text-sm text-fg-muted">
            Шаблон тренування на кожен день + заплановані сесії.
          </Text>
        </View>

        <Card radius="lg" padding="md">
          <PlanCalendarHeader
            monthTitle={monthTitle}
            templateSummary={templateSummary}
            onPrevMonth={() => go(-1)}
            onNextMonth={() => go(1)}
            onGoToday={goToday}
          />

          <CalendarGrid
            year={cursor.y}
            month={cursor.m}
            cells={cells}
            todayKey={todayKey}
            days={days}
            templates={templates}
            plannedByDate={plannedByDate}
            recoveryForecast={recoveryForecast}
            onDayPress={openDay}
          />

          <Text className="text-[11px] text-fg-muted mt-3">
            Натисни день, щоб призначити або зняти шаблон.
          </Text>
        </Card>

        {isEmpty ? (
          <Card radius="lg" padding="lg">
            <Text className="text-sm font-semibold text-fg">
              Порожній місяць
            </Text>
            <Text className="text-xs text-fg-muted leading-snug mt-1">
              Ще немає ні шаблонів на день, ні запланованих тренувань. Створи
              перше тренування або шаблон — і вони з&apos;являться тут.
            </Text>
            <View className="mt-3">
              <Button
                variant="fizruk"
                size="md"
                onPress={() => router.push(fizrukRouteFor("workouts"))}
                accessibilityLabel="Перейти до тренувань"
              >
                До тренувань
              </Button>
            </View>
          </Card>
        ) : null}
      </ScrollView>

      <Sheet
        open={!!sheet}
        onClose={closeSheet}
        title={sheet ? formatSheetTitle(sheet.dateKey) : ""}
        footer={
          <Button
            variant="ghost"
            size="md"
            onPress={closeSheet}
            accessibilityLabel="Закрити"
          >
            Закрити
          </Button>
        }
      >
        {sheet ? (
          <DaySheet
            templateId={sheet.templateId}
            planned={sheet.planned}
            forecast={sheetForecast ?? null}
            templates={templates}
            onApply={applySheet}
          />
        ) : null}
      </Sheet>
    </SafeAreaView>
  );
}

export default PlanCalendar;
