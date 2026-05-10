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
 * `useWorkoutTemplates` hook (which overlays from the SQLite warm
 * cache). The aggregation remains pure (`aggregatePlannedByDate` from
 * `@sergeant/fizruk-domain`) so swapping to a typed hook later is a
 * one-line change. Imports use the package's subpath entrypoints
 * (`/constants`, `/domain/plan/index`, `/domain/types`) to avoid
 * pulling in the non-strict `lib/*` JS files through the top-level
 * barrel — same pattern as `Workouts.tsx` / `Atlas.tsx`.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";

import { WORKOUTS_STORAGE_KEY } from "@sergeant/fizruk-domain/constants";
import {
  aggregatePlannedByDate,
  computeRecoveryForecast,
  dateKeyFromYMD,
  describeDayRecovery,
  monthCursorFromDate,
  monthGrid,
  monthIsEmpty,
  shiftMonthCursor,
  todayDateKey,
  type DayRecoveryForecast,
  type DayRecoveryStatus,
  type MonthCursor,
  type PlannedWorkoutLike,
} from "@sergeant/fizruk-domain/domain/plan/index";
import { MUSCLES_UK } from "@sergeant/fizruk-domain/data/index";
import type {
  DailyLogEntry,
  Workout,
  WorkoutTemplate,
} from "@sergeant/fizruk-domain/domain/types";

import { STORAGE_KEYS } from "@sergeant/shared";
import type { WellbeingEntry } from "../hooks/useWellbeing";

import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Sheet } from "@/components/ui/Sheet";
import { _getMMKVInstance, safeReadLS } from "@/lib/storage";

import { fizrukRouteFor } from "../shell/fizrukRoute";
import { useMonthlyPlan } from "../hooks/useMonthlyPlan";
import { useWorkoutTemplates } from "../hooks/useWorkoutTemplates";

const WEEKDAYS = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Нд"] as const;

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
 * Narrow the raw MMKV payload for `STORAGE_KEYS.FIZRUK_WELLBEING` into
 * the `DailyLogEntry` shape expected by `computeRecoveryForecast`. The
 * wellbeing hook persists `{ date, energy, sleepHours }` whereas the
 * recovery math reads `{ at, energyLevel, sleepHours }` — we bridge the
 * two here rather than changing either schema.
 */
function readDailyLog(): DailyLogEntry[] {
  const raw = safeReadLS<unknown>(STORAGE_KEYS.FIZRUK_WELLBEING, []);
  if (!Array.isArray(raw)) return [];
  const out: DailyLogEntry[] = [];
  for (const entry of raw) {
    if (!entry || typeof entry !== "object") continue;
    const rec = entry as Partial<WellbeingEntry>;
    const date = typeof rec.date === "string" ? rec.date : null;
    if (!date) continue;
    out.push({
      id: date,
      at: date,
      energyLevel: typeof rec.energy === "number" ? rec.energy : null,
      sleepHours: typeof rec.sleepHours === "number" ? rec.sleepHours : null,
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

/**
 * Tailwind background colour for a day's recovery dot. Gray for
 * `fresh` (no recent load), green for `ready`, red for `overworked`.
 * `unknown` falls back to transparent so cells outside the forecast
 * render without a dot at all.
 */
function recoveryDotClass(
  status: DayRecoveryStatus | null | undefined,
): string {
  switch (status) {
    case "overworked":
      return "bg-red-500";
    case "ready":
      return "bg-emerald-500";
    case "fresh":
      return "bg-line";
    default:
      return "";
  }
}

function formatTime(startedAt: string | null | undefined): string | null {
  if (!startedAt) return null;
  try {
    return new Date(startedAt).toLocaleTimeString("uk-UA", {
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return null;
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

  // Workouts + daily-log are still read synchronously from MMKV here:
  // workouts have their own SQLite overlay via `useFizrukWorkouts`
  // surfaces elsewhere, and wiring them through this screen is out of
  // scope for the tombstone PR. We re-read on mount + whenever the MMKV
  // key changes so edits from the Workouts screen reflect here without
  // a full navigation cycle.
  const [workouts, setWorkouts] = useState<PlannedWorkoutLike[]>(() =>
    injectedWorkouts ? [...injectedWorkouts] : readWorkouts(),
  );
  const [dailyLog, setDailyLog] = useState<
    ReadonlyArray<Partial<DailyLogEntry>>
  >(() => (injectedDailyLog ? [...injectedDailyLog] : readDailyLog()));

  useEffect(() => {
    if (injectedWorkouts && injectedDailyLog) return;
    const mmkv = _getMMKVInstance();
    const sub = mmkv.addOnValueChangedListener((key) => {
      if (!injectedWorkouts && key === WORKOUTS_STORAGE_KEY) {
        setWorkouts(readWorkouts());
      } else if (!injectedDailyLog && key === STORAGE_KEYS.FIZRUK_WELLBEING) {
        setDailyLog(readDailyLog());
      }
    });
    return () => sub.remove();
  }, [injectedWorkouts, injectedDailyLog]);

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
      { nowMs: now.getTime(), dailyLogEntries: dailyLog },
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
          <View className="flex-row items-center justify-between gap-2 mb-3">
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Попередній місяць"
              onPress={() => go(-1)}
              className="w-10 h-10 rounded-xl border border-line items-center justify-center"
            >
              <Text className="text-lg text-fg">‹</Text>
            </Pressable>
            <Text className="text-base font-bold text-fg capitalize">
              {monthTitle}
            </Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Наступний місяць"
              onPress={() => go(1)}
              className="w-10 h-10 rounded-xl border border-line items-center justify-center"
            >
              <Text className="text-lg text-fg">›</Text>
            </Pressable>
          </View>

          <View className="flex-row items-center justify-between mb-2">
            <Text className="text-[11px] text-fg-muted">
              {days && Object.keys(days).length > 0
                ? `${Object.keys(days).length} днів із шаблоном`
                : "Ще немає призначених шаблонів"}
            </Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Перейти до поточного місяця"
              onPress={goToday}
              className="px-2 py-1 rounded-lg active:opacity-60"
            >
              <Text className="text-xs font-semibold text-teal-700">
                Сьогодні
              </Text>
            </Pressable>
          </View>

          <View className="flex-row mb-1">
            {WEEKDAYS.map((w) => (
              <View key={w} className="w-[14.2857%] items-center">
                <Text className="text-[10px] font-semibold text-fg-subtle">
                  {w}
                </Text>
              </View>
            ))}
          </View>

          <View className="flex-row flex-wrap">
            {cells.map((day, i) => {
              if (day == null) {
                return (
                  <View key={`e-${i}`} className="w-[14.2857%] p-0.5">
                    <View className="min-h-[52px] rounded-xl bg-panelHi/40" />
                  </View>
                );
              }
              const key = dateKeyFromYMD(cursor.y, cursor.m, day);
              const tid = days[key]?.templateId;
              const tpl = tid
                ? (templates.find((t) => t.id === tid) ?? null)
                : null;
              const planned = plannedByDate[key] ?? [];
              const isToday = key === todayKey;
              const hasPlan = planned.length > 0;

              const borderClass = isToday
                ? "border-emerald-500 bg-emerald-50"
                : hasPlan
                  ? "border-emerald-400/60 bg-emerald-50/60"
                  : "border-line bg-panelHi/40";

              const forecast = recoveryForecast[key] ?? null;
              const dotClass = recoveryDotClass(forecast?.status);
              const recoveryLabel = forecast
                ? `. ${describeDayRecovery(forecast)}`
                : "";
              const a11yLabel = `День ${day}${recoveryLabel}`;

              return (
                <View key={key} className="w-[14.2857%] p-0.5">
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={a11yLabel}
                    testID={`plan-day-${key}`}
                    onPress={() => openDay(day)}
                    className={`min-h-[52px] rounded-xl border ${borderClass} p-1 items-center active:opacity-70`}
                  >
                    <View className="flex-row items-center gap-1">
                      <Text className="text-xs font-bold text-fg">{day}</Text>
                      {forecast ? (
                        <View
                          testID={`plan-day-${key}-recovery-${forecast.status}`}
                          className={`w-1.5 h-1.5 rounded-full ${dotClass}`}
                        />
                      ) : null}
                    </View>
                    {tpl ? (
                      <Text
                        numberOfLines={1}
                        className="text-[9px] text-fg-muted leading-tight mt-0.5"
                      >
                        {tpl.name}
                      </Text>
                    ) : null}
                    {hasPlan ? (
                      <Text className="text-[9px] text-emerald-700 font-bold leading-tight mt-0.5">
                        {planned.length > 1 ? `🏋 ×${planned.length}` : "🏋"}
                      </Text>
                    ) : null}
                  </Pressable>
                </View>
              );
            })}
          </View>

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
          <View className="gap-3">
            {sheetForecast ? (
              <View
                testID={`plan-recovery-summary-${sheetForecast.status}`}
                accessibilityLabel={describeDayRecovery(sheetForecast)}
                className={`rounded-xl border px-3 py-2 ${
                  sheetForecast.status === "overworked"
                    ? "border-red-200 bg-red-50"
                    : sheetForecast.status === "ready"
                      ? "border-emerald-200 bg-emerald-50"
                      : "border-line bg-bg"
                }`}
              >
                <View className="flex-row items-center gap-2 mb-1">
                  <View
                    className={`w-2 h-2 rounded-full ${recoveryDotClass(
                      sheetForecast.status,
                    )}`}
                  />
                  <Text className="text-xs font-bold text-fg">
                    {sheetForecast.status === "overworked"
                      ? "Відновлення: перевантаження"
                      : sheetForecast.status === "ready"
                        ? "Відновлення: готовий"
                        : "Відновлення: без недавніх тренувань"}
                  </Text>
                </View>
                {sheetForecast.overworkedMuscles.length > 0 ? (
                  <Text className="text-xs text-fg-muted leading-snug">
                    Перевантажені:{" "}
                    {sheetForecast.overworkedMuscles
                      .map((m) => m.label)
                      .join(", ")}
                  </Text>
                ) : null}
                {sheetForecast.recoveredMuscles.length > 0 ? (
                  <Text className="text-xs text-fg-muted leading-snug">
                    Відновлені:{" "}
                    {sheetForecast.recoveredMuscles
                      .map((m) => m.label)
                      .join(", ")}
                  </Text>
                ) : null}
              </View>
            ) : null}

            {sheet.planned.length > 0 ? (
              <View>
                <Text className="text-xs font-bold text-emerald-700 mb-2">
                  🏋 Заплановані тренування
                </Text>
                <View className="gap-2">
                  {sheet.planned.map((w) => {
                    const time = formatTime(
                      typeof w.startedAt === "string" ? w.startedAt : null,
                    );
                    const itemNames = Array.isArray(w.items)
                      ? w.items
                          .map((it) => {
                            const rec = it as {
                              nameUk?: unknown;
                              name?: unknown;
                            };
                            if (typeof rec.nameUk === "string")
                              return rec.nameUk;
                            if (typeof rec.name === "string") return rec.name;
                            return null;
                          })
                          .filter((x): x is string => !!x)
                      : [];
                    return (
                      <View
                        key={w.id}
                        className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2"
                      >
                        <Text className="text-sm font-semibold text-fg">
                          {time ? (
                            <Text className="text-emerald-700">{time} </Text>
                          ) : null}
                          {typeof w.note === "string" && w.note
                            ? w.note
                            : "Тренування"}
                        </Text>
                        {itemNames.length > 0 ? (
                          <Text className="text-xs text-fg-muted mt-0.5">
                            {itemNames.join(" · ")}
                          </Text>
                        ) : null}
                      </View>
                    );
                  })}
                </View>
              </View>
            ) : null}

            <View>
              <Text className="text-xs text-fg-muted mb-2">
                Шаблон тренування
              </Text>
              <View className="gap-2">
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Без плану"
                  onPress={() => applySheet(null)}
                  className={`px-3 py-3 rounded-xl border ${
                    !sheet.templateId
                      ? "border-emerald-500 bg-emerald-50"
                      : "border-line"
                  }`}
                >
                  <Text className="text-sm text-fg">Без плану (вихідний)</Text>
                </Pressable>
                {templates.map((t) => (
                  <Pressable
                    key={t.id}
                    accessibilityRole="button"
                    accessibilityLabel={t.name}
                    onPress={() => applySheet(t.id)}
                    className={`px-3 py-3 rounded-xl border ${
                      sheet.templateId === t.id
                        ? "border-emerald-500 bg-emerald-50"
                        : "border-line"
                    }`}
                  >
                    <Text className="text-sm text-fg">{t.name}</Text>
                  </Pressable>
                ))}
              </View>
              {templates.length === 0 ? (
                <Text className="text-xs text-fg-muted mt-2">
                  Спочатку створи шаблон у «Тренування → Шаблони».
                </Text>
              ) : null}
            </View>
          </View>
        ) : null}
      </Sheet>
    </SafeAreaView>
  );
}

export default PlanCalendar;
