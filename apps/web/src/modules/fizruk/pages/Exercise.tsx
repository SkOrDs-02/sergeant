import { useMemo } from "react";
import { cn } from "@shared/lib/cn";
import { SectionHeading } from "@shared/components/ui/SectionHeading";
import { EmptyState } from "@shared/components/ui/EmptyState";
import { useExerciseCatalog } from "../hooks/useExerciseCatalog";
import { useWorkouts } from "../hooks/useWorkouts";
import { epley1rm, suggestNextSet } from "@sergeant/fizruk-domain";
import type { WorkoutSet } from "@sergeant/fizruk-domain/domain";
import { Card } from "@shared/components/ui/Card";

function fmt(n, digits = 0) {
  const x = Number(n);
  if (!Number.isFinite(x)) return "—";
  return x.toFixed(digits);
}

function roundTo2_5(kg) {
  return Math.round(kg / 2.5) * 2.5;
}

const CALC_ZONES = [
  {
    goal: "Сила",
    color: "text-danger",
    bgColor: "bg-danger/10",
    borderColor: "border-danger/20",
    percents: [95, 90, 85],
    desc: "85–95% від 1RM",
  },
  {
    goal: "Гіпертрофія",
    color: "text-success",
    bgColor: "bg-success/10",
    borderColor: "border-success/20",
    percents: [80, 75, 70, 65],
    desc: "65–80% від 1RM",
  },
  {
    goal: "Витривалість",
    color: "text-blue-500",
    bgColor: "bg-blue-500/10",
    borderColor: "border-blue-500/20",
    percents: [65, 60, 55, 50],
    desc: "50–65% від 1RM",
  },
];

function LoadCalculator({ oneRM }) {
  return (
    <Card radius="lg">
      <div className="flex items-baseline justify-between gap-2 mb-3">
        <SectionHeading as="div" size="sm">
          Калькулятор навантаження
        </SectionHeading>
        <div className="text-2xs text-subtle">1RM = {fmt(oneRM, 0)} кг</div>
      </div>
      <div className="space-y-3">
        {CALC_ZONES.map((zone) => (
          <div
            key={zone.goal}
            className={cn(
              "rounded-xl border p-3",
              zone.bgColor,
              zone.borderColor,
            )}
          >
            <div className="flex items-center justify-between mb-2">
              <span className={cn("text-xs font-bold", zone.color)}>
                {zone.goal}
              </span>
              <span className="text-2xs text-subtle">{zone.desc}</span>
            </div>
            <div className="grid grid-cols-4 gap-1">
              {zone.percents.map((pct) => {
                const kg = roundTo2_5(oneRM * (pct / 100));
                return (
                  <div
                    key={pct}
                    className="text-center bg-panel/60 rounded-xl py-1.5 px-1"
                  >
                    <div className="text-2xs text-subtle leading-none mb-0.5">
                      {pct}%
                    </div>
                    <div className="text-sm font-bold text-text tabular-nums leading-tight">
                      {kg > 0 ? `${kg}` : "—"}
                    </div>
                    <div className="text-2xs text-muted leading-none">кг</div>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
      <p className="text-2xs text-muted mt-2 text-center">
        Ваги округлені до найближчих 2.5 кг
      </p>
    </Card>
  );
}

function ProgressChart({ points, label, unit, color }) {
  if (!points || points.length < 2) {
    return (
      <div className="rounded-xl border border-dashed border-line bg-panelHi/50 py-6 text-center text-xs text-subtle">
        Потрібно щонайменше 2 тренування для графіка
      </div>
    );
  }

  const vals = points.map((p) => p.value);
  const minVal = Math.min(...vals);
  const maxVal = Math.max(...vals);
  const range = maxVal - minVal || 1;

  const w = 320;
  const h = 90;
  const padL = 38;
  const padR = 8;
  const padT = 10;
  const padB = 24;
  const innerW = w - padL - padR;
  const innerH = h - padT - padB;
  const n = points.length;
  const step = n > 1 ? innerW / (n - 1) : innerW;

  const mapped = points.map((p, i) => {
    const x = padL + i * step;
    const pct = (p.value - minVal) / range;
    const y = padT + innerH - pct * innerH;
    return { x, y, ...p };
  });

  const lineD = mapped
    .map((p, i) => `${i === 0 ? "M" : "L"} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`)
    .join(" ");

  const areaD = `${lineD} L ${mapped[mapped.length - 1].x.toFixed(1)} ${(padT + innerH).toFixed(1)} L ${mapped[0].x.toFixed(1)} ${(padT + innerH).toFixed(1)} Z`;

  const gradId = `prog_${label.replace(/\s/g, "_")}`;

  const yTicks = [0, 0.5, 1].map((fr) => ({
    y: padT + innerH * (1 - fr),
    lab: (minVal + fr * range).toFixed(0),
  }));

  const labelSet = new Set([0, n - 1]);
  if (n > 3) labelSet.add(Math.floor(n / 2));

  const lastVal = points[points.length - 1]?.value;
  const firstVal = points[0]?.value;
  const delta = lastVal - firstVal;

  return (
    <div className="w-full">
      <svg
        viewBox={`0 0 ${w} ${h}`}
        className="w-full h-auto max-h-[120px] overflow-visible"
        role="img"
        aria-label={`Графік ${label}`}
      >
        <defs>
          <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity="0.25" />
            <stop offset="100%" stopColor={color} stopOpacity="0" />
          </linearGradient>
        </defs>
        {yTicks.map((t, i) => (
          <g key={i}>
            <line
              x1={padL}
              x2={w - padR}
              y1={t.y}
              y2={t.y}
              stroke="currentColor"
              className="text-line/60"
              strokeWidth="1"
              strokeDasharray="3 4"
            />
            <text
              x={padL - 4}
              y={t.y + 4}
              textAnchor="end"
              fontSize="9"
              className="fill-subtle"
            >
              {t.lab}
            </text>
          </g>
        ))}
        <path d={areaD} fill={`url(#${gradId})`} />
        <path
          d={lineD}
          fill="none"
          stroke={color}
          strokeWidth="2.2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        {mapped.map((p, i) => (
          <circle
            key={i}
            cx={p.x}
            cy={p.y}
            r="3"
            fill={color}
            stroke="white"
            strokeWidth="1.5"
          />
        ))}
        {mapped.map((p, i) => {
          if (!labelSet.has(i)) return null;
          return (
            <text
              key={i}
              x={p.x}
              y={h - 4}
              textAnchor="middle"
              fontSize="8"
              className="fill-muted"
            >
              {p.dateLabel}
            </text>
          );
        })}
      </svg>
      <div className="flex items-baseline gap-2 mt-1">
        <span className="text-lg font-extrabold tabular-nums text-text">
          {fmt(lastVal, 1)} {unit}
        </span>
        {delta !== 0 && Number.isFinite(delta) && (
          <span
            className={cn(
              "text-xs font-semibold",
              delta > 0 ? "text-success" : "text-warning",
            )}
          >
            {delta > 0 ? "+" : ""}
            {delta.toFixed(1)} {unit}
          </span>
        )}
      </div>
    </div>
  );
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type HistoryEntry = { workout: any; item: any };
// Best/last sets carry an extra `_at` annotation that's not part of the
// canonical `WorkoutSet`, so we extend the domain type instead of
// shadowing the global `Set<T>` with `type Set = any`.
type WorkoutSetWithMeta = WorkoutSet & { _at?: string };
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Point = any;

export function Exercise({ exerciseId }) {
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

    if (history.length > 0) lastWorkoutId = history[0].workout?.id;

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
    const byWeek = new Map();
    for (const { workout, item } of history) {
      if (item?.type !== "strength" || !workout?.startedAt) continue;
      const d = new Date(workout.startedAt);
      const weekStart = new Date(d);
      weekStart.setDate(d.getDate() - ((d.getDay() + 6) % 7));
      weekStart.setHours(0, 0, 0, 0);
      const key = weekStart.toISOString().slice(0, 10);
      const sets = item.sets || [];
      let maxRm = 0;
      let vol = 0;
      for (const s of sets) {
        const rm = epley1rm(s.weightKg, s.reps);
        if (rm > maxRm) maxRm = rm;
        vol += (Number(s.weightKg) || 0) * (Number(s.reps) || 0);
      }
      const existing = byWeek.get(key) || { maxRm: 0, vol: 0, date: weekStart };
      byWeek.set(key, {
        maxRm: Math.max(existing.maxRm, maxRm),
        vol: existing.vol + vol,
        date: existing.date,
      });
    }

    const sorted = [...byWeek.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .slice(-12);

    const rmPoints = sorted.map(([, v]) => ({
      value: Math.round(v.maxRm),
      dateLabel: v.date.toLocaleDateString("uk-UA", {
        day: "numeric",
        month: "short",
      }),
    }));
    const volPoints = sorted.map(([, v]) => ({
      value: Math.round(v.vol),
      dateLabel: v.date.toLocaleDateString("uk-UA", {
        day: "numeric",
        month: "short",
      }),
    }));
    return { rmPoints, volPoints };
  }, [history]);

  const cardioData = useMemo(() => {
    const pacePoints: Point[] = [];
    const distPoints: Point[] = [];
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
          <h1 className="text-xl font-bold text-text leading-tight">
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
                  className="text-xs font-medium px-2.5 py-1 rounded-full bg-success/10 text-success border border-success/20"
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
            <SectionHeading as="div" size="xs">
              Особистий рекорд
            </SectionHeading>
            <div className="text-2xl font-extrabold text-text mt-1 tabular-nums">
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
            <SectionHeading as="div" size="xs">
              Наступного разу
            </SectionHeading>
            <div className="text-2xl font-extrabold text-text mt-1 tabular-nums">
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
            <ProgressChart
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
            <ProgressChart
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
            <ProgressChart
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
            <ProgressChart
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
