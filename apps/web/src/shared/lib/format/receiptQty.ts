/**
 * Last validated: 2026-08-25
 * Status: Active
 *
 * Кількість позиції з чека Сільпо у людський рядок.
 *
 * Проблема, яку це лікує: Сільпо кладе в одне поле `unit` дві різні речі —
 * або ОДИНИЦЮ ВИМІРУ («шт», «кг», «пачка»), або ФАСУВАННЯ («800г»,
 * «0,25л»). Наївне `${qty} ${unit}` на другому випадку дає «1 200г», що
 * читається як 1200 грамів, а не як одна пачка по 200 г (скарга
 * founder-а, 2026-08-25).
 *
 * Розрізняємо за першим символом: фасування завжди починається з цифри.
 * Далі — два різні написання, щоб множник не зливався з величиною:
 *
 * | вхід             | було       | стало        |
 * | ---------------- | ---------- | ------------ |
 * | `1` + `"200г"`   | `1 200г`   | `200 г`      |
 * | `2` + `"0,25л"`  | `2 0,25л`  | `2 × 0,25 л` |
 * | `0.196` + `"кг"` | `0.196 кг` | `0,196 кг`   |
 */
import { formatNumberUk } from "@sergeant/shared";

/** Фасування завжди починається з цифри — «800г», «0,25л», «1.5 л». */
const PACKAGING = /^\d/;

/** «800г» → «800 г»; величина і суфікс злиті в сирих даних Сільпо. */
const PACK_SPLIT = /^([\d.,]+)\s*(.*)$/;

/** Нерозривний — «200 г» не має ламатись на два рядки. */
const NBSP = " ";

/** U+00D7, не літера «x»: інакше «2 x 0,25 л» читається як частина назви. */
const TIMES = "×";

function spacePackaging(unit: string): string {
  const m = PACK_SPLIT.exec(unit);
  if (!m?.[2]) return unit;
  return `${m[1]}${NBSP}${m[2]}`;
}

export function formatReceiptQty(
  qty: number | null | undefined,
  unit: string | null | undefined,
): string | null {
  const trimmed = unit?.trim() || null;
  if (qty == null) return trimmed;

  const amount = formatNumberUk(qty, { maximumFractionDigits: 3 });
  if (!trimmed) return amount;

  if (!PACKAGING.test(trimmed)) return `${amount}${NBSP}${trimmed}`;

  const pack = spacePackaging(trimmed);
  // Одна пачка — множник зайвий шум; саме він і читався як частина числа.
  return qty === 1 ? pack : `${amount}${NBSP}${TIMES}${NBSP}${pack}`;
}
