/**
 * Українські відносні дати для long-lived лістингів (Sessions, Memory bank,
 * Activity feed). Build-up: PR-10 ux-roast 2026-Q2 / §10.3 «Цей пристрій +
 * last-seen у людському форматі».
 *
 * Контракт. Беремо `Date | string | number`, повертаємо короткий UA-рядок
 * у трьох виразних регістрах:
 *
 *   • «щойно» / «N хвилин тому» — для свіжих подій (≤ 1 година);
 *   • «Сьогодні о 14:32» / «Вчора о 09:15» — інтуїтивний day-anchor;
 *   • «3 дні тому» / «12 жовт. 2025» — old, fallback на абсолютну дату.
 *
 * Вирішено через `Intl.RelativeTimeFormat("uk")`, який вже у браузерах,
 * що ми підтримуємо (Edge 79+, Safari 14+, Firefox 65+, Chrome 71+). Тож
 * додаткові залежності — не треба, polyfill теж відсутній.
 *
 * Тестове API: експортуємо `formatRelativeUk(value, now)` — `now`
 * параметризовано, щоб тести могли пінити «зараз» і не плавати по
 * годинах.
 */
const RELATIVE = new Intl.RelativeTimeFormat("uk", {
  numeric: "auto",
});

const TIME_FORMAT = new Intl.DateTimeFormat("uk-UA", {
  hour: "2-digit",
  minute: "2-digit",
});

const DATE_FORMAT = new Intl.DateTimeFormat("uk-UA", {
  day: "numeric",
  month: "short",
  year: "numeric",
});

const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;

function toDate(value: Date | string | number): Date | null {
  if (value instanceof Date)
    return Number.isNaN(value.getTime()) ? null : value;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function startOfDay(d: Date): number {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

/**
 * Формат «last-seen» для UI-лістингів сесій.
 *
 *   • |Δ| < 1 хв         → «щойно»
 *   • |Δ| < 1 год        → «N хвилин тому»
 *   • той самий день     → «Сьогодні о HH:MM»
 *   • вчорашній день     → «Вчора о HH:MM»
 *   • 2..6 днів тому     → «N днів тому»
 *   • далі               → «12 жовт. 2025»
 */
export function formatRelativeUk(
  value: Date | string | number,
  now: Date | number = new Date(),
): string {
  const d = toDate(value);
  if (!d) return "";
  const nowMs = now instanceof Date ? now.getTime() : now;
  const deltaMs = nowMs - d.getTime();
  const absMs = Math.abs(deltaMs);

  if (absMs < MINUTE_MS) return "щойно";

  if (absMs < HOUR_MS) {
    const minutes = Math.round(deltaMs / MINUTE_MS);
    return RELATIVE.format(-minutes, "minute");
  }

  const dayDelta = Math.round(
    (startOfDay(new Date(nowMs)) - startOfDay(d)) / DAY_MS,
  );

  if (dayDelta === 0) return `Сьогодні о ${TIME_FORMAT.format(d)}`;
  if (dayDelta === 1) return `Вчора о ${TIME_FORMAT.format(d)}`;
  if (dayDelta > 1 && dayDelta < 7) {
    return RELATIVE.format(-dayDelta, "day");
  }

  return DATE_FORMAT.format(d);
}
