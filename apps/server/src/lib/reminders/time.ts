/**
 * Час доби для reminder-sweep-у: у поясі людини і за Києвом.
 *
 * Межі доби ніколи не рахуються в UTC чи в локальній зоні контейнера
 * (Coolify стоїть на UTC). Нагадування, тихі години і нудж рахуються в
 * збереженому поясі пристрою людини (`user_preferences.time_zone`,
 * спека `notifications-quiet-hours-and-device-time.md`, ADR-0078); пояс
 * невідомий = Europe/Kyiv. Серверні звіти й ретеншн журналу лишаються на
 * Києві (`kyiv*` нижче).
 *
 * Формат `HH:MM` тут — та сама вісь, якою мислить клієнт
 * (`useModuleReminder` віддає `hm` за годинником пристрою), тож рядки з
 * `routine_habits.reminder_times` порівнюються напряму.
 */

/** Пояс, яким читається людина без збереженого поясу. */
export const FALLBACK_TIME_ZONE = "Europe/Kyiv";

/**
 * Чи знає ICU цього процесу такий IANA-пояс. Список поясів змінюється з
 * версією ICU, тому перевірка тут, а не CHECK у БД.
 */
export function isValidTimeZone(tz: string): boolean {
  if (!tz) return false;
  try {
    new Intl.DateTimeFormat("en", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

/** Збережений пояс або Київ, якщо пояс невідомий чи ICU його не знає. */
export function resolveUserTimeZone(raw: unknown): string {
  return typeof raw === "string" && isValidTimeZone(raw)
    ? raw
    : FALLBACK_TIME_ZONE;
}

/** Day-key `YYYY-MM-DD` у поясі `tz`. */
export function dayKeyIn(at: Date, tz: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(at);
}

/** Час доби `HH:MM` (24 години) у поясі `tz`. */
export function hmIn(at: Date, tz: string): string {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: tz,
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

/** Київський day-key `YYYY-MM-DD`. */
export function kyivDayKey(at: Date): string {
  return dayKeyIn(at, FALLBACK_TIME_ZONE);
}

/** Київський час доби `HH:MM` у 24-годинному форматі. */
export function kyivHm(at: Date): string {
  return hmIn(at, FALLBACK_TIME_ZONE);
}

/** `HH:MM` → хвилина доби. */
export function hmToMinute(hm: string): number {
  const [h = 0, m = 0] = hm.split(":").map(Number);
  return h * 60 + m;
}

/** Хвилина доби → `HH:MM`. */
export function minuteToHm(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

/**
 * Тихі години людини: півінтервал [startMin, endMin) хвилин доби в її
 * поясі. `null` = тихі години вимкнені, вікна немає.
 */
export interface QuietWindow {
  startMin: number;
  endMin: number;
}

/**
 * Чи лежить хвилина доби в тихих годинах. Вікно може переходити через
 * північ (22:00-08:00) і може не переходити (13:00-15:00); кінець не
 * включно. Однакові межі БД відкидає CHECK-ом, тут вони дають «вікна
 * немає».
 */
export function isInQuietWindow(
  minuteOfDay: number,
  quiet: { enabled: boolean; startMin: number; endMin: number },
): boolean {
  if (!quiet.enabled) return false;
  const { startMin, endMin } = quiet;
  if (startMin === endMin) return false;
  return startMin < endMin
    ? minuteOfDay >= startMin && minuteOfDay < endMin
    : minuteOfDay >= startMin || minuteOfDay < endMin;
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

/** Скільки хвилин назад прохід дошукує пропущені слоти. */
const CATCH_UP_MINUTES = 10;

/**
 * Нижня межа (не включно) хвилин, які прохід о `now` має обробити, щоб
 * наздогнати хвилини, пропущені довгим або впалим попереднім проходом.
 * Без `lastSweepAt` (перший прохід процесу) вікно лише поточна хвилина.
 * Інша доба повертає "", тобто з початку доби: "" менше за будь-який HH:MM.
 */
export function catchUpFromHmIn(
  now: Date,
  lastSweepAt: Date | null,
  tz: string,
): string {
  const from = new Date(
    Math.max(
      lastSweepAt?.getTime() ?? now.getTime() - 60_000,
      now.getTime() - CATCH_UP_MINUTES * 60_000,
    ),
  );
  return dayKeyIn(from, tz) === dayKeyIn(now, tz) ? hmIn(from, tz) : "";
}
