/**
 * Device-local day-key helpers (ADR-0078).
 *
 * `docs/04-governance/adr/0078-day-boundary-device-local.md`: день-ключ
 * логу їжі, логу води й денного підсумку визначає годинник ПРИСТРОЮ, а не
 * Europe/Kyiv — інакше відмітка ввечері за місцевим часом «переїжджає» на
 * сусідній день для будь-кого поза Києвом.
 *
 * Мінімальна самодостатня копія того самого патерну, що вже існує тричі:
 * `dateKeyFromDate` у `@sergeant/routine-domain` і `@sergeant/fizruk-domain`,
 * приватний `deviceDayKey` у
 * `apps/web/src/core/observability/adviceTelemetry.ts`. `nutrition-domain`
 * навмисно НЕ заводить залежність на пакет іншого домену заради 5 рядків —
 * той самий компроміс, що вже обрали ці два прецеденти.
 */
export function deviceDayKey(d: Date | number = new Date()): string {
  const date = typeof d === "number" ? new Date(d) : d;
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/**
 * Ключ дня пристрою, зсунутий від `key` (`YYYY-MM-DD`) на `deltaDays`.
 *
 * Через конструктор `Date(y, m, d)` з полями, а не ручну арифметику в мс —
 * локальні поля `Date` самі коректно перекочують через DST-переходи (той
 * самий підхід, що `addDays`/`dateKeyFromDate` у `@sergeant/routine-domain`),
 * тож окремого DST-guard-а тут не треба.
 */
export function addDeviceDays(key: string, deltaDays: number): string {
  const [y, m, d] = key.split("-").map(Number);
  return deviceDayKey(new Date(y ?? 1970, (m ?? 1) - 1, (d ?? 1) + deltaDays));
}

/** Ключ дня пристрою, що передує `key` (`YYYY-MM-DD`). */
export function previousDeviceDayKey(key: string): string {
  return addDeviceDays(key, -1);
}

/**
 * Понеділок поточного тижня за годинником ПРИСТРОЮ (`YYYY-MM-DD`).
 *
 * unification-modules.md #1.18: `NutritionDashboard` рахував «сьогодні»
 * пристроєм, а межі тижневого графіка — Києвом, тож поза Києвом сьогоднішній
 * стовпчик міг випасти з власного тижневого вікна. Тиждень лишається з
 * понеділка (доменний інваріант), змінюється лише годинник.
 */
export function deviceWeekStartKey(d: Date | number = new Date()): string {
  const date = typeof d === "number" ? new Date(d) : d;
  const weekday = date.getDay(); // 0=Sun..6=Sat
  const diffToMonday = weekday === 0 ? -6 : 1 - weekday;
  const monday = new Date(
    date.getFullYear(),
    date.getMonth(),
    date.getDate() + diffToMonday,
  );
  return deviceDayKey(monday);
}

/**
 * Час доби за годинником ПРИСТРОЮ, `HH:MM`.
 *
 * AI-CONTEXT: пара до `deviceDayKey`. День-ключ запису — за пристроєм
 * (ADR-0078), тож і час доби, який лягає поруч із ним, мусить бути з ТОГО
 * САМОГО годинника. Київський час поруч із девайсовим днем дає пару, якої
 * не існувало в реальності: о 23:53 UTC день = 23-тє, а київський
 * годинник показує 02:53 — момент «23-тє 02:53» на 21 годину раніше за
 * фактичний. Саме таку пару писав `currentTime()` до 2026-08-24.
 * Europe/Kyiv лишається для ВІДОБРАЖЕННЯ часу серверних звітів, не для
 * штампа особистого запису.
 */
export function deviceTimeOfDay(d: Date | number = new Date()): string {
  const date = typeof d === "number" ? new Date(d) : d;
  const hh = String(date.getHours()).padStart(2, "0");
  const mm = String(date.getMinutes()).padStart(2, "0");
  return `${hh}:${mm}`;
}

/** `+03:00` / `-05:30` / `Z` — зсув пристрою на момент `date`. */
function deviceUtcOffset(date: Date): string {
  // `getTimezoneOffset()` — хвилини, які треба ДОДАТИ до локального часу,
  // щоб отримати UTC; знак у ISO-8601 протилежний.
  const minutes = -date.getTimezoneOffset();
  if (minutes === 0) return "Z";
  const sign = minutes < 0 ? "-" : "+";
  const abs = Math.abs(minutes);
  const hh = String(Math.floor(abs / 60)).padStart(2, "0");
  const mm = String(abs % 60).padStart(2, "0");
  return `${sign}${hh}:${mm}`;
}

/**
 * Скласти РЕАЛЬНИЙ момент із device-local пари «день-ключ + час доби».
 *
 * AI-DANGER: `${dateKey}T${time}:00.000Z` — саме той наївний склад, що
 * породжував неіснуючі моменти: локальний настінний час штампувався як
 * UTC, тож будь-яка аналітика «о котрій людина їсть» зчитувалась зі
 * зсувом на цілий часовий пояс. Тут ми лишаємо настінний час як є (щоб
 * `eaten_at.slice(0,10)` і далі давав девайсовий день-ключ, а
 * `slice(11,16)` — той час, що людина бачила в аркуші), але дописуємо
 * фактичний зсув пристрою — і момент стає справжнім.
 */
export function deviceWallClockToInstant(
  dateKey: string,
  time: string,
): string {
  const safeDate = /^\d{4}-\d{2}-\d{2}$/.test(dateKey) ? dateKey : "1970-01-01";
  const safeTime = /^\d{2}:\d{2}$/.test(time) ? time : "00:00";
  const [y, m, d] = safeDate.split("-").map(Number);
  const [hh, mm] = safeTime.split(":").map(Number);
  const local = new Date(y ?? 1970, (m ?? 1) - 1, d ?? 1, hh ?? 0, mm ?? 0);
  return `${safeDate}T${safeTime}:00.000${deviceUtcOffset(local)}`;
}
