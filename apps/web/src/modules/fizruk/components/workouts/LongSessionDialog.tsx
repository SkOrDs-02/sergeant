/**
 * Last validated: 2026-10-22
 * Status: Active
 *
 * Попередження на «Завершити», коли сесія вийшла неправдоподібно довгою
 * (аудит 2026-10-01, data-37). Замість мовчазного збереження на 60-111 годин
 * людина бачить причину і може тут же виправити кінець.
 */
import { useState } from "react";
import { Modal } from "@shared/components/ui/Modal";
import { Button } from "@shared/components/ui/Button";
import { messages } from "@shared/i18n/uk";
import {
  datetimeLocalValueToIso,
  isoToDatetimeLocalValue,
} from "./activeWorkoutLib";
import {
  formatSessionLengthUk,
  isValidSessionWindow,
} from "../../lib/sessionDuration";

export interface LongSessionDialogProps {
  open: boolean;
  startedAt: string;
  /** Кінець, який був би записаний без попередження. */
  plannedEndedAt: string;
  /** Людина виправила кінець і підтвердила. */
  onConfirm: (endedAtIso: string) => void;
  /** Людина свідомо лишає як є. */
  onKeepAsIs: () => void;
  onClose: () => void;
}

export function LongSessionDialog({
  open,
  startedAt,
  plannedEndedAt,
  onConfirm,
  onKeepAsIs,
  onClose,
}: LongSessionDialogProps) {
  const copy = messages.fizruk.workoutSummary.longSession;
  const [value, setValue] = useState(isoToDatetimeLocalValue(plannedEndedAt));
  const iso = datetimeLocalValueToIso(value);
  const valid = isValidSessionWindow(startedAt, iso);

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={copy.title}
      description={copy.description.replace(
        "{len}",
        formatSessionLengthUk(startedAt, plannedEndedAt),
      )}
      footer={
        <div className="flex w-full flex-col gap-2">
          <Button
            variant="solid"
            tone="neutral"
            className="w-full h-12"
            disabled={!valid}
            onClick={() => {
              if (iso && valid) onConfirm(iso);
            }}
          >
            {copy.confirm}
          </Button>
          <Button
            variant="soft"
            tone="neutral"
            className="w-full h-12"
            onClick={onKeepAsIs}
          >
            {copy.keepAsIs}
          </Button>
        </div>
      }
    >
      <label
        className="block text-style-caption text-subtle"
        htmlFor="long-session-end"
      >
        {copy.endLabel}
      </label>
      <input
        id="long-session-end"
        type="datetime-local"
        className="input-focus-fizruk mt-1 block w-full min-w-0 h-11 rounded-lg border border-line bg-panel px-3 text-style-body text-text"
        value={value}
        onChange={(e) => setValue(e.target.value)}
      />
      {!valid ? (
        <p className="mt-1 text-style-caption text-danger" role="alert">
          {copy.invalid}
        </p>
      ) : null}
    </Modal>
  );
}
