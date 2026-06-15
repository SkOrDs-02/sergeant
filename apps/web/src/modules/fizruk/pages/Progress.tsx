/**
 * Last validated: 2026-05-14
 * Status: Active
 */
import { useEffect, useMemo, useState } from "react";
import type { FizrukPage } from "../shell/fizrukRoute";
import { EmptyState } from "@shared/components/ui/EmptyState";
import { messages } from "@shared/i18n/uk";
import { cn } from "@shared/lib/ui/cn";
import { useExerciseCatalog } from "../hooks/useExerciseCatalog";
import { useMeasurements } from "../hooks/useMeasurements";
import { usePushupActivity } from "../hooks/usePushupActivity";
import { useWorkouts } from "../hooks/useWorkouts";
import { MiniLineChart } from "../components/MiniLineChart";
import { WellbeingChart } from "../components/WellbeingChart";
import { WeeklyVolumeChart } from "../components/WeeklyVolumeChart";
import { epley1rm, weeklyVolumeSeriesNow } from "@sergeant/fizruk-domain";
import { kyivMondayStartMs } from "@sergeant/shared";
import { statusColors } from "@shared/charts";
import { Card } from "@shared/components/ui/Card";
import { SectionHeading } from "@shared/components/ui/SectionHeading";
import { Stat } from "@shared/components/ui/Stat";

// F36: minimum bar width (%) so the smallest muscle-volume bar stays
// visible and tap-able even when its value is a tiny fraction of the max.
const MIN_BAR_WIDTH_PCT = 6;

interface ProgressProps {
  /**
   * Path-based navigation injected by `FizrukRouter`. The PRs list at the
   * bottom of the page lets the user deep-link into a single exercise
   * detail card via `onNavigate("exercise/<id>")` — used to mutate
   * `window.location.hash` directly but Fizruk migrated to react-router
   * in initiative 0006 §Phase 2.c (#2541), and hash mutations after the
   * initial mount are a silent no-op.
   */
  onNavigate: (target: FizrukPage | string) => void;
}

export function Progress({ onNavigate }: ProgressProps) {
  const { workouts } = useWorkouts();
  const { entries } = useMeasurements();
  const { exercises, musclesUk } = useExerciseCatalog();
  const { stats: pushupStats, hasData: hasPushupData } = usePushupActivity();

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

  const weightTrend = useMemo(() => {
    return [...(entries || [])]
      .sort((a, b) => Date.parse(a.at) - Date.parse(b.at))
      .slice(-8)
      .map((e) => ({
        value: e["weightKg"] != null ? Number(e["weightKg"]) : null,
        label: new Date(e.at).toLocaleDateString("uk-UA", {
          day: "numeric",
          month: "short",
        }),
      }));
  }, [entries]);

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

  const weeklyByMuscle = useMemo(() => {
    const now = Date.now();
    const weeks = new Map<number, Record<string, number>>();
    const DAY = 24 * 60 * 60 * 1000;
    const cutoff = now - 28 * DAY;

    for (const w of workouts || []) {
      const t = w.startedAt ? Date.parse(w.startedAt) : NaN;
      if (!Number.isFinite(t) || t < cutoff) continue;
      // Domain-correct (Kyiv) week boundary so weekly-volume bars don't
      // shift when the user roams (consolidated page-audit § Theme 1 — 07 F1).
      const wk = kyivMondayStartMs(t);
      if (!weeks.has(wk)) weeks.set(wk, {});
      const bucket = weeks.get(wk);
      if (!bucket) continue;
      for (const it of w.items || []) {
        const primary = it.musclesPrimary || [];
        const secondary = it.musclesSecondary || [];
        let pts = 0;
        if (it.type === "strength") {
          pts =
            (it.sets || []).reduce(
              (s, x) => s + (Number(x.weightKg) || 0) * (Number(x.reps) || 0),
              0,
            ) / 1000;
        } else if (it.type === "time") {
          pts = (Number(it.durationSec) || 0) / 240;
        } else if (it.type === "distance") {
          pts =
            (Number(it.distanceM) || 0) / 1000 +
            (Number(it.durationSec) || 0) / 60 / 30;
        }
        const add = (id: string, wgt: number) => {
          if (!id) return;
          bucket[id] = (bucket[id] || 0) + pts * wgt;
        };
        for (const id of primary) add(id, 1);
        for (const id of secondary) add(id, 0.55);
      }
    }

    const keys = Array.from(weeks.keys()).sort((a, b) => b - a);
    const latestWeek = keys[0] || null;
    const latestData = latestWeek ? weeks.get(latestWeek) : {};
    const top = Object.entries(latestData || {})
      .map(([id, v]) => ({ id, label: musclesUk?.[id] || id, value: v }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 10);

    const max = top[0]?.value || 1;
    return { latestWeek, top, max };
  }, [workouts, musclesUk]);

  const prs = useMemo(() => {
    type PR = {
      best1rm: number;
      weightKg: number;
      reps: number;
      at: string;
    };
    const by: Record<string, PR> = {};
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
            };
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
        return {
          id,
          name: labelById.get(id) || id,
          muscleGroup: group,
          muscleGroupLabel: group ? musclesUk?.[group] || null : null,
          ...v,
        };
      })
      .sort((a, b) => b.best1rm - a.best1rm);
  }, [workouts, exercises, musclesUk]);

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
  useEffect(() => {
    if (prFilter !== "all" && !prs.some((p) => p.muscleGroup === prFilter)) {
      setPrFilter("all");
    }
  }, [prFilter, prs]);

  const hasAny = (workouts?.length || 0) > 0 || (entries?.length || 0) > 0;

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="max-w-4xl mx-auto px-4 pt-4 page-tabbar-pad space-y-3">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h1 className="text-style-title text-text">
              {messages.fizruk.progress.title}
            </h1>
            <p className="text-xs text-subtle mt-0.5">
              {quickStats.latestWorkoutAt !== "—"
                ? `Останнє: ${quickStats.latestWorkoutAt} · ${quickStats.prsCount} PR`
                : "Аналітика тренувань"}
            </p>
          </div>
          <div className="flex items-center gap-3">
            <div className="text-center">
              <div className="text-xs text-subtle">PR</div>
              <div className="text-base font-extrabold text-text tabular-nums">
                {quickStats.prsCount}
              </div>
            </div>
            <div className="text-center">
              <div className="text-xs text-subtle">
                {messages.fizruk.progress.measurementsCount}
              </div>
              <div className="text-base font-extrabold text-text tabular-nums">
                {entries.length}
              </div>
            </div>
          </div>
        </div>

        {!hasAny && (
          <EmptyState
            compact
            icon="📈"
            title={messages.fizruk.progress.emptyTitle}
            description={messages.fizruk.progress.emptyDescription}
          />
        )}

        {/* Weekly volume chart */}
        {(workouts || []).some((w) => w.endedAt) && (
          <Card radius="lg" padding="lg">
            <WeeklyVolumeChart volumeKg={weekly.volumeKg} />
          </Card>
        )}

        {/* Cross-module activity */}
        {hasPushupData && (
          <Card radius="lg">
            <SectionHeading as="div" size="sm" className="mb-3">
              {messages.fizruk.progress.crossModuleHeading}
            </SectionHeading>
            <div className="flex items-center gap-3 mb-3">
              <div className="w-9 h-9 rounded-xl bg-fizruk/10 flex items-center justify-center shrink-0 text-base">
                💪
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-style-label text-text">
                  {messages.fizruk.progress.pushups}
                </div>
                <div className="text-xs text-subtle">
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
          </Card>
        )}

        {/* Weight + fat cards */}
        {(() => {
          // F19: hoist per-render delta values to avoid calling meas.delta()
          // 3–4 times per field in the same render (each call recomputes the
          // arithmetic and the non-null assertions).
          const weightDelta = meas.delta("weightKg");
          const fatDelta = meas.delta("bodyFatPct");
          return (
            <div className="grid grid-cols-2 gap-3">
              <Card radius="lg">
                <Stat
                  label={messages.fizruk.progress.weight}
                  value={
                    meas.latest?.["weightKg"] != null
                      ? `${meas.latest["weightKg"]} ${messages.fizruk.kgUnit}`
                      : "—"
                  }
                  sublabel={
                    weightDelta == null ? (
                      messages.fizruk.progress.noComparison
                    ) : (
                      <span
                        className={cn(
                          "font-semibold",
                          weightDelta > 0 ? "text-warning" : "text-success",
                        )}
                      >
                        {weightDelta > 0 ? "+" : ""}
                        {weightDelta.toFixed(1)} {messages.fizruk.kgUnit}
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
                      ? `${meas.latest["bodyFatPct"]}%`
                      : "—"
                  }
                  sublabel={
                    fatDelta == null ? (
                      "—"
                    ) : (
                      <span
                        className={cn(
                          "font-semibold",
                          fatDelta > 0 ? "text-warning" : "text-success",
                        )}
                      >
                        {fatDelta > 0 ? "+" : ""}
                        {fatDelta.toFixed(1)}%
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
            <SectionHeading size="sm" className="mb-3">
              {messages.fizruk.progress.weightTrend}
            </SectionHeading>
            <MiniLineChart
              data={weightTrend}
              unit={messages.fizruk.kgUnit}
              color={statusColors.success}
              metricLabel={messages.fizruk.progress.weightMetricLabel}
            />
          </Card>
        )}

        {/* Body fat trend chart */}
        {fatTrend.filter((d) => d.value != null).length >= 2 && (
          <Card radius="lg">
            <SectionHeading size="sm" className="mb-3">
              {messages.fizruk.progress.bodyFatTrend}
            </SectionHeading>
            <MiniLineChart
              data={fatTrend}
              unit="%"
              color={statusColors.warning}
              metricLabel={messages.fizruk.progress.bodyFatMetricLabel}
            />
          </Card>
        )}

        {/* Wellbeing chart */}
        {wellbeingData.length >= 2 && (
          <Card radius="lg">
            <SectionHeading size="sm" className="mb-3">
              {messages.fizruk.progress.wellbeing}
            </SectionHeading>
            <WellbeingChart data={wellbeingData} />
          </Card>
        )}

        {/* Muscle volume bars */}
        <Card radius="lg" padding="lg">
          <SectionHeading size="sm" className="mb-3">
            {messages.fizruk.progress.muscleVolume}
          </SectionHeading>
          {weeklyByMuscle.top.length === 0 ? (
            <EmptyState
              compact
              title={messages.empty.nothingYet}
              description={
                messages.fizruk.progress.muscleVolumeEmptyDescription
              }
            />
          ) : (
            <div className="space-y-2">
              {weeklyByMuscle.top.map((m) => (
                <div key={m.id} className="space-y-1">
                  <div className="flex items-center justify-between gap-2">
                    <div className="text-sm text-text truncate">{m.label}</div>
                    <div className="text-xs text-subtle tabular-nums">
                      {m.value.toFixed(1)}
                    </div>
                  </div>
                  <div className="h-2 bg-bg rounded-full overflow-hidden border border-line">
                    <div
                      className="h-full bg-success/70"
                      style={{
                        width: `${Math.max(MIN_BAR_WIDTH_PCT, (m.value / weeklyByMuscle.max) * 100)}%`,
                      }}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>

        {/* PR Board */}
        {(() => {
          const muscleGroups = [
            ...new Set(
              prs
                .map((p) => p.muscleGroup)
                .filter((g): g is string => Boolean(g)),
            ),
          ].sort();
          const filtered =
            prFilter === "all"
              ? prs
              : prs.filter((p) => p.muscleGroup === prFilter);
          const MEDALS = ["🥇", "🥈", "🥉"];
          return (
            <Card radius="lg" padding="lg">
              <div className="flex items-center justify-between gap-2 mb-3">
                <SectionHeading as="div" size="sm">
                  {messages.fizruk.progress.recordsHeading} · {prs.length}
                </SectionHeading>
                {filtered.length !== prs.length && (
                  <div className="text-xs text-subtle">
                    {filtered.length} {messages.fizruk.progress.shown}
                  </div>
                )}
              </div>

              {/* Muscle group filter */}
              {muscleGroups.length > 1 && (
                <div className="flex gap-1.5 overflow-x-auto pb-2 mb-3 scrollbar-none">
                  <button
                    type="button"
                    onClick={() => setPrFilter("all")}
                    aria-pressed={prFilter === "all"}
                    className={cn(
                      "focus-ring shrink-0 px-3 min-h-[44px] rounded-full text-style-caption transition-colors border",
                      prFilter === "all"
                        ? "bg-fizruk-strong text-white border-fizruk-strong"
                        : "bg-panel border-line text-subtle hover:text-text",
                    )}
                  >
                    {messages.fizruk.progress.filterAll}
                  </button>
                  {muscleGroups.map((g) => (
                    <button
                      key={g}
                      type="button"
                      onClick={() => setPrFilter(g === prFilter ? "all" : g)}
                      aria-pressed={prFilter === g}
                      className={cn(
                        "focus-ring shrink-0 px-3 min-h-[44px] rounded-full text-style-caption transition-colors border whitespace-nowrap",
                        prFilter === g
                          ? "bg-fizruk-strong text-white border-fizruk-strong"
                          : "bg-panel border-line text-subtle hover:text-text",
                      )}
                    >
                      {musclesUk?.[g] || g}
                    </button>
                  ))}
                </div>
              )}

              {filtered.length === 0 ? (
                <EmptyState
                  compact
                  title={
                    prs.length === 0
                      ? messages.fizruk.progress.noPrTitle
                      : messages.fizruk.progress.noPrGroupTitle
                  }
                  description={
                    prs.length === 0
                      ? messages.fizruk.progress.noPrDescription
                      : messages.fizruk.progress.noPrGroupDescription
                  }
                />
              ) : (
                <div className="space-y-2">
                  {filtered.map((p) => {
                    const globalRank = prs.findIndex((x) => x.id === p.id);
                    const medal =
                      globalRank >= 0 && globalRank < 3
                        ? MEDALS[globalRank]
                        : null;
                    return (
                      <button
                        key={p.id}
                        type="button"
                        className="focus-ring w-full text-left border border-line rounded-2xl p-3 bg-bg hover:bg-panelHi transition-colors"
                        onClick={() => {
                          onNavigate(`exercise/${p.id}`);
                        }}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-2 min-w-0">
                            {medal && (
                              <span className="shrink-0 text-base leading-none">
                                {medal}
                              </span>
                            )}
                            <div className="text-style-label text-text truncate">
                              {p.name}
                            </div>
                          </div>
                          <div className="shrink-0 text-style-label text-text tabular-nums">
                            {p.best1rm.toFixed(0)} {messages.fizruk.kgUnit}
                          </div>
                        </div>
                        <div className="flex items-center gap-2 mt-0.5">
                          <span className="text-xs text-subtle tabular-nums">
                            {p.weightKg ?? 0} {messages.fizruk.kgUnit} ×{" "}
                            {p.reps ?? 0}
                          </span>
                          {p.at && (
                            <span className="text-xs text-muted">
                              ·{" "}
                              {new Date(p.at).toLocaleDateString("uk-UA", {
                                month: "short",
                                day: "numeric",
                              })}
                            </span>
                          )}
                          {p.muscleGroupLabel && (
                            <span className="ml-auto text-style-caption px-2 py-0.5 rounded-full bg-fizruk/10 text-fizruk/70 font-medium shrink-0">
                              {p.muscleGroupLabel}
                            </span>
                          )}
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </Card>
          );
        })()}
      </div>
    </div>
  );
}
