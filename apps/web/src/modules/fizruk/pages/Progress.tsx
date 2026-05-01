import { useMemo, useState } from "react";
import { safeRemoveLS } from "@shared/lib/storage";
import { downloadJson } from "@sergeant/shared";
import { Button } from "@shared/components/ui/Button";
import { ConfirmDialog } from "@shared/components/ui/ConfirmDialog";
import { EmptyState } from "@shared/components/ui/EmptyState";
import { cn } from "@shared/lib/cn";
import { useExerciseCatalog } from "../hooks/useExerciseCatalog";
import { useMeasurements } from "../hooks/useMeasurements";
import { usePushupActivity } from "../hooks/usePushupActivity";
import { useWorkouts } from "../hooks/useWorkouts";
import { MiniLineChart } from "../components/MiniLineChart";
import { WellbeingChart } from "../components/WellbeingChart";
import { WeeklyVolumeChart } from "../components/WeeklyVolumeChart";
import {
  buildFizrukFullBackupPayload,
  FIZRUK_RESET_KEYS,
} from "../lib/fizrukStorage";
import { epley1rm, weeklyVolumeSeriesNow } from "@sergeant/fizruk-domain";
import { Card } from "@shared/components/ui/Card";
import { SectionHeading } from "@shared/components/ui/SectionHeading";
import { Stat } from "@shared/components/ui/Stat";

function weekStartMs(d) {
  const x = new Date(d);
  const day = (x.getDay() + 6) % 7;
  x.setHours(0, 0, 0, 0);
  x.setDate(x.getDate() - day);
  return x.getTime();
}

export function Progress() {
  const { workouts } = useWorkouts();
  const { entries } = useMeasurements();
  const { exercises, musclesUk } = useExerciseCatalog();
  const { stats: pushupStats, hasData: hasPushupData } = usePushupActivity();

  const meas = useMemo(() => {
    const latest = entries?.[0] || null;
    const prev = entries?.[1] || null;
    const delta = (field) => {
      const a = Number(latest?.[field]);
      const b = Number(prev?.[field]);
      if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
      return a - b;
    };
    return { latest, prev, delta };
  }, [entries]);

  const weightTrend = useMemo(() => {
    return [...(entries || [])]
      .sort((a, b) => a.at.localeCompare(b.at))
      .slice(-8)
      .map((e) => ({
        value:
          e.weightKg != null && e.weightKg !== "" ? Number(e.weightKg) : null,
        label: new Date(e.at).toLocaleDateString("uk-UA", {
          day: "numeric",
          month: "short",
        }),
      }));
  }, [entries]);

  const fatTrend = useMemo(() => {
    return [...(entries || [])]
      .sort((a, b) => a.at.localeCompare(b.at))
      .slice(-8)
      .map((e) => ({
        value:
          e.bodyFatPct != null && e.bodyFatPct !== ""
            ? Number(e.bodyFatPct)
            : null,
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
      const wk = weekStartMs(t);
      if (!weeks.has(wk)) weeks.set(wk, {});
      const bucket = weeks.get(wk)!;
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

  const exportJson = async () => {
    const payload = buildFizrukFullBackupPayload();
    await downloadJson(
      `fizruk-backup-${new Date().toISOString().slice(0, 10)}.json`,
      payload,
    );
  };

  const [resetConfirm, setResetConfirm] = useState(false);
  const [prFilter, setPrFilter] = useState("all");

  const resetAll = () => {
    for (const k of FIZRUK_RESET_KEYS) {
      safeRemoveLS(k);
    }
    window.location.reload();
  };

  const exportCsv = () => {
    const rows = [
      [
        "startedAt",
        "endedAt",
        "workout_id",
        "exercise",
        "type",
        "detail",
        "energy_1_5",
        "mood_1_5",
      ],
    ];
    for (const w of workouts || []) {
      const we = w.wellbeing?.energy ?? "";
      const wm = w.wellbeing?.mood ?? "";
      for (const it of w.items || []) {
        let detail = "";
        if (it.type === "strength")
          detail = (it.sets || [])
            .map((s) => `${s.weightKg ?? 0}x${s.reps ?? 0}`)
            .join(";");
        else if (it.type === "distance")
          detail = `${it.distanceM ?? 0}m/${it.durationSec ?? 0}s`;
        else detail = String(it.durationSec ?? "");
        rows.push([
          w.startedAt || "",
          w.endedAt || "",
          w.id,
          (it.nameUk || "").replace(/"/g, "'"),
          it.type || "",
          detail,
          we,
          wm,
        ]);
      }
    }
    const csv = rows
      .map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(","))
      .join("\n");
    const blob = new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `fizruk-workouts-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  };

  const hasAny = (workouts?.length || 0) > 0 || (entries?.length || 0) > 0;

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="max-w-4xl mx-auto px-4 pt-4 page-tabbar-pad space-y-3">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h1 className="text-xl font-bold text-text">Прогрес</h1>
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
              <div className="text-xs text-subtle">Заміри</div>
              <div className="text-base font-extrabold text-text tabular-nums">
                {entries.length}
              </div>
            </div>
          </div>
        </div>

        {!hasAny && (
          <Card radius="lg" padding="xl" className="p-8 text-center">
            <div className="text-3xl mb-3">📈</div>
            <div className="text-sm font-medium text-text mb-1">
              Даних ще немає
            </div>
            <div className="text-xs text-subtle">
              Додай тренування або заміри — і тут зʼявиться аналітика
            </div>
          </Card>
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
              Активність з інших модулів
            </SectionHeading>
            <div className="flex items-center gap-3 mb-3">
              <div className="w-9 h-9 rounded-xl bg-fizruk/10 flex items-center justify-center shrink-0 text-base">
                💪
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-sm font-semibold text-text">
                  Відтискання
                </div>
                <div className="text-xs text-subtle">
                  за даними щоденних звичок
                </div>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-2">
              <div className="bg-bg border border-line rounded-xl p-2.5">
                <Stat
                  label="Сьогодні"
                  value={pushupStats.todayCount}
                  size="sm"
                  align="center"
                />
              </div>
              <div className="bg-bg border border-line rounded-xl p-2.5">
                <Stat
                  label="Тиждень"
                  value={pushupStats.week}
                  size="sm"
                  align="center"
                />
              </div>
              <div className="bg-bg border border-line rounded-xl p-2.5">
                <Stat
                  label="Місяць"
                  value={pushupStats.month}
                  size="sm"
                  align="center"
                />
              </div>
            </div>
          </Card>
        )}

        {/* Weight + fat cards */}
        <div className="grid grid-cols-2 gap-3">
          <Card radius="lg">
            <Stat
              label="Вага"
              value={
                meas.latest?.weightKg != null
                  ? `${meas.latest.weightKg} кг`
                  : "—"
              }
              sublabel={
                meas.delta("weightKg") == null ? (
                  "Немає порівняння"
                ) : (
                  <span
                    className={cn(
                      "font-semibold",
                      meas.delta("weightKg") > 0
                        ? "text-warning"
                        : "text-success",
                    )}
                  >
                    {meas.delta("weightKg") > 0 ? "+" : ""}
                    {meas.delta("weightKg").toFixed(1)} кг
                  </span>
                )
              }
            />
          </Card>
          <Card radius="lg">
            <Stat
              label="% жиру"
              value={
                meas.latest?.bodyFatPct != null
                  ? `${meas.latest.bodyFatPct}%`
                  : "—"
              }
              sublabel={
                meas.delta("bodyFatPct") == null ? (
                  "—"
                ) : (
                  <span
                    className={cn(
                      "font-semibold",
                      meas.delta("bodyFatPct") > 0
                        ? "text-warning"
                        : "text-success",
                    )}
                  >
                    {meas.delta("bodyFatPct") > 0 ? "+" : ""}
                    {meas.delta("bodyFatPct").toFixed(1)}%
                  </span>
                )
              }
            />
          </Card>
        </div>

        {/* Weight trend chart */}
        {weightTrend.filter((d) => d.value != null).length >= 2 && (
          <Card radius="lg">
            <SectionHeading size="sm" className="mb-3">
              Тренд ваги
            </SectionHeading>
            <MiniLineChart
              data={weightTrend}
              unit="кг"
              color="rgb(22 163 74)"
              metricLabel="вагу тіла"
            />
          </Card>
        )}

        {/* Body fat trend chart */}
        {fatTrend.filter((d) => d.value != null).length >= 2 && (
          <Card radius="lg">
            <SectionHeading size="sm" className="mb-3">
              Тренд % жиру
            </SectionHeading>
            <MiniLineChart
              data={fatTrend}
              unit="%"
              color="rgb(234 179 8)"
              metricLabel="відсоток жиру"
            />
          </Card>
        )}

        {/* Wellbeing chart */}
        {wellbeingData.length >= 2 && (
          <Card radius="lg">
            <SectionHeading size="sm" className="mb-3">
              Самопочуття
            </SectionHeading>
            <WellbeingChart data={wellbeingData} />
          </Card>
        )}

        {/* Muscle volume bars */}
        <Card radius="lg" padding="lg">
          <SectionHeading size="sm" className="mb-3">
            Обʼєм по мʼязах
          </SectionHeading>
          {weeklyByMuscle.top.length === 0 ? (
            <EmptyState
              compact
              title="Поки що порожньо"
              description="Немає даних за останні 4 тижні."
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
                        width: `${Math.max(6, (m.value / weeklyByMuscle.max) * 100)}%`,
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
            ...new Set(prs.map((p) => p.muscleGroup).filter(Boolean)),
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
                  Рекорди (PR) · {prs.length}
                </SectionHeading>
                {filtered.length !== prs.length && (
                  <div className="text-xs text-subtle">
                    {filtered.length} показано
                  </div>
                )}
              </div>

              {/* Muscle group filter */}
              {muscleGroups.length > 1 && (
                <div className="flex gap-1.5 overflow-x-auto pb-2 mb-3 scrollbar-none">
                  <button
                    type="button"
                    onClick={() => setPrFilter("all")}
                    className={cn(
                      "shrink-0 px-3 h-7 rounded-full text-xs font-semibold transition-colors border",
                      prFilter === "all"
                        ? "bg-fizruk-strong text-white border-fizruk-strong"
                        : "bg-panel border-line text-subtle hover:text-text",
                    )}
                  >
                    Всі
                  </button>
                  {muscleGroups.map((g) => (
                    <button
                      key={g}
                      type="button"
                      onClick={() => setPrFilter(g === prFilter ? "all" : g)}
                      className={cn(
                        "shrink-0 px-3 h-7 rounded-full text-xs font-semibold transition-colors border whitespace-nowrap",
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
                      ? "Поки немає силових PR"
                      : "Немає PR для цієї групи мʼязів"
                  }
                  description={
                    prs.length === 0
                      ? "Заверши сети з вагою — рекорди зʼявляться тут автоматично."
                      : "Спробуй іншу групу або скинь фільтр."
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
                        className="w-full text-left border border-line rounded-2xl p-3 bg-bg hover:bg-panelHi transition-colors"
                        onClick={() => {
                          window.location.hash = `#exercise/${p.id}`;
                        }}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-2 min-w-0">
                            {medal && (
                              <span className="shrink-0 text-base leading-none">
                                {medal}
                              </span>
                            )}
                            <div className="text-sm font-semibold text-text truncate">
                              {p.name}
                            </div>
                          </div>
                          <div className="shrink-0 text-sm font-bold text-text tabular-nums">
                            {p.best1rm.toFixed(0)} кг
                          </div>
                        </div>
                        <div className="flex items-center gap-2 mt-0.5">
                          <span className="text-xs text-subtle tabular-nums">
                            {p.weightKg ?? 0} кг × {p.reps ?? 0}
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
                            <span className="ml-auto text-2xs px-2 py-0.5 rounded-full bg-fizruk/10 text-fizruk/70 font-medium shrink-0">
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

        {/* Data management */}
        <Card radius="lg" padding="lg">
          <SectionHeading as="div" size="sm" className="mb-3">
            Дані
          </SectionHeading>
          <button
            type="button"
            className="w-full py-4 rounded-full font-bold text-base bg-fizruk-strong text-white mb-2 transition-[background-color,box-shadow,opacity,transform] active:scale-[0.98]"
            onClick={exportJson}
          >
            Експорт (backup)
          </button>
          <Button
            className="w-full h-12 min-h-[44px] rounded-full"
            variant="ghost"
            onClick={exportCsv}
          >
            CSV
          </Button>
          <div className="mt-3">
            <Button
              variant="danger"
              className="w-full h-12"
              onClick={() => setResetConfirm(true)}
            >
              Скинути всі дані
            </Button>
          </div>
          <div className="text-xs text-subtle/70 mt-2">
            Порада: роби експорт перед великими змінами/оновленнями.
          </div>
        </Card>
      </div>

      <ConfirmDialog
        open={resetConfirm}
        title="Скинути всі дані Фізрука?"
        description="Усі тренування, вправи, шаблони та вимірювання будуть безповоротно видалені з цього пристрою. Рекомендуємо зробити експорт перед скиданням."
        confirmLabel="Скинути все"
        onConfirm={() => {
          setResetConfirm(false);
          resetAll();
        }}
        onCancel={() => setResetConfirm(false)}
      />
    </div>
  );
}
