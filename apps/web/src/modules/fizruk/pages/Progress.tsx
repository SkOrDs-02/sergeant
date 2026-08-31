/**
 * Last validated: 2026-08-08
 * Status: Active
 */
import { useMemo, useState } from "react";
import type { FizrukPage } from "../shell/fizrukRoute";
import { Button } from "@shared/components/ui/Button";
import { EmptyState } from "@shared/components/ui/EmptyState";
import { Icon } from "@shared/components/ui/Icon";
import { Skeleton } from "@shared/components/ui/Skeleton";
import { messages } from "@shared/i18n/uk";
import { cn } from "@shared/lib/ui/cn";
import { useDailyLog } from "../hooks/useDailyLog";
import { useExerciseCatalog } from "../hooks/useExerciseCatalog";
import { useMeasurements } from "../hooks/useMeasurements";
import { usePushupActivity } from "../hooks/usePushupActivity";
import { useWorkouts } from "../hooks/useWorkouts";
import { MiniLineChart } from "../components/MiniLineChart";
import { WellbeingChart } from "../components/WellbeingChart";
import { WeeklyVolumeChart } from "../components/WeeklyVolumeChart";
import {
  buildBodyWeightSeries,
  epley1rm,
  selectBodyWeightSamples,
  weeklyVolumeSeriesNow,
} from "@sergeant/fizruk-domain";
import {
  REGRESSION_NOTICE_PCT,
  computeOneRmAging,
} from "@sergeant/fizruk-domain/domain";
import { pluralize } from "../../../core/hub/useHubDashboardState";
import { chartStatusSeries } from "@shared/charts";
import { Card } from "@shared/components/ui/Card";
import { SectionHeading } from "@shared/components/ui/SectionHeading";
import { Stat } from "@shared/components/ui/Stat";
import { PrBoard } from "./Progress/PrBoard";
import { MuscleVolumeBlock } from "../components/MuscleWeekMatrix";
import { buildMuscleWeekMatrix } from "../lib/muscleWeekMatrix";
// Одна локаль на модуль: «Тіло» друкувало «82,5 кг», а «Прогрес» —
// «82.5 кг» для того самого зважування (браузерне QA 2026-08-23).
import { fmt, fmtLoose } from "../lib/numberFmt";

interface ProgressProps {
  onNavigate: (target: FizrukPage | string) => void;
}

export function Progress({ onNavigate }: ProgressProps) {
  // `loaded` mirrors the fizruk SQLite warm-cache flag (`refreshedAt`) —
  // `useMeasurements`/`useDailyLog` overlay the SAME cache, so this single
  // flag is a faithful readiness signal for the whole page. Without it the
  // page rendered its FINAL empty states (top empty-state, weight/fat
  // dashes, muscle-volume and PR-board empties) during the cold-start
  // window before the cache warmed — a false "nothing here" flash on every
  // fresh boot (defect П1).
  const { workouts, loaded } = useWorkouts();
  const { entries } = useMeasurements();
  // W1-WEIGHT-SOT стадія 1: «Тренд ваги» читав тільки `fizruk_measurements`,
  // тому зважування з екрана «Тіло» (daily_log) сюди не потрапляли.
  const { entries: dailyLogEntries } = useDailyLog();
  const { exercises, musclesUk, primaryGroupsUk } = useExerciseCatalog();
  const { stats: pushupStats, logReps: logPushupReps } = usePushupActivity();

  const meas = useMemo(() => {
    const latest = entries?.[0] || null;
    const prev = entries?.[1] || null;
    const delta = (field: string) => {
      const a = Number(latest?.[field]);
      const b = Number(prev?.[field]);
      if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
      return a - b;
    };
    return { latest, prev, delta };
  }, [entries]);

  const weightTrend = useMemo(
    () =>
      buildBodyWeightSeries(dailyLogEntries, entries, 8).map((p) => ({
        value: p.value,
        label: p.label,
      })),
    [dailyLogEntries, entries],
  );

  /**
   * KPI-картка «Вага» теж на union — інакше цифра над графіком розходилась
   * би з самим графіком (і з шапкою екрана «Тіло»). Дельта — між двома
   * найсвіжішими днями зважування.
   */
  const weightStat = useMemo(() => {
    const samples = selectBodyWeightSamples(dailyLogEntries, entries);
    const latest = samples[0]?.weightKg ?? null;
    const prev = samples[1]?.weightKg ?? null;
    return {
      latest,
      delta: latest != null && prev != null ? latest - prev : null,
    };
  }, [dailyLogEntries, entries]);

  const fatTrend = useMemo(() => {
    return [...(entries || [])]
      .sort((a, b) => Date.parse(a.at) - Date.parse(b.at))
      .slice(-8)
      .map((e) => ({
        value: e["bodyFatPct"] != null ? Number(e["bodyFatPct"]) : null,
        label: new Date(e.at).toLocaleDateString("uk-UA", {
          day: "numeric",
          month: "short",
        }),
      }));
  }, [entries]);

  const [nowMs] = useState(() => Date.now());

  // П4 signature-view: матриця будувалась і тут-таки згорталась у один
  // тиждень (`keys[0]`), тобто три чверті вже порахованого викидались за
  // рядок від обчислення. Тепер вона доїжджає до екрана цілою —
  // обґрунтування й межі у `../lib/muscleWeekMatrix.ts`.
  const muscleMatrix = useMemo(
    () => buildMuscleWeekMatrix(workouts, musclesUk, nowMs),
    [workouts, musclesUk, nowMs],
  );

  const prs = useMemo(() => {
    type PR = {
      best1rm: number;
      weightKg: number;
      reps: number;
      at: string;
      nameUk: string | null;
    };
    const by: Record<string, PR> = {};
    // Канон §6 — «PR-борд розуміє регрес». Пік сам по собі не каже нічого
    // про СЬОГОДНІ: він міг бути півтора роки тому. Тому поруч тримаємо
    // останню силову сесію вправи і її результат.
    const latest: Record<string, { at: string; best1rm: number }> = {};
    for (const w of workouts || []) {
      for (const it of w.items || []) {
        const exId = it.exerciseId;
        if (!exId || it.type !== "strength") continue;
        for (const s of it.sets || []) {
          const est = epley1rm(s.weightKg, s.reps);
          if (!est) continue;
          if (!by[exId] || est > by[exId].best1rm)
            by[exId] = {
              best1rm: est,
              weightKg: s.weightKg,
              reps: s.reps,
              at: w.startedAt,
              nameUk: it.nameUk ?? null,
            };
          const at = w.startedAt || "";
          const prevLatest = latest[exId];
          if (!prevLatest || at > prevLatest.at) {
            latest[exId] = { at, best1rm: est };
          } else if (at === prevLatest.at && est > prevLatest.best1rm) {
            prevLatest.best1rm = est;
          }
        }
      }
    }
    const labelById = new Map(
      (exercises || []).map((ex) => [
        ex.id,
        ex?.name?.uk || ex?.name?.en || ex.id,
      ]),
    );
    const groupById = new Map<string, string | null>(
      (exercises || []).map((ex) => [ex.id, ex.primaryGroup || null]),
    );
    return Object.entries(by)
      .map(([id, v]) => {
        const group = groupById.get(id) || null;
        const last = latest[id];
        const aging = computeOneRmAging({
          peak1rm: v.best1rm,
          lastSessionAt: last?.at ?? null,
        });
        const lastBest = last?.best1rm ?? 0;
        return {
          id,
          name: labelById.get(id) || v.nameUk || id,
          muscleGroup: group,
          // AI-DANGER: `group` — це PRIMARY-ГРУПА вправи (`chest`,
          // `quadriceps`), а не окремий мʼяз. Лейбл раніше шукався в
          // `musclesUk`, де є лише ті ідентифікатори, що випадково
          // збігаються з назвами мʼязів (`quadriceps`, `biceps`,
          // `calves`…). Для `chest`/`back`/`shoulders`/`core`/`glutes`/
          // `cardio`/`full_body` там нема нічого — і на «Прогресі» поруч
          // із «Квадрицепс» стояв сирий слаг `chest`, а бейдж групи на
          // картці зникав зовсім (браузерне QA 2026-08-23). Мапа груп —
          // `primaryGroupsUk`.
          muscleGroupLabel: group ? primaryGroupsUk?.[group] || null : null,
          isStale: aging.isStale,
          // `aging` рахувався тут і раніше — з нього брали лише
          // `isStale`, а `reference1rm` викидали в тому ж виразі. Шкала
          // повернення (П1) потребує саме його: це число людина кладе
          // на штангу.
          reference1rm: aging.reference1rm,
          reductionPct: aging.reductionPct,
          daysSinceLastSession: aging.daysSinceLastSession,
          deltaVsPeakPct:
            lastBest > 0 && v.best1rm > 0
              ? Math.round(((lastBest - v.best1rm) / v.best1rm) * 100)
              : 0,
          isRegression:
            lastBest > 0 && lastBest < v.best1rm * (1 - REGRESSION_NOTICE_PCT),
          ...v,
        };
      })
      .sort((a, b) => b.best1rm - a.best1rm);
  }, [workouts, exercises, primaryGroupsUk]);

  const quickStats = useMemo(() => {
    const done = (workouts || []).filter((w) => w.endedAt);
    const latestTs = done.reduce((mx, w) => {
      const ts = w.startedAt ? Date.parse(w.startedAt) : NaN;
      return Number.isFinite(ts) ? Math.max(mx, ts) : mx;
    }, 0);
    const latestWorkoutAt = latestTs
      ? new Date(latestTs).toLocaleDateString("uk-UA", {
          day: "numeric",
          month: "short",
        })
      : "—";
    return {
      doneCount: done.length,
      prsCount: prs.length,
      latestWorkoutAt,
    };
  }, [workouts, prs.length]);

  const weekly = useMemo(() => weeklyVolumeSeriesNow(workouts), [workouts]);

  const wellbeingData = useMemo(() => {
    return (workouts || [])
      .filter(
        (w) =>
          w.endedAt &&
          (w.wellbeing?.energy != null || w.wellbeing?.mood != null),
      )
      .slice(0, 14)
      .reverse()
      .map((w) => ({
        label: new Date(w.startedAt).toLocaleDateString("uk-UA", {
          day: "numeric",
          month: "short",
        }),
        energy: w.wellbeing?.energy ?? null,
        mood: w.wellbeing?.mood ?? null,
      }));
  }, [workouts]);

  const [prFilter, setPrFilter] = useState("all");

  // Reset the muscle-group filter when its group no longer exists — e.g. the
  // user filtered by "chest", deleted all chest sets in Workouts, then came
  // back to a stale filter that would otherwise show only an empty state
  // (07 F18).
  if (prFilter !== "all" && !prs.some((p) => p.muscleGroup === prFilter)) {
    setPrFilter("all");
  }

  const hasAny =
    (workouts?.length || 0) > 0 ||
    (entries?.length || 0) > 0 ||
    weightStat.latest != null;

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="max-w-4xl mx-auto px-4 pt-4 page-tabbar-pad space-y-3">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h1 className="text-style-title text-text">
              {messages.fizruk.progress.title}
            </h1>
            <p className="text-style-caption text-subtle mt-0.5">
              {quickStats.latestWorkoutAt !== "—"
                ? `Останнє: ${quickStats.latestWorkoutAt} · ${quickStats.prsCount} PR`
                : "Аналітика тренувань"}
            </p>
          </div>
          <div className="text-center">
            <div className="text-style-caption text-subtle">PR</div>
            {loaded ? (
              <div className="text-base font-extrabold text-text tabular-nums">
                {quickStats.prsCount}
              </div>
            ) : (
              <Skeleton className="h-5 w-6 mx-auto mt-0.5" module="fizruk" />
            )}
          </div>
        </div>

        {!loaded ? (
          // П1 — cold-start skeleton. Before this, the page rendered its
          // FINAL empty states (top empty-state, weight/fat dashes,
          // muscle-volume and PR-board empties) while the SQLite cache was
          // still warming, i.e. a false "nothing here" flash on every fresh
          // boot. `loaded` (== `refreshedAt !== null` on the shared fizruk
          // cache) gates the whole body until the cache has actually had a
          // chance to answer.
          <div
            className="space-y-3"
            role="status"
            aria-live="polite"
            aria-label={messages.status.loading}
          >
            <Skeleton className="h-[68px] w-full" module="fizruk" />
            <Skeleton className="h-32 w-full" module="fizruk" />
            <div className="grid grid-cols-2 gap-3">
              <Skeleton className="h-20 w-full" module="fizruk" />
              <Skeleton className="h-20 w-full" module="fizruk" />
            </div>
            <Skeleton className="h-40 w-full" module="fizruk" />
          </div>
        ) : (
          <>
            {/* Round-3 UI audit T3: the old version was clickable text with no
                visual affordance — owner: "не зрозуміло що то кнопка". Now a
                bordered card-button with icon/title/subtitle/chevron, same
                shape as other tappable rows in the module. */}
            <button
              type="button"
              onClick={() => onNavigate("measurements")}
              className="focus-ring touch-target w-full flex items-center gap-3 rounded-2xl border border-line bg-panelHi hover:bg-panel active:scale-[0.99] transition-[background-color,transform] px-4 py-3 text-left"
            >
              <div className="shrink-0 w-9 h-9 rounded-xl bg-fizruk/10 text-fizruk-strong dark:text-fizruk flex items-center justify-center">
                <Icon name="ruler" size="md" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-style-label text-text">
                  {messages.fizruk.progress.measurementsTitle}
                </div>
                <div className="text-style-caption text-subtle truncate">
                  {messages.fizruk.progress.measurementsSubtitle} ·{" "}
                  {entries.length}{" "}
                  {pluralize(
                    entries.length,
                    messages.fizruk.progress.measurementOne,
                    messages.fizruk.progress.measurementFew,
                    messages.fizruk.progress.measurementMany,
                  )}
                </div>
              </div>
              <Icon
                name="chevron-right"
                size="sm"
                className="shrink-0 text-subtle"
                aria-hidden
              />
            </button>

            {/*
              П2 — a single honest empty state instead of a stack of four
              near-identical "no data yet" cards (top empty-state, weight/fat
              dashes, muscle-volume empty, PR-board empty). The rest of the
              page (everything below) only mounts once `hasAny` is true, so
              an empty profile shows exactly ONE state with ONE action.
            */}
            {!hasAny && (
              <EmptyState
                compact
                icon={<Icon name="trending-up" size={22} aria-hidden />}
                title={messages.fizruk.progress.emptyTitle}
                description={messages.fizruk.progress.emptyDescription}
                primaryAction={
                  <Button
                    variant="fizruk"
                    size="sm"
                    onClick={() => onNavigate("workouts")}
                  >
                    {messages.fizruk.startWorkoutFab}
                  </Button>
                }
              />
            )}

            {/* Легка активність — fizruk-власний лічильник віджимань
                (перенос власності routine → fizruk, канон routine.md §10,
                2026-08-30). Поза гейтом `hasAny` навмисно: лог-кнопки і є
                вхідною точкою на порожньому профілі. */}
            {loaded && (
              <Card radius="lg">
                <SectionHeading size="xs" className="mb-3" variant="fizruk">
                  {messages.fizruk.progress.lightActivityHeading}
                </SectionHeading>
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-9 h-9 rounded-xl bg-fizruk/10 text-fizruk-strong dark:text-fizruk flex items-center justify-center shrink-0">
                    <Icon name="dumbbell" size={18} aria-hidden />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-style-label text-text">
                      {messages.fizruk.progress.pushups}
                    </div>
                    <div className="text-style-caption text-subtle">
                      {messages.fizruk.progress.pushupsSource}
                    </div>
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <div className="bg-bg border border-line rounded-xl p-2.5">
                    <Stat
                      label={messages.period.today}
                      value={pushupStats.todayCount}
                      size="sm"
                      align="center"
                    />
                  </div>
                  <div className="bg-bg border border-line rounded-xl p-2.5">
                    <Stat
                      label={messages.period.week}
                      value={pushupStats.week}
                      size="sm"
                      align="center"
                    />
                  </div>
                  <div className="bg-bg border border-line rounded-xl p-2.5">
                    <Stat
                      label={messages.period.month}
                      value={pushupStats.month}
                      size="sm"
                      align="center"
                    />
                  </div>
                </div>
                <div
                  className="mt-3 flex gap-2"
                  role="group"
                  aria-label={messages.fizruk.progress.pushupsQuickAddLabel}
                >
                  {[10, 20, 30].map((n) => (
                    <Button
                      key={n}
                      type="button"
                      variant="secondary"
                      size="sm"
                      className="flex-1 tabular-nums"
                      onClick={() => logPushupReps(n)}
                    >
                      +{n}
                    </Button>
                  ))}
                </div>
              </Card>
            )}

            {hasAny && (
              <>
                {/* Weekly volume chart */}
                {(workouts || []).some((w) => w.endedAt) && (
                  <Card radius="lg" padding="lg">
                    <WeeklyVolumeChart
                      volumeKg={weekly.volumeKg}
                      isLoading={!loaded}
                    />
                  </Card>
                )}

                {/* Weight + fat cards */}
                {(() => {
                  const weightDelta = weightStat.delta;
                  const fatDelta = meas.delta("bodyFatPct");
                  return (
                    <div className="grid grid-cols-2 gap-3">
                      <Card radius="lg">
                        <Stat
                          label={messages.fizruk.progress.weight}
                          value={
                            weightStat.latest != null
                              ? `${fmtLoose(weightStat.latest)} ${messages.fizruk.kgUnit}`
                              : "—"
                          }
                          sublabel={
                            weightDelta == null ? (
                              messages.fizruk.progress.noComparison
                            ) : (
                              <span
                                className={cn(
                                  "font-semibold",
                                  weightDelta > 0
                                    ? "text-warning-strong dark:text-warning"
                                    : "text-success-strong dark:text-success",
                                )}
                              >
                                {weightDelta > 0 ? "+" : ""}
                                {fmt(weightDelta, 1)} {messages.fizruk.kgUnit}
                              </span>
                            )
                          }
                        />
                      </Card>
                      <Card radius="lg">
                        <Stat
                          label={messages.fizruk.progress.bodyFat}
                          value={
                            meas.latest?.["bodyFatPct"] != null
                              ? `${fmtLoose(Number(meas.latest["bodyFatPct"]))}%`
                              : "—"
                          }
                          sublabel={
                            fatDelta == null ? (
                              "—"
                            ) : (
                              <span
                                className={cn(
                                  "font-semibold",
                                  fatDelta > 0
                                    ? "text-warning-strong dark:text-warning"
                                    : "text-success-strong dark:text-success",
                                )}
                              >
                                {fatDelta > 0 ? "+" : ""}
                                {fmt(fatDelta, 1)}%
                              </span>
                            )
                          }
                        />
                      </Card>
                    </div>
                  );
                })()}

                {/* Weight trend chart */}
                {weightTrend.filter((d) => d.value != null).length >= 2 && (
                  <Card radius="lg">
                    <SectionHeading size="xs" className="mb-3" variant="fizruk">
                      {messages.fizruk.progress.weightTrend}
                    </SectionHeading>
                    <MiniLineChart
                      data={weightTrend}
                      unit={messages.fizruk.kgUnit}
                      color={chartStatusSeries.success}
                      metricLabel={messages.fizruk.progress.weightMetricLabel}
                    />
                  </Card>
                )}

                {/* Body fat trend chart */}
                {fatTrend.filter((d) => d.value != null).length >= 2 && (
                  <Card radius="lg">
                    <SectionHeading size="xs" className="mb-3" variant="fizruk">
                      {messages.fizruk.progress.bodyFatTrend}
                    </SectionHeading>
                    <MiniLineChart
                      data={fatTrend}
                      unit="%"
                      color={chartStatusSeries.warning}
                      metricLabel={messages.fizruk.progress.bodyFatMetricLabel}
                    />
                  </Card>
                )}

                {/* Wellbeing chart */}
                {wellbeingData.length >= 2 && (
                  <Card radius="lg">
                    <SectionHeading size="xs" className="mb-3" variant="fizruk">
                      {messages.fizruk.progress.wellbeing}
                    </SectionHeading>
                    <WellbeingChart data={wellbeingData} />
                  </Card>
                )}

                {/* Muscle volume bars */}
                <Card radius="lg" padding="lg">
                  <SectionHeading size="xs" className="mb-1" variant="fizruk">
                    {messages.fizruk.progress.muscleVolume}
                  </SectionHeading>
                  {/*
                    П3 — the bars below plot `loadPoints`, an internal score
                    (тоннаж ÷ 1000 + сети × 0.15), not kilograms. Without
                    this line the raw "0.6" read as a broken weight. Full
                    unit rename (or switching the metric itself to кг×повт,
                    like the weekly-volume chart above) touches
                    `components/MuscleWeekMatrix.tsx` + `lib/muscleWeekMatrix.ts`,
                    both outside this change's file scope — tracked as a
                    follow-up.
                  */}
                  <p className="text-style-caption text-subtle mb-3">
                    {messages.fizruk.progress.muscleVolumeUnitsHint}
                  </p>
                  {muscleMatrix.rows.length === 0 ? (
                    <EmptyState
                      compact
                      title={messages.empty.nothingYet}
                      description={
                        messages.fizruk.progress.muscleVolumeEmptyDescription
                      }
                    />
                  ) : (
                    <MuscleVolumeBlock matrix={muscleMatrix} />
                  )}
                </Card>

                <PrBoard
                  prs={prs}
                  prFilter={prFilter}
                  onPrFilterChange={setPrFilter}
                  primaryGroupsUk={primaryGroupsUk}
                  onSelect={(id) => onNavigate(`exercise/${id}`)}
                />
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}
