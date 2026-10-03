/**
 * Last validated: 2026-09-22
 * Status: Active
 *
 * Історія тижневих перевірок крос-модульних пар - доказова база для другого
 * і третього ступенів впевненості (`crossModuleLinkTiers.ts`).
 *
 * Спека: `docs/work/specs/link-evidence-standard.md`; рішення і межі -
 * [ADR-0097](../../../../../docs/governance/adr/0097-link-evidence-standard.md).
 *
 * AI-CONTEXT: до цього модуля ступінь читався з ОДНОГО заміру - `n` і `r`
 * усередині 60-денного вікна. Тобто «Тримається стабільно» означало «сильна
 * кореляція просто зараз», і пара, що трималась на кількох днях-викидах,
 * отримувала найвище слово з першого ж погляду. Тепер сила лишається умовою
 * ступеня, а повторюваність стає другою: пара мусить пройти перевірку двічі
 * поспіль, у два сусідні тижні.
 *
 * AI-DANGER: сусідні перевірки НЕ незалежні. Вікно ковзне, тож два сусідні
 * тижні ділять 53 дні з 60 - множити ймовірності не можна, і жодне
 * формулювання в інтерфейсі не сміє обіцяти «подвійну перевірку». Реальна
 * користь вужча й чесно названа в ADR-0097: відсів пар, що трималися на
 * кількох днях-викидах. Не підсилюй копію під це сховище.
 */
import { z } from "zod";
import { getWeekKey, STORAGE_KEYS } from "@sergeant/shared";
import { safeReadLSValidated, safeWriteLS } from "@shared/lib/storage/storage";
import type { DailyMetric } from "../lib/chatActions/crossActions/dailySeries";
import { shiftDayKey } from "./digestCorrelations";

/**
 * Скільки перевірок поспіль потрібно, щоб пара піднялась вище першого
 * ступеня. Дві, не три: на трьох частина справжніх звʼязків не дожила б до
 * показу (рішення власника, ADR-0097).
 */
export const REQUIRED_CONSECUTIVE_CHECKS = 2;

/**
 * Скільки тижнів тримаємо. Лічильник ніколи не дивиться далі за поточну
 * серію, тож глибша історія нічого не вирішує, а запис росте.
 */
const MAX_WEEKS_KEPT = 8;

const HistorySchema = z.record(z.string(), z.array(z.string()));

export type LinkCheckHistory = Record<string, string[]>;

/**
 * Ключ пари, незалежний від порядку метрик: `notablePairsFromSeries` віддає
 * пару в порядку курованого набору, а `computePairwiseCorrelations` - у
 * порядку `METRICS`. Без сортування та сама пара мала б дві різні серії.
 */
export function pairHistoryKey(a: DailyMetric, b: DailyMetric): string {
  return [a, b].sort().join("|");
}

export function readLinkCheckHistory(): LinkCheckHistory {
  return safeReadLSValidated<LinkCheckHistory>(
    STORAGE_KEYS.CROSS_MODULE_LINK_HISTORY,
    HistorySchema,
    {},
  );
}

function writeLinkCheckHistory(history: LinkCheckHistory): void {
  safeWriteLS(STORAGE_KEYS.CROSS_MODULE_LINK_HISTORY, history);
}

/**
 * Записує, що перелічені пари пройшли перевірку на тижні `now`, і повертає
 * оновлену історію.
 *
 * Ідемпотентно в межах тижня: повторний виклик того самого тижня нічого не
 * додає, тож десять відкриттів сторінки за тиждень це одна перевірка, а не
 * десять. Саме тому лічильник міряє тижні, а не візити.
 */
export function recordWeeklyChecks(
  pairs: ReadonlyArray<{ a: DailyMetric; b: DailyMetric }>,
  now: number = Date.now(),
): LinkCheckHistory {
  const weekKey = getWeekKey(new Date(now));
  const history = readLinkCheckHistory();
  let changed = false;

  for (const pair of pairs) {
    const key = pairHistoryKey(pair.a, pair.b);
    const weeks = history[key] ?? [];
    if (weeks[0] === weekKey) continue;
    history[key] = [weekKey, ...weeks.filter((w) => w !== weekKey)].slice(
      0,
      MAX_WEEKS_KEPT,
    );
    changed = true;
  }

  if (changed) writeLinkCheckHistory(history);
  return history;
}

/**
 * Скільки тижнів поспіль пара проходила перевірку, рахуючи від тижня `now`
 * назад. Нуль означає, що цього тижня перевірки не було - серія обірвана.
 *
 * Пропущений тиждень скидає лічильник навмисно: «тримається» про
 * безперервність, і терпимість до пропуску тут не потрібна, бо перевірка
 * рахується з даних, а не з дій людини.
 */
export function consecutiveChecks(
  history: LinkCheckHistory,
  a: DailyMetric,
  b: DailyMetric,
  now: number = Date.now(),
): number {
  const weeks = history[pairHistoryKey(a, b)];
  if (!Array.isArray(weeks) || weeks.length === 0) return 0;

  const seen = new Set(weeks);
  let streak = 0;
  let cursor = getWeekKey(new Date(now));
  while (seen.has(cursor)) {
    streak += 1;
    cursor = shiftDayKey(cursor, -7);
  }
  return streak;
}

/**
 * Записує перевірку й одразу віддає серії по всіх переданих парах.
 *
 * Одним кроком навмисно: якби запис жив в ефекті, а оцінка ступеня - у
 * рендері, перший показ тижня рахував би поточну перевірку відсутньою й
 * рівно раз на тиждень показував би ступінь нижчий за справжній.
 */
export function recordAndCountChecks(
  pairs: ReadonlyArray<{ a: DailyMetric; b: DailyMetric }>,
  now: number = Date.now(),
): Map<string, number> {
  const history = recordWeeklyChecks(pairs, now);
  const counts = new Map<string, number>();
  for (const pair of pairs) {
    counts.set(
      pairHistoryKey(pair.a, pair.b),
      consecutiveChecks(history, pair.a, pair.b, now),
    );
  }
  return counts;
}
