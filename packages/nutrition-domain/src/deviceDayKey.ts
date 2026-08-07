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
 * Ключ дня пристрою, що передує `key` (`YYYY-MM-DD`).
 *
 * Через конструктор `Date(y, m, d)` з полями, а не ручну арифметику в мс —
 * локальні поля `Date` самі коректно перекочують через DST-переходи (той
 * самий підхід, що `addDays`/`dateKeyFromDate` у `@sergeant/routine-domain`),
 * тож окремого DST-guard-а тут не треба.
 */
export function previousDeviceDayKey(key: string): string {
  const [y, m, d] = key.split("-").map(Number);
  return deviceDayKey(new Date(y ?? 1970, (m ?? 1) - 1, (d ?? 1) - 1));
}
