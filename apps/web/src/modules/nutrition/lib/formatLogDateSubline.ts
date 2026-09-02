/**
 * Last validated: 2026-09-01
 * Status: Active
 *
 * TXT-8 (аудит 2026-09-01): підпис під «Сьогодні»/«Вчора»/«Завтра» у
 * журналі їжі (`LogCard.tsx`) показував сиру ISO-дату (`2026-09-01`) —
 * той самий день, що вже написаний словами рядком вище, тільки цифрами.
 * Формат нижче повторює те, що вже показує Рутина (`useRoutineDerivedData.ts`
 * `fmtUk`): день тижня + число + місяць українською — «вівторок, 1
 * вересня» замість сирого ключа.
 */
export function formatLogDateSubline(isoDate: string): string {
  const [yRaw, mRaw, dRaw] = isoDate.split("-");
  const y = Number(yRaw);
  const m = Number(mRaw);
  const d = Number(dRaw);
  if (!y || !m || !d) return isoDate;
  return new Date(y, m - 1, d).toLocaleDateString("uk-UA", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });
}
