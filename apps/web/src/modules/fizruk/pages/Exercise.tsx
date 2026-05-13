import { useMemo } from "react";
import { cn } from "@shared/lib/ui/cn";
import { SectionHeading } from "@shared/components/ui/SectionHeading";
import { EmptyState } from "@shared/components/ui/EmptyState";
import { useExerciseCatalog } from "../hooks/useExerciseCatalog";
import { useWorkouts } from "../hooks/useWorkouts";
import { epley1rm, suggestNextSet } from "@sergeant/fizruk-domain";
import type {
  Workout,
  WorkoutItem,
  WorkoutSet,
} from "@sergeant/fizruk-domain/domain";
import { Card } from "@shared/components/ui/Card";
import { LoadCalculator } from "../components/LoadCalculator";
import {
  ExerciseProgressChart,
  type ProgressPoint,
} from "../components/ExerciseProgressChart";
import { buildStrengthProgressData } from "../lib/exerciseProgress";
import { fmt } from "../lib/numberFmt";

interface HistoryEntry {
  workout: Workout;
  item: WorkoutItem;
}
// Best/last sets carry an extra `_at` annotation that's not part of the
// canonical `WorkoutSet`, so we extend the domain type instead of
// shadowing the global `Set<T>` with `type Set = any`.
type WorkoutSetWithMeta = WorkoutSet & { _at?: string };

export function Exercise({ exerciseId }: { exerciseId: string }) {
  const { exercises, musclesUk } = useExerciseCatalog();
  const { workouts } = useWorkouts();

  const ex = useMemo(
    () => (exercises || []).find((x) => x?.id === exerciseId) || null,
    [exercises, exerciseId],
  );

  const history = useMemo(() => {
    const out: HistoryEntry[] = [];
    for (const w of workouts || []) {
      for (const it of w.items || []) {
        if (it.exerciseId !== exerciseId) continue;
        out.push({ workout: w, item: it });
      }
    }
    return out.sort((a, b) =>
      (b.workout?.startedAt || "").localeCompare(a.workout?.startedAt || ""),
    );
  }, [workouts, exerciseId]);

  const best = useMemo(() => {
    let best1rm = 0;
    let bestSet: WorkoutSetWithMeta | null = null;
    let lastTopSet: WorkoutSetWithMeta | null = null;
    let lastTopEst = 0;
    let lastWorkoutId: string | null = null;
    let lastWorkoutBest1rm = 0;
    let priorBest1rm = 0;

    if (history.length > 0) lastWorkoutId = history[0]!.workout?.id;

    for (const { workout, item } of history) {
      if (item?.type !== "strength") continue;
      const isLatest = workout?.id === lastWorkoutId;
      const sets = item.sets || [];
      for (const s of sets) {
        const est = epley1rm(s.weightKg, s.reps);
        if (est > best1rm) {
          best1rm = est;
          bestSet = { ...s, _at: workout?.startedAt };
        }
        if (isLatest) {
          if (est > lastWorkoutBest1rm) lastWorkoutBest1rm = est;
          if (est > lastTopEst) {
            lastTopEst = est;
            lastTopSet = { ...s, _at: workout?.startedAt };
          }
        } else {
          if (est > priorBest1rm) priorBest1rm = est;
        }
      }
    }

    const isNewPR = lastWorkoutBest1rm > 0 && lastWorkoutBest1rm > priorBest1rm;
    return { best1rm, bestSet, lastTop: lastTopSet, isNewPR };
  }, [history]);

  const suggestedNext = useMemo(
    () => suggestNextSet(best.lastTop),
    [best.lastTop],
  );

  const muscleLabels = useMemo(() => {
    const ids = ex?.muscles?.primary || [];
    return ids.map((id) => musclesUk?.[id] || id).filter(Boolean);
  }, [ex, musclesUk]);

  const progressData = useMemo(() => {
    return buildStrengthProgressData(history);
  }, [history]);

  const cardioData = useMemo(() => {
    const pacePoints: ProgressPoint[] = [];
    const distPoints: ProgressPoint[] = [];
    for (const { workout, item } of [...history].reverse()) {
      if (item?.type !== "distance" || !workout?.startedAt) continue;
      const dist = Number(item.distanceM) || 0;
      const dur = Number(item.durationSec) || 0;
      if (dist <= 0 || dur <= 0) continue;
      const distKm = dist / 1000;
      const durMin = dur / 60;
      const paceMinKm = durMin / distKm;
      const dateLabel = new Date(workout.startedAt).toLocaleDateString(
        "uk-UA",
        { day: "numeric", month: "short" },
      );
      pacePoints.push({ value: Math.round(paceMinKm * 10) / 10, dateLabel });
      distPoints.push({ value: Math.round(distKm * 100) / 100, dateLabel });
    }
    return {
      pacePoints: pacePoints.slice(-12),
      distPoints: distPoints.slice(-12),
    };
  }, [history]);

  const hasCardio = cardioData.pacePoints.length > 0;
  const hasStrength =
    progressData.rmPoints.length > 0 ||
    history.some((h) => h.item?.type === "strength");

  if (!exerciseId) {
    return (
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-4xl mx-auto px-4 pt-4 page-tabbar-pad">
          <Card radius="lg" padding="lg" className="text-sm text-subtle">
            Невірний ID вправи
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="max-w-4xl mx-auto px-4 pt-4 page-tabbar-pad space-y-3">
        <div>
          <h1 className="text-style-title text-text leading-tight">
            {ex?.name?.uk ||
              ex?.name?.en ||
              history?.[0]?.item?.nameUk ||
              "Вправа"}
          </h1>
          {muscleLabels.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mt-2">
              {muscleLabels.map((m) => (
                <span
                  key={m}
                  className="text-style-caption px-2.5 py-1 rounded-full bg-success/10 text-success border border-success/20"
                >
                  {m}
                </span>
              ))}
            </div>
          )}
          {muscleLabels.length === 0 && (
            <p className="text-xs text-subtle mt-1">Профіль вправи</p>
          )}
        </div>

        {best.isNewPR && (
          <div className="flex items-center gap-2.5 rounded-2xl border border-yellow-400/40 bg-yellow-400/10 px-4 py-3">
            <span className="text-xl leading-none">🏆</span>
            <div>
              <p className="text-sm font-bold text-warning-strong dark:text-warning">
                Новий особистий рекорд!
              </p>
              <p className="text-xs text-warning-strong/80 dark:text-warning/70">
                Найкращий результат за всю історію
              </p>
            </div>
          </div>
        )}

        <div className="grid grid-cols-2 gap-3">
          <Card radius="lg">
            <SectionHeading as="div" size="xs" variant="fizruk">
              Особистий рекорд
            </SectionHeading>
            <div className="text-style-hero text-text mt-1 tabular-nums">
              {best.best1rm ? `${fmt(best.best1rm, 0)} кг` : "—"}
            </div>
            <div className="text-xs text-subtle mt-1">
              {best.bestSet
                ? `${best.bestSet.weightKg ?? 0} × ${best.bestSet.reps ?? 0} повт.`
                : "Немає силових сетів"}
            </div>
            {best.bestSet?._at && (
              <div className="text-2xs text-subtle/70 mt-1">
                {new Date(best.bestSet._at).toLocaleDateString("uk-UA", {
                  day: "numeric",
                  month: "short",
                  year: "2-digit",
                })}
              </div>
            )}
          </Card>
          <Card radius="lg">
            <SectionHeading as="div" size="xs" variant="fizruk">
              Наступного разу
            </SectionHeading>
            <div className="text-style-hero text-text mt-1 tabular-nums">
              {suggestedNext ? `${fmt(suggestedNext.weightKg, 1)} кг` : "—"}
            </div>
            <div className="text-xs text-subtle mt-1">
              {suggestedNext
                ? `× ${suggestedNext.reps} повт.`
                : "Заповни сети, щоб зʼявилась рекомендація"}
            </div>
            {suggestedNext?.altWeightKg != null && (
              <div className="text-2xs text-fizruk mt-1">
                {`або ${fmt(suggestedNext.altWeightKg, 1)} × ${suggestedNext.altReps} повт.`}
              </div>
            )}
            {suggestedNext && best.lastTop && (
              <div className="text-2xs text-subtle/70 mt-1">
                {`зараз: ${best.lastTop.weightKg ?? 0} × ${best.lastTop.reps ?? 0}`}
              </div>
            )}
          </Card>
        </div>

        {hasStrength && (
          <Card radius="lg">
            <SectionHeading as="div" size="sm" className="mb-3">
              Прогресія 1RM (за тижнями)
            </SectionHeading>
            <ExerciseProgressChart
              points={progressData.rmPoints}
              label="1RM"
              unit="кг"
              color="rgb(22 163 74)"
            />
          </Card>
        )}

        {hasStrength && (
          <Card radius="lg">
            <SectionHeading as="div" size="sm" className="mb-3">
              Обʼєм тренування (кг × повтори, за тижнями)
            </SectionHeading>
            <ExerciseProgressChart
              points={progressData.volPoints}
              label="Обсяг"
              unit="кг"
              color="rgb(99 102 241)"
            />
          </Card>
        )}

        {hasCardio && (
          <Card radius="lg">
            <SectionHeading as="div" size="sm" className="mb-3">
              Темп (хв/км) — кардіо
            </SectionHeading>
            <ExerciseProgressChart
              points={cardioData.pacePoints}
              label="Темп"
              unit="хв/км"
              color="rgb(234 88 12)"
            />
            <div className="text-2xs text-subtle mt-1">
              Менше — краще (швидший темп)
            </div>
          </Card>
        )}

        {hasCardio && (
          <Card radius="lg">
            <SectionHeading as="div" size="sm" className="mb-3">
              Дистанція (км) — кардіо
            </SectionHeading>
            <ExerciseProgressChart
              points={cardioData.distPoints}
              label="Дистанція"
              unit="км"
              color="rgb(6 182 212)"
            />
          </Card>
        )}

        {best.best1rm > 0 && <LoadCalculator oneRM={best.best1rm} />}

        <Card radius="lg" padding="lg">
          <SectionHeading as="div" size="sm" className="mb-3">
            Історія сетів
          </SectionHeading>
          {history.length === 0 ? (
            <EmptyState
              compact
              title="Поки немає записів"
              description="Заверши хоча б один підхід — історія зʼявиться тут."
            />
          ) : (
            <div className="space-y-2">
              {history.slice(0, 20).map(({ workout, item }) => (
                <div
                  key={`${workout.id}_${item.id}`}
                  className="border border-line rounded-2xl p-3 bg-bg"
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="text-xs text-subtle">
                      {workout?.startedAt
                        ? new Date(workout.startedAt).toLocaleDateString(
                            "uk-UA",
                            { month: "short", day: "numeric", year: "2-digit" },
                          )
                        : "—"}
                    </div>
                    <div
                      className={cn(
                        "text-2xs px-2 py-1 rounded-full border",
                        item.type === "strength"
                          ? "border-line text-subtle"
                          : "border-line text-subtle",
                      )}
                    >
                      {item.type === "strength"
                        ? "силова"
                        : item.type === "distance"
                          ? "дистанція"
                          : "час"}
                    </div>
                  </div>
                  <div className="text-sm text-text mt-2">
                    {item.type === "strength"
                      ? (item.sets || [])
                          .map((s) => `${s.weightKg ?? 0}×${s.reps ?? 0}`)
                          .join(", ") || "—"
                      : item.type === "distance"
                        ? (() => {
                            const dist = Number(item.distanceM) || 0;
                            const dur = Number(item.durationSec) || 0;
                            const base = `${dist} м за ${dur} с`;
                            if (dist > 0 && dur > 0) {
                              const distKm = dist / 1000;
                              const paceMinKm = dur / 60 / distKm;
                              let pm = Math.floor(paceMinKm);
                              let ps = Math.round((paceMinKm - pm) * 60);
                              if (ps >= 60) {
                                pm += 1;
                                ps = 0;
                              }
                              const speed = (distKm / (dur / 3600)).toFixed(1);
                              return `${base} · ${pm}:${String(ps).padStart(2, "0")} хв/км · ${speed} км/год`;
                            }
                            return base;
                          })()
                        : `${item.durationSec ?? 0} с`}
                  </div>
                </div>
              ))}
            </div>
          )}

          <div className="mt-3">
            <button
              type="button"
              className="w-full py-4 rounded-full font-bold text-base bg-fizruk-strong text-white"
              // eslint-disable-next-line sergeant-design/no-hash-router-in-modules -- pre-existing hash-router callsite; migration tracked in initiative 0006.
              onClick={() => (window.location.hash = "#workouts")}
            >
              Перейти до журналу
            </button>
          </div>
        </Card>
      </div>
    </div>
  );
}
