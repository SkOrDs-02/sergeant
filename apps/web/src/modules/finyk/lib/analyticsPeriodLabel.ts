import type { AnalyticsPeriod } from "@sergeant/finyk-domain/domain/analyticsPeriod";
import {
  formatDateFull,
  formatDateShort,
  formatMonthYear,
} from "@shared/lib/time/formatDate";

// Ключ дня без зони: форматуємо UTC-полудень у UTC, тоді жоден пояс
// пристрою не зсуне дату на сусідню.
function keyDate(key: string): Date {
  return new Date(`${key}T12:00:00Z`);
}

/** Підпис періоду: «Червень 2026», «2026», «15 черв. – 21 черв. 2026 р.». */
export function formatAnalyticsPeriod(
  p: AnalyticsPeriod,
  todayKey: string,
): string {
  if (p.kind === "month") {
    return formatMonthYear(keyDate(p.fromKey), {
      capitalize: true,
      timeZone: "UTC",
    });
  }
  if (p.kind === "year") return p.fromKey.slice(0, 4);
  const sameYear = p.fromKey.slice(0, 4) === p.toKey.slice(0, 4);
  const from = formatDateShort(keyDate(p.fromKey), {
    timeZone: "UTC",
    withYear: !sameYear,
  });
  const to = formatDateShort(keyDate(p.toKey), {
    timeZone: "UTC",
    withYear: p.toKey.slice(0, 4) !== todayKey.slice(0, 4) || !sameYear,
  });
  return `${from} – ${to}`;
}

/** «10 травня 2026 р.» для стану «дані лише з …» (Р5.5). */
export function formatHistoryStart(dayKey: string): string {
  return formatDateFull(keyDate(dayKey), { timeZone: "UTC" });
}
