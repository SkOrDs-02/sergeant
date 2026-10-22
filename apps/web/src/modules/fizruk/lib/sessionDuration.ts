/**
 * Last validated: 2026-10-22
 * Status: Active
 *
 * Межа правдоподібності тривалості тренування. Одне число на два місця:
 * ретро-форма («Записати проведене») і кнопка «Завершити» (аудит 2026-10-01,
 * data-37). Без другої «забуте» тренування закривалось «зараз» і тихо ставало
 * сесією на 60-111 годин.
 */

/**
 * Свідомо щедра: нічний похід чи довгий заїзд у 8-10 годин мають проходити.
 * Усе, що довше, — не тренування, а описка в часі або забута сесія.
 */
export const MAX_PLAUSIBLE_SESSION_MS = 12 * 60 * 60 * 1000;

/** `true`, коли початок → кінець довший за {@link MAX_PLAUSIBLE_SESSION_MS}. */
export function isImplausiblyLongSession(
  startedAtIso: string,
  endedAtIso: string,
): boolean {
  const start = Date.parse(startedAtIso);
  const end = Date.parse(endedAtIso);
  if (!Number.isFinite(start) || !Number.isFinite(end)) return false;
  return end - start > MAX_PLAUSIBLE_SESSION_MS;
}

/** «62 год» для сесій від години, інакше «45 хв». Для підпису в попередженні. */
export function formatSessionLengthUk(
  startedAtIso: string,
  endedAtIso: string,
): string {
  const ms = Date.parse(endedAtIso) - Date.parse(startedAtIso);
  if (!Number.isFinite(ms) || ms <= 0) return "";
  const minutes = Math.round(ms / 60_000);
  if (minutes < 60) return `${minutes} хв`;
  return `${Math.round(minutes / 60)} год`;
}

/**
 * Правка часу прийнятна: кінець строго після початку й не в майбутньому.
 * Окрема функція, бо «зараз» не можна читати прямо в рендері компонента.
 */
export function isValidSessionWindow(
  startedAtIso: string | null,
  endedAtIso: string | null,
): boolean {
  if (!startedAtIso || !endedAtIso) return false;
  const start = Date.parse(startedAtIso);
  const end = Date.parse(endedAtIso);
  return Number.isFinite(start) && end > start && end <= Date.now();
}
