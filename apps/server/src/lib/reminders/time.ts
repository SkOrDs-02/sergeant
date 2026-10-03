/**
 * Київський час для reminder-sweep-у.
 *
 * Domain invariant (AGENTS.md): усі межі доби рахуються в Europe/Kyiv, ніколи
 * не в UTC і не в локальній зоні контейнера. Контейнер у Coolify стоїть на
 * UTC, тож без явної зони нагадування о 00:30 їхали б у попередній день.
 *
 * Формат `HH:MM` тут — та сама вісь, якою мислить клієнт
 * (`useModuleReminder` віддає `hm` у Kyiv-local), тож рядки з
 * `routine_habits.reminder_times` порівнюються напряму.
 */

/** Київський day-key `YYYY-MM-DD`. */
export function kyivDayKey(at: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Kyiv",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(at);
}

/** Київський час доби `HH:MM` у 24-годинному форматі. */
export function kyivHm(at: Date): string {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Kyiv",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(at);
  // `en-GB` віддає 24-годинний формат, але опівночі деякі рушії ICU дають
  // "24" замість "00" — тому нормалізуємо по модулю, а не довіряємо рядку.
  const hour = Number(parts.find((p) => p.type === "hour")?.value ?? "0") % 24;
  const minute = parts.find((p) => p.type === "minute")?.value ?? "00";
  return `${String(hour).padStart(2, "0")}:${minute}`;
}

/**
 * Київський day-key, зсунутий на `days` календарних діб назад.
 *
 * Використовується retention-прибиранням журналу. Рахуємо через `Date.UTC`
 * від київської цивільної дати, а не відніманням 24-годинних інтервалів:
 * перехід на літній час зсунув би межу на добу.
 */
export function kyivDayKeyMinusDays(at: Date, days: number): string {
  const key = kyivDayKey(at);
  const [y = 1970, m = 1, d = 1] = key.split("-").map(Number);
  return kyivDayKey(new Date(Date.UTC(y, m - 1, d - days, 12, 0, 0)));
}
