import { useEffect, useState } from "react";

/**
 * Скільки максимум тримаємо кнопку збереження заблокованою, чекаючи прогріву
 * SQLite-кешу. Звичайний холодний старт триває секунди; якщо кеш так і не
 * прогрівся (boot SQLite впав), вічний спінер був би гіршим за запис, який
 * писар однаково кладе в журнал і повторить на наступному буті.
 */
export const STORAGE_WARM_GATE_TIMEOUT_MS = 15_000;

/**
 * `true`, поки сховище Фініка прогрівається і форму запису ще не можна
 * надсилати (аудит 2026-10-01, data-13). До прогріву UI показує порожні суми,
 * тож людина вводить запис «наосліп», а тост успіху не відрізняє збережене від
 * ненадісланого. Гейт лише не дає натиснути зарано; сама цілісність запису
 * тримається на `useFinykDualWriteSync` (він пише рядки й до прогріву).
 *
 * `storageReady === undefined` вважається готовим: так поводяться тести й
 * споживачі без цього поля.
 */
export function useStorageWarmGate(
  storageReady: boolean | undefined,
  timeoutMs: number = STORAGE_WARM_GATE_TIMEOUT_MS,
): boolean {
  const [timedOut, setTimedOut] = useState(false);
  const cold = storageReady === false;

  useEffect(() => {
    if (!cold) return;
    const id = globalThis.setTimeout(() => setTimedOut(true), timeoutMs);
    return () => globalThis.clearTimeout(id);
  }, [cold, timeoutMs]);

  return cold && !timedOut;
}
