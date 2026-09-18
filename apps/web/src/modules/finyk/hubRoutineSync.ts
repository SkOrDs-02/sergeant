/** Подія для перемальовки календаря Рутини після змін підписок Фініка. */
export const HUB_FINYK_ROUTINE_SYNC_EVENT = "hub-finyk-routine-sync";

export function notifyFinykRoutineCalendarSync(): void {
  try {
    window.dispatchEvent(new CustomEvent(HUB_FINYK_ROUTINE_SYNC_EVENT));
  } catch {
    /* noop */
  }
}
