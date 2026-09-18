/**
 * Composite key used to map a per-day note onto a `(habitId, dateKey)`
 * pair inside `RoutineState.completionNotes`.
 *
 * Extracted verbatim from
 * `apps/web/src/modules/routine/lib/completionNoteKey.ts`.
 */
export function completionNoteKey(habitId: string, dateKey: string): string {
  return `${habitId}__${dateKey}`;
}

/**
 * Composite key для позначки «не зміг з причиною» (канон §5).
 *
 * Той самий формат, що й `completionNoteKey` — і це навмисно: обидві
 * сутності адресують одну й ту саму пару `(habitId, dateKey)`, і різні
 * роздільники означали б два способи назвати один день. Ключ їде в
 * `routine_habit_skips.skip_key` як PK-половина.
 */
export function habitSkipKey(habitId: string, dateKey: string): string {
  return `${habitId}__${dateKey}`;
}

/** Розібрати `skip_key` назад у пару. `null` — якщо ключ битий. */
export function parseHabitSkipKey(
  key: string,
): { habitId: string; dateKey: string } | null {
  const at = key.lastIndexOf("__");
  if (at <= 0) return null;
  const habitId = key.slice(0, at);
  const dateKey = key.slice(at + 2);
  if (!habitId || !/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) return null;
  return { habitId, dateKey };
}
