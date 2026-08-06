/**
 * Last validated: 2026-05-14
 * Status: Active
 */
import { useMemo } from "react";
import type { FizrukPage } from "../shell/fizrukRoute";
import { cn } from "@shared/lib/ui/cn";
import { SectionHeading } from "@shared/components/ui/SectionHeading";
import { EmptyState } from "@shared/components/ui/EmptyState";
import { Icon } from "@shared/components/ui/Icon";
import { Measure } from "@shared/components/ui/Measure";
import { useExerciseCatalog } from "../hooks/useExerciseCatalog";
import { useWorkouts } from "../hooks/useWorkouts";
import { useInjuries } from "../hooks/useInjuries";
import {
  latestClearedInjuryAtForExercise,
  suggestNextSet,
} from "@sergeant/fizruk-domain";
import {
  collectExerciseHistory,
  computeExerciseBest,
  computeOneRmAgingForSummary,
} from "@sergeant/fizruk-domain/domain";
import { Card } from "@shared/components/ui/Card";
import { messages } from "@shared/i18n/uk";
import { LoadCalculator } from "../components/LoadCalculator";
import { ReturnProtocolNotice } from "../components/exercise/ReturnProtocolNotice";
import {
  ExerciseProgressChart,
  type ProgressPoint,
} from "../components/ExerciseProgressChart";
import { buildStrengthProgressData } from "../lib/exerciseProgress";
import { chartSeries, chartStatusSeries } from "@shared/charts";

interface ExerciseProps {
  exerciseId: string;
  /**
   * Path-based navigation back to the journal. Used by the «Перейти до
   * журналу» CTA at the bottom of the exercise card. We can’t hash-
   * assign anymore (initiative 0006 §Phase 2.c migrated Fizruk to
   * react-router; `window.location.hash = ...` only updates the URL
   * hash and does not trigger a re-render).
   */
  onNavigate: (page: FizrukPage) => void;
}

export function Exercise({ exerciseId, onNavigate }: ExerciseProps) {
  const { exercises, musclesUk } = useExerciseCatalog();
  const { workouts } = useWorkouts();
  const { all: injuryMarks } = useInjuries();

  const ex = useMemo(
    () => (exercises || []).find((x) => x?.id === exerciseId) || null,
    [exercises, exerciseId],
  );

  // Один агрегат на веб і мобілку: сторінка колись мала власну копію цього
  // фолду, і саме тому старіння 1RM (канон §6) було нікуди додати.
  const history = useMemo(
    () => collectExerciseHistory(workouts, exerciseId),
    [workouts, exerciseId],
  );

  const best = useMemo(() => computeExerciseBest(history), [history]);

  /**
   * Старіння 1RM + протокол повернення (канон §6). Зняття позначки травми
   * теж вводить у мʼякий режим — це закриття розриву E-5 з ADR-0083.
   */
  const aging = useMemo(
    () =>
      computeOneRmAgingForSummary(best, {
        injuryClearedAt: latestClearedInjuryAtForExercise(ex, injuryMarks),
      }),
    [best, ex, injuryMarks],
  );

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

  // Audit 06 F7: when the deep-link carries an `exerciseId` that does not
  // match the catalog AND there is no history for it either, the page
  // would otherwise render a blank skeleton with a confusing "Поки немає
  // записів" empty state. Surface the real cause (deleted / stale share-
  // card / typo) and route the user back to the journal.
  if (exerciseId && !ex && history.length === 0) {
    return (
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-4xl mx-auto px-4 pt-4 page-tabbar-pad">
          <Card radius="lg" padding="lg">
            <EmptyState
              title="Вправу не знайдено"
              description="Можливо, її видалили з каталогу. Повернись до журналу і обери зі списку."
              action={
                onNavigate ? (
                  <button
                    type="button"
                    onClick={() => onNavigate("workouts")}
                    className="min-h-touch-target inline-flex items-center justify-center rounded-2xl bg-fizruk-strong text-white px-4 text-style-label"
                  >
                    До журналу
                  </button>
                ) : undefined
              }
            />
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
                  className="text-style-caption px-2.5 py-1 rounded-full bg-success/10 text-success-strong dark:text-success border border-success/20"
                >
                  {m}
                </span>
              ))}
            </div>
          )}
          {muscleLabels.length === 0 && (
            <p className="text-style-caption text-subtle mt-1">
              Профіль вправи
            </p>
          )}
        </div>

        {/*
          Канон §6: у режимі повернення порівняння з піком ховаємо — і
          святкування, і констатацію регресу. Людина щойно повернулась;
          мірятись із власним рекордом тут не час.
        */}
        {best.isNewPR && !aging.returnMode && (
          <div className="flex items-center gap-2.5 rounded-2xl border border-warning/40 bg-warning/10 px-4 py-3">
            <Icon name="award" size={20} aria-hidden />
            <div>
              <p className="text-style-label text-warning-strong dark:text-warning">
                Новий особистий рекорд!
              </p>
              <p className="text-style-caption text-warning-strong/80 dark:text-warning/70">
                Найкращий результат за всю історію
              </p>
            </div>
          </div>
        )}

        <ReturnProtocolNotice aging={aging} />

        {best.isRegression && !aging.returnMode && (
          <div className="rounded-2xl border border-line bg-panel px-4 py-3">
            <p className="text-style-label text-text">
              {`${messages.fizruk.oneRmAging.regressionTitle} · ${best.deltaVsPeakPct}%`}
            </p>
            <p className="text-style-caption text-subtle">
              {messages.fizruk.oneRmAging.regressionNote}
            </p>
          </div>
        )}

        <div className="grid grid-cols-2 gap-3">
          <Card radius="lg">
            <SectionHeading as="div" size="xs" variant="fizruk">
              Особистий рекорд
            </SectionHeading>
            <div className="text-style-headline text-text mt-1 tabular-nums">
              {best.best1rm ? <Measure value={best.best1rm} unit="кг" /> : "—"}
            </div>
            <div className="text-style-caption text-subtle mt-1">
              {best.bestSet ? (
                <>
                  <Measure value={best.bestSet.weightKg ?? 0} unit="кг" /> ×{" "}
                  <Measure value={best.bestSet.reps ?? 0} unit="повт." />
                </>
              ) : (
                "Немає силових сетів"
              )}
            </div>
            {best.bestSet?.at && (
              <div className="text-style-caption text-subtle/70 mt-1">
                {new Date(best.bestSet.at).toLocaleDateString("uk-UA", {
                  day: "numeric",
                  month: "short",
                  year: "2-digit",
                })}
              </div>
            )}
            {aging.isStale && (
              <div className="text-style-caption text-subtle mt-1">
                {messages.fizruk.prBoard.staleBadge}
              </div>
            )}
          </Card>
          <Card radius="lg">
            <SectionHeading as="div" size="xs" variant="fizruk">
              Наступного разу
            </SectionHeading>
            <div className="text-style-headline text-text mt-1 tabular-nums">
              {suggestedNext ? (
                <Measure
                  value={suggestedNext.weightKg}
                  unit="кг"
                  fractionDigits={1}
                />
              ) : (
                "—"
              )}
            </div>
            <div className="text-style-caption text-subtle mt-1">
              {suggestedNext ? (
                <>
                  × <Measure value={suggestedNext.reps} unit="повт." />
                </>
              ) : (
                "Заповни сети, щоб зʼявилась рекомендація"
              )}
            </div>
            {/* Обидва поля в гейті, а не одне: `altReps` теж необовʼязкове,
                і шаблонний рядок до цього виводив би буквальне
                «undefined повт.». Типізація це показала, бо `Measure`
                приймає число, а не рядок. */}
            {suggestedNext?.altWeightKg != null &&
              suggestedNext.altReps != null && (
                <div className="text-style-caption text-fizruk mt-1">
                  або{" "}
                  <Measure
                    value={suggestedNext.altWeightKg}
                    unit="кг"
                    fractionDigits={1}
                  />{" "}
                  × <Measure value={suggestedNext.altReps} unit="повт." />
                </div>
              )}
            {suggestedNext && best.lastTop && (
              <div className="text-style-caption text-subtle/70 mt-1">
                зараз: <Measure value={best.lastTop.weightKg ?? 0} unit="кг" />{" "}
                × <Measure value={best.lastTop.reps ?? 0} unit="повт." />
              </div>
            )}
          </Card>
        </div>

        {hasStrength && (
          <Card radius="lg">
            <SectionHeading
              as="div"
              size="sm"
              className="mb-3"
              variant="fizruk"
            >
              Прогресія 1RM (за тижнями)
            </SectionHeading>
            <ExerciseProgressChart
              points={progressData.rmPoints}
              label="1RM"
              unit="кг"
              color={chartStatusSeries.success}
            />
          </Card>
        )}

        {hasStrength && (
          <Card radius="lg">
            <SectionHeading
              as="div"
              size="sm"
              className="mb-3"
              variant="fizruk"
            >
              Обʼєм тренування (кг × повтори, за тижнями)
            </SectionHeading>
            <ExerciseProgressChart
              points={progressData.volPoints}
              label="Обсяг"
              unit="кг"
              color={chartSeries.fizruk.primary}
            />
          </Card>
        )}

        {hasCardio && (
          <Card radius="lg">
            <SectionHeading
              as="div"
              size="sm"
              className="mb-3"
              variant="fizruk"
            >
              Темп (хв/км) — кардіо
            </SectionHeading>
            <ExerciseProgressChart
              points={cardioData.pacePoints}
              label="Темп"
              unit="хв/км"
              color={chartStatusSeries.warning}
            />
            <div className="text-style-caption text-subtle mt-1">
              Менше — краще (швидший темп)
            </div>
          </Card>
        )}

        {hasCardio && (
          <Card radius="lg">
            <SectionHeading
              as="div"
              size="sm"
              className="mb-3"
              variant="fizruk"
            >
              Дистанція (км) — кардіо
            </SectionHeading>
            <ExerciseProgressChart
              points={cardioData.distPoints}
              label="Дистанція"
              unit="км"
              color={chartStatusSeries.info}
            />
          </Card>
        )}

        {/*
          AI-DANGER: сюди йде `reference1rm`, а НЕ пік. Це число людина кладе
          на штангу; повернення його до `best.best1rm` знімає рівно той
          захист, заради якого існує §6 канону.
        */}
        {aging.reference1rm > 0 && (
          <LoadCalculator
            oneRM={aging.reference1rm}
            reduced={aging.reductionPct > 0}
          />
        )}

        <Card radius="lg" padding="lg">
          <SectionHeading as="div" size="sm" className="mb-3" variant="fizruk">
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
                    <div className="text-style-caption text-subtle">
                      {workout?.startedAt
                        ? new Date(workout.startedAt).toLocaleDateString(
                            "uk-UA",
                            { month: "short", day: "numeric", year: "2-digit" },
                          )
                        : "—"}
                    </div>
                    <div
                      className={cn(
                        "text-style-caption px-2 py-1 rounded-full border",
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
              onClick={() => onNavigate("workouts")}
            >
              Перейти до журналу
            </button>
          </div>
        </Card>
      </div>
    </div>
  );
}
