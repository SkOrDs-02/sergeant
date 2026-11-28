/**
 * Last validated: 2026-11-26
 * Status: Active
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { Input } from "@shared/components/ui/Input";

/**
 * Пауза набору, після якої чернетка вважається завершеним значенням.
 * Достатньо, щоб «1800» набране без зупинок лишило ОДИН запис, і досить
 * коротка, щоб значення не губилось, якщо людина просто закрила вкладку.
 */
export const GOAL_INPUT_COMMIT_DELAY_MS = 900;

interface GoalNumberInputProps {
  /** Збережене значення цілі; `null` — не задано. */
  value: number | null;
  /** Завершене значення (blur, Enter або пауза набору); `null` — поле очищене. */
  onCommit: (value: number | null) => void;
  disabled?: boolean | undefined;
  "aria-label": string;
}

function parseGoal(raw: string): number | null {
  if (raw === "") return null;
  const n = Number(raw);
  return n > 0 ? n : null;
}

/**
 * Поле цілі КБЖВ з локальною чернеткою (FULL-20261126-UX-1, п. 2).
 *
 * AI-CONTEXT: раніше кожне натискання клавіші йшло в `setPrefs`, а diff
 * Їжі на кожну зміну цілі додає рядок у append-only журнал
 * `nutrition_goal_periods` (набір «1800» лишав 1, 18, 180, 1800). Тепер
 * проміжні значення живуть лише тут, а в prefs їде завершене.
 */
export function GoalNumberInput({
  value,
  onCommit,
  disabled,
  "aria-label": ariaLabel,
}: GoalNumberInputProps) {
  const [draft, setDraft] = useState<string | null>(null);
  const draftRef = useRef<string | null>(null);
  const valueRef = useRef(value);
  const onCommitRef = useRef(onCommit);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    valueRef.current = value;
    onCommitRef.current = onCommit;
  });

  const clearTimer = useCallback(() => {
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const commit = useCallback(() => {
    clearTimer();
    const raw = draftRef.current;
    if (raw === null) return;
    draftRef.current = null;
    setDraft(null);
    const next = parseGoal(raw);
    if (next !== valueRef.current) onCommitRef.current(next);
  }, [clearTimer]);

  // Розмонтування (перехід на іншу сторінку посеред набору) не губить значення.
  useEffect(
    () => () => {
      clearTimer();
      const raw = draftRef.current;
      if (raw === null) return;
      draftRef.current = null;
      const next = parseGoal(raw);
      if (next !== valueRef.current) onCommitRef.current(next);
    },
    [clearTimer],
  );

  return (
    <Input
      type="number"
      inputMode="numeric"
      value={draft ?? (value != null ? String(value) : "")}
      onChange={(e) => {
        draftRef.current = e.target.value;
        setDraft(e.target.value);
        clearTimer();
        timerRef.current = setTimeout(commit, GOAL_INPUT_COMMIT_DELAY_MS);
      }}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") commit();
      }}
      aria-label={ariaLabel}
      placeholder="—"
      disabled={disabled}
    />
  );
}
