import { useId } from "react";
import type { Workout } from "@sergeant/fizruk-domain";
import {
  isoToDatetimeLocalValue,
  datetimeLocalValueToIso,
} from "./activeWorkoutLib";

/**
 * Collapsible <details> editor for the workout's `startedAt` / `endedAt`
 * timestamps. The end input only appears once the workout is actually
 * ended, matching the legacy panel behaviour.
 *
 * Lives inside `ActiveWorkoutPanel`. Extracted so the panel's body can
 * focus on the items list rather than form plumbing.
 */
export interface WorkoutTimeEditorProps {
  activeWorkout: Workout;
  updateWorkout: (id: string, patch: Partial<Workout>) => void;
}

export function WorkoutTimeEditor({
  activeWorkout,
  updateWorkout,
}: WorkoutTimeEditorProps) {
  const fieldsId = useId();
  const startId = `${fieldsId}-started`;
  const endId = `${fieldsId}-ended`;

  return (
    <details className="mt-3 rounded-xl border border-line bg-panelHi/50 px-3 py-2">
      <summary className="text-xs font-semibold text-subtle cursor-pointer select-none">
        Час тренування
      </summary>
      <div className="mt-2 space-y-2">
        <label className="block text-2xs text-subtle" htmlFor={startId}>
          Початок
        </label>
        <input
          id={startId}
          type="datetime-local"
          className="input-focus-fizruk w-full h-11 rounded-xl border border-line bg-panelHi px-3 text-sm text-text"
          value={isoToDatetimeLocalValue(activeWorkout.startedAt)}
          onChange={(e) => {
            const iso = datetimeLocalValueToIso(e.target.value);
            if (iso) updateWorkout(activeWorkout.id, { startedAt: iso });
          }}
        />
        {activeWorkout.endedAt ? (
          <>
            <label className="block text-2xs text-subtle" htmlFor={endId}>
              Завершення (можна виправити після занесення)
            </label>
            <input
              id={endId}
              type="datetime-local"
              className="input-focus-fizruk w-full h-11 rounded-xl border border-line bg-panelHi px-3 text-sm text-text"
              value={isoToDatetimeLocalValue(activeWorkout.endedAt)}
              onChange={(e) => {
                const iso = datetimeLocalValueToIso(e.target.value);
                updateWorkout(activeWorkout.id, { endedAt: iso || null });
              }}
            />
          </>
        ) : null}
      </div>
    </details>
  );
}
