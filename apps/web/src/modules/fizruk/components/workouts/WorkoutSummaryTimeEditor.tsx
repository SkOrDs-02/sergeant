/**
 * Last validated: 2026-10-22
 * Status: Active
 *
 * Редактор початку й кінця на підсумку ЗАВЕРШЕНОГО тренування (аудит
 * 2026-10-01, data-37). Завершене тренування відкривалось read-only без
 * жодного способу виправити час, тож забута сесія лишалась десятками годин
 * назавжди. Окремо від `WorkoutTimeEditor` (живий `<details>` активної сесії),
 * бо тут кінець не можна очистити (це «розвернуло» б тренування в активне) і
 * правка проходить перевірку: кінець після початку й не в майбутньому.
 */
import { useState } from "react";
import { Button } from "@shared/components/ui/Button";
import { messages } from "@shared/i18n/uk";
import type { Workout } from "@sergeant/fizruk-domain/domain";
import {
  datetimeLocalValueToIso,
  isoToDatetimeLocalValue,
} from "./activeWorkoutLib";
import { isValidSessionWindow } from "../../lib/sessionDuration";

export interface WorkoutSummaryTimeEditorProps {
  workout: Workout;
  onUpdateTimes: (patch: { startedAt: string; endedAt: string }) => void;
}

const INPUT_CLASS =
  "input-focus-fizruk block w-full min-w-0 h-11 rounded-lg border border-line bg-panel px-3 text-style-body text-text";

export function WorkoutSummaryTimeEditor({
  workout,
  onUpdateTimes,
}: WorkoutSummaryTimeEditorProps) {
  const copy = messages.fizruk.workoutSummary.timeEditor;
  const [open, setOpen] = useState(false);
  const [start, setStart] = useState(
    isoToDatetimeLocalValue(workout.startedAt),
  );
  const [end, setEnd] = useState(isoToDatetimeLocalValue(workout.endedAt));

  if (!workout.endedAt) return null;

  const startIso = datetimeLocalValueToIso(start);
  const endIso = datetimeLocalValueToIso(end);
  const valid = isValidSessionWindow(startIso, endIso);

  if (!open) {
    return (
      <Button
        variant="ghost"
        className="mt-2"
        type="button"
        onClick={() => setOpen(true)}
      >
        {copy.edit}
      </Button>
    );
  }

  return (
    <div className="mt-3 space-y-2 rounded-panel border border-line bg-panelHi p-3">
      <label
        className="block text-style-caption text-subtle"
        htmlFor="summary-start"
      >
        {copy.startLabel}
      </label>
      <input
        id="summary-start"
        type="datetime-local"
        className={INPUT_CLASS}
        value={start}
        onChange={(e) => setStart(e.target.value)}
      />
      <label
        className="block text-style-caption text-subtle"
        htmlFor="summary-end"
      >
        {copy.endLabel}
      </label>
      <input
        id="summary-end"
        type="datetime-local"
        className={INPUT_CLASS}
        value={end}
        onChange={(e) => setEnd(e.target.value)}
      />
      {!valid ? (
        <p className="text-style-caption text-danger" role="alert">
          {copy.invalid}
        </p>
      ) : null}
      <Button
        variant="solid"
        tone="neutral"
        className="w-full h-11"
        type="button"
        disabled={!valid}
        onClick={() => {
          if (!startIso || !endIso || !valid) return;
          onUpdateTimes({ startedAt: startIso, endedAt: endIso });
          setOpen(false);
        }}
      >
        {copy.save}
      </Button>
    </div>
  );
}
