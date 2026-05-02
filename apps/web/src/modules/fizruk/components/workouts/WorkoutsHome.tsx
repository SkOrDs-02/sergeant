import { useMemo } from "react";
import { Button } from "@shared/components/ui/Button";
import { Card } from "@shared/components/ui/Card";
import { computeWorkoutSummary } from "@sergeant/fizruk-domain/domain";

type WorkoutItem = ReadonlyArray<unknown>;

type WorkoutShape = {
  id: string;
  startedAt: string;
  endedAt?: string | null;
  items?: WorkoutItem;
};

export interface WorkoutsHomeProps {
  activeWorkout: WorkoutShape | null;
  activeDuration: string | null;
  recentWorkouts: ReadonlyArray<WorkoutShape>;
  onOpenSession: () => void;
  onOpenCatalog: () => void;
  onOpenTemplates: () => void;
  onOpenJournal: () => void;
  /**
   * Opens the start chooser (`QuickStartSheet`) instead of immediately
   * spinning up an empty session — the chooser itself is responsible
   * for creating the workout once the user picked a template or a set
   * of exercises.
   */
  onRequestStart: () => void;
  onOpenRetro: () => void;
}

export function WorkoutsHome({
  activeWorkout,
  activeDuration,
  recentWorkouts,
  onOpenSession,
  onOpenCatalog,
  onOpenTemplates,
  onOpenJournal,
  onRequestStart,
  onOpenRetro,
}: WorkoutsHomeProps) {
  const hasActive = !!activeWorkout && !activeWorkout.endedAt;

  return (
    <div className="space-y-4">
      {hasActive ? (
        <div className="rounded-xl border border-teal-500/40 bg-teal-500/10 p-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="text-xs font-semibold text-teal-700">
                Активне тренування
              </div>
              <div className="mt-1 text-sm text-text">
                <span className="font-bold">{activeDuration ?? "00:00"}</span>
                {" · "}
                {(activeWorkout?.items || []).length} вправ
              </div>
            </div>
            <Button className="h-11 px-4" onClick={onOpenSession}>
              Відкрити →
            </Button>
          </div>
        </div>
      ) : (
        <div className="rounded-xl border border-border bg-surface p-4 text-center">
          <div className="text-style-label text-text">
            Немає активного тренування
          </div>
          <div className="text-xs text-subtle mt-1">
            Почни нове — обереш шаблон або підбереш вправи перед стартом.
          </div>
          <div className="mt-3 grid grid-cols-1 gap-2">
            <Button className="h-12 text-base" onClick={onRequestStart}>
              ▶︎ Почати тренування
            </Button>
            <Button
              variant="ghost"
              className="h-12 text-base"
              onClick={onOpenRetro}
            >
              ✏️ Внести проведене заняття
            </Button>
          </div>
        </div>
      )}

      <Card as="section" radius="lg" aria-label="Останні тренування">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-style-label text-text">Останні тренування</h2>
          {recentWorkouts.length > 0 ? (
            <button
              type="button"
              className="text-xs font-semibold text-fizruk-strong hover:underline active:opacity-70"
              onClick={onOpenJournal}
            >
              Всі →
            </button>
          ) : null}
        </div>
        {recentWorkouts.length > 0 ? (
          <ul className="flex flex-col gap-2">
            {recentWorkouts.map((w) => (
              <li key={w.id}>
                <button
                  type="button"
                  className="w-full text-left rounded-xl border border-line bg-bg px-3 py-3 flex items-center justify-between hover:bg-panelHi transition-colors"
                  onClick={onOpenJournal}
                >
                  <RecentWorkoutSummary workout={w} />
                  <span className="text-subtle" aria-hidden>
                    ›
                  </span>
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <div className="rounded-2xl border border-dashed border-line p-4 text-xs text-subtle text-center">
            Після першого завершеного тренування тут з&apos;являться останні
            сесії.
          </div>
        )}
      </Card>

      <Card as="section" radius="lg" aria-label="Довідники">
        <h2 className="text-style-label text-text mb-3">Довідники</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <button
            type="button"
            className="rounded-2xl border border-line bg-bg p-4 text-left hover:bg-panelHi transition-colors"
            onClick={onOpenCatalog}
          >
            <div className="flex items-center gap-3">
              <span className="text-2xl" aria-hidden>
                📚
              </span>
              <div className="flex-1 min-w-0">
                <div className="text-style-label text-text">Каталог вправ</div>
                <div className="text-xs text-subtle mt-0.5">
                  Пошук · групи м&apos;язів · своя вправа
                </div>
              </div>
              <span className="text-subtle" aria-hidden>
                ›
              </span>
            </div>
          </button>
          <button
            type="button"
            className="rounded-2xl border border-line bg-bg p-4 text-left hover:bg-panelHi transition-colors"
            onClick={onOpenTemplates}
          >
            <div className="flex items-center gap-3">
              <span className="text-2xl" aria-hidden>
                📋
              </span>
              <div className="flex-1 min-w-0">
                <div className="text-style-label text-text">Шаблони</div>
                <div className="text-xs text-subtle mt-0.5">
                  Збережені набори вправ на швидкий старт
                </div>
              </div>
              <span className="text-subtle" aria-hidden>
                ›
              </span>
            </div>
          </button>
        </div>
      </Card>
    </div>
  );
}

interface RecentWorkoutSummaryProps {
  workout: WorkoutShape;
}

export function RecentWorkoutSummary({ workout }: RecentWorkoutSummaryProps) {
  const summary = useMemo(
    () => computeWorkoutSummary(workout as never),
    [workout],
  );
  const started = new Date(workout.startedAt);
  const dateLabel = started.toLocaleDateString("uk-UA", {
    day: "numeric",
    month: "short",
  });
  const parts: string[] = [];
  if (summary.itemCount > 0) parts.push(`${summary.itemCount} вправ`);
  if (summary.setCount > 0) parts.push(`${summary.setCount} сетів`);
  const durMin = summary.durationSec
    ? Math.max(1, Math.round(summary.durationSec / 60))
    : null;
  if (durMin !== null) parts.push(`${durMin} хв`);
  const subtitle = parts.length ? parts.join(" · ") : "порожнє тренування";

  return (
    <div className="flex-1 pr-2">
      <div className="flex items-center gap-2">
        <span className="text-style-label text-text">{dateLabel}</span>
        {!summary.isFinished ? (
          <span className="text-micro uppercase font-bold text-amber-700 bg-amber-500/15 px-2 py-0.5 rounded-full">
            Чернетка
          </span>
        ) : null}
      </div>
      <div className="text-xs text-subtle mt-0.5 truncate">{subtitle}</div>
    </div>
  );
}
