const MONTHS_GENITIVE = [
  "січня",
  "лютого",
  "березня",
  "квітня",
  "травня",
  "червня",
  "липня",
  "серпня",
  "вересня",
  "жовтня",
  "листопада",
  "грудня",
];

/**
 * `2026-08-28` → `28 серпня 2026`. Один формат видимої дати на весь сайт:
 * до цього гайди й правові сторінки писали `28.08.2026`, а модулі й /stan –
 * «31 серпня 2026». Кидає на невалідному вході, щоб помилка в
 * `routeMeta.json` не стала тихим «undefined 2026».
 */
export function formatDateUk(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  const year = m?.[1];
  const month = m?.[2];
  const day = m?.[3];
  if (!year || !month || !day) {
    throw new Error(`formatDateUk: очікую YYYY-MM-DD, отримав "${iso}"`);
  }
  const monthName = MONTHS_GENITIVE[Number(month) - 1];
  if (!monthName) {
    throw new Error(`formatDateUk: місяця ${month} не існує ("${iso}")`);
  }
  return `${Number(day)} ${monthName} ${year}`;
}
