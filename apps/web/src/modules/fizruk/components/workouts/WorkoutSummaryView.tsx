/**
 * Last validated: 2026-08-08
 * Status: Active
 *
 * Read-only summary for a *finished* workout, rendered by
 * `WorkoutJournalSection` on the route-owned `/fizruk/workout/<id>` page
 * once `activeWorkout.endedAt` is set (02-A). Replaces the previous
 * dead-end: the route used to keep rendering the full editable
 * `ActiveWorkoutPanel` (or, worse, an "Активне тренування не знайдено"
 * error state stacked under the finish sheets) after «Завершити».
 *
 * Deliberately NOT built on `ActiveWorkoutPanel` / `WorkoutItemsList` —
 * those own the editable in-flight UI (warm-up checklist, superset
 * controls, per-set inputs) which is the wrong shape for a glance-back
 * summary. This component only ever reads `Workout`, never mutates it.
 */
import { Card } from "@shared/components/ui/Card";
import { Button } from "@shared/components/ui/Button";
import { Icon } from "@shared/components/ui/Icon";
import { Measure } from "@shared/components/ui/Measure";
import {
  formatDurShort,
  summarizeWorkoutForFinish,
} from "@sergeant/fizruk-domain";
import {
  computeWorkoutSetCount,
  computeWorkoutTonnageKg,
  type Workout,
  type WorkoutItem,
} from "@sergeant/fizruk-domain/domain";
import { messages } from "@shared/i18n/uk";
import { WorkoutStatTile } from "./WorkoutStatTile";

export interface WorkoutSummaryViewProps {
  workout: Workout;
  /** 02-A item 4 — starts a new session with the same exercises, no sets. */
  onRepeat: () => void;
}

/** One-line "what happened" caption for a single exercise entry. */
function formatItemDetail(item: WorkoutItem): string {
  if (item.type === "strength") {
    const sets = item.sets || [];
    if (sets.length === 0) return "—";
    return sets.map((s) => `${s.weightKg ?? 0}×${s.reps ?? 0}`).join(", ");
  }
  if (item.type === "distance") {
    const distM = Number(item.distanceM) || 0;
    const durSec = Number(item.durationSec) || 0;
    return `${distM} м · ${formatDurShort(durSec)}`;
  }
  return formatDurShort(Number(item.durationSec) || 0);
}

export function WorkoutSummaryView({
  workout,
  onRepeat,
}: WorkoutSummaryViewProps) {
  const copy = messages.fizruk.workoutSummary;
  const summary = summarizeWorkoutForFinish(workout);
  const setCount = computeWorkoutSetCount(workout);
  const tonnageKg = computeWorkoutTonnageKg(workout);
  const items = workout.items || [];
  const wellbeing = workout.wellbeing;
  const hasWellbeing = Boolean(
    wellbeing && (wellbeing.energy != null || wellbeing.mood != null),
  );

  return (
    <Card radius="lg">
      <div>
        <div className="text-style-label text-text">{copy.title}</div>
        <div className="text-style-caption text-subtle mt-0.5">
          {new Date(workout.startedAt).toLocaleString("uk-UA", {
            month: "short",
            day: "numeric",
            hour: "2-digit",
            minute: "2-digit",
          })}
          {summary ? (
            <span className="ml-2">
              · {formatDurShort(summary.durationSec)}
            </span>
          ) : null}
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2 mt-3">
        <WorkoutStatTile
          label={copy.itemsLabel}
          value={items.length}
          size="lg"
        />
        <WorkoutStatTile label={copy.setsLabel} value={setCount} size="lg" />
        <WorkoutStatTile
          label={copy.volumeLabel}
          value={
            tonnageKg > 0 ? (
              <Measure value={Math.round(tonnageKg)} unit={copy.kgUnit} />
            ) : (
              "—"
            )
          }
          size="lg"
        />
      </div>

      {hasWellbeing && (
        <div className="mt-3 flex items-center gap-2 text-style-caption text-subtle">
          <span>{copy.wellbeingPrefix}</span>
          <span className="font-semibold text-text">
            {copy.energyLabel} {wellbeing?.energy ?? "—"}
            {copy.outOfFive}
            {" · "}
            {copy.moodLabel} {wellbeing?.mood ?? "—"}
            {copy.outOfFive}
          </span>
        </div>
      )}

      {items.length > 0 && (
        <ul className="mt-3 space-y-2">
          {items.map((item) => (
            <li
              key={item.id}
              className="rounded-xl border border-line bg-bg px-3 py-2.5"
            >
              <div className="text-style-label text-text">{item.nameUk}</div>
              <div className="text-style-caption text-subtle mt-0.5">
                {formatItemDetail(item)}
              </div>
            </li>
          ))}
        </ul>
      )}

      {workout.note && (
        <div className="mt-3">
          <div className="text-style-caption text-subtle">
            {copy.noteHeading}
          </div>
          <p className="text-style-caption text-text mt-0.5 whitespace-pre-wrap">
            {workout.note}
          </p>
        </div>
      )}

      <Button
        module="fizruk"
        className="w-full h-12 mt-4"
        type="button"
        onClick={onRepeat}
      >
        <Icon name="refresh-cw" size={16} aria-hidden /> {copy.repeatCta}
      </Button>
    </Card>
  );
}
