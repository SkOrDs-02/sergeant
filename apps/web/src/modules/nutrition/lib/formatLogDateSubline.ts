/**
 * Last validated: 2026-09-01
 * Status: Active
 *
 * TXT-8 (аудит 2026-09-01): підпис під «Сьогодні»/«Вчора»/«Завтра» у
 * журналі їжі (`LogCard.tsx`) показував сиру ISO-дату (`2026-09-01`) —
 * той самий день, що вже написаний словами рядком вище, тільки цифрами.
 * Формат нижче повторює те, що вже показує Рутина: день тижня + число +
 * місяць українською — «вівторок, 1 вересня» замість сирого ключа. Спільний
 * хелпер `formatUaWeekdayDate` існує тому, що назва дня мусить бути в
 * називному відмінку, а один `toLocaleDateString` з повним набором опцій дає
 * в Chromium знахідний («вівторок» проти «вівторка») — див. докстрінг хелпера.
 */
import { formatUaWeekdayDate } from "@shared/lib/time/uaWeekdayDate";

export function formatLogDateSubline(isoDate: string): string {
  const [yRaw, mRaw, dRaw] = isoDate.split("-");
  const y = Number(yRaw);
  const m = Number(mRaw);
  const d = Number(dRaw);
  if (!y || !m || !d) return isoDate;
  return formatUaWeekdayDate(new Date(y, m - 1, d));
}
