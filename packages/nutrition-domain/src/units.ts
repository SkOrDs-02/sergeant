/**
 * Одиниці виміру комори: вимір (маса / обʼєм / лічба), переведення в базову
 * одиницю і назад.
 *
 * Status: Active
 *
 * AI-CONTEXT: до 2026-08-29 ці таблиці були модуль-приватними всередині
 * `shoppingListPantryMath.ts`. Картка продукту з варіантами рахує суму
 * покупок у тій самій базовій одиниці, тож таблиці мусили стати спільними:
 * друга копія, розʼїхавшись, дала б різні числа в коморі й у списку покупок
 * на тих самих даних.
 *
 * Виміри між собою НЕ конвертуються: маса і обʼєм лишаються різними
 * позиціями навіть за однакової назви, бо щільність невідома.
 */
import { normalizeUnit } from "./pantryTextParser.js";

export type UnitDimension = "mass" | "volume" | "count";

/** Базова одиниця свого виміру: `г` для маси, `мл` для обʼєму, `шт` для лічби. */
export type BaseUnit = "г" | "мл" | "шт";

export const UNIT_DIMENSION: Readonly<Record<string, UnitDimension>> = {
  г: "mass",
  кг: "mass",
  мл: "volume",
  л: "volume",
  шт: "count",
};

/** Множник переведення одиниці у базову (`г` для маси, `мл` для обʼєму, `шт` для лічби). */
export const UNIT_TO_BASE_FACTOR: Readonly<Record<string, number>> = {
  г: 1,
  кг: 1000,
  мл: 1,
  л: 1000,
  шт: 1,
};

const BASE_UNIT_BY_DIMENSION: Readonly<Record<UnitDimension, BaseUnit>> = {
  mass: "г",
  volume: "мл",
  count: "шт",
};

export function unitDimension(unit: string): UnitDimension | null {
  return UNIT_DIMENSION[unit] ?? null;
}

/** Базова одиниця виміру — `г` / `мл` / `шт`. */
export function baseUnitFor(dimension: UnitDimension): BaseUnit {
  return BASE_UNIT_BY_DIMENSION[dimension];
}

/** Кількість у базовій одиниці свого виміру, або `null` для нерозпізнаної одиниці. */
export function toBase(
  value: number,
  unit: string,
): { dimension: UnitDimension; base: number } | null {
  const dimension = unitDimension(unit);
  if (dimension == null) return null;
  const factor = UNIT_TO_BASE_FACTOR[unit];
  if (factor == null) return null;
  return { dimension, base: value * factor };
}

export function fromBaseToUnit(base: number, unit: string): number {
  const factor = UNIT_TO_BASE_FACTOR[unit] ?? 1;
  return base / factor;
}

/** Фасування завжди починається з цифри — «800г», «0,25л», «1.5 л». */
const PACKAGING_RE = /^\d/;

/** «800г» → величина + суфікс; у сирих даних Сільпо вони злиті. */
const PACK_SPLIT_RE = /^([\d.,]+)\s*(.*)$/;

/**
 * Кількість позиції чека в базовій одиниці свого виміру.
 *
 * Поле `unit` у чеку Сільпо несе два різні сенси (див. шапку
 * `formatReceiptQty` в `apps/web`): або ОДИНИЦЮ ВИМІРУ («кг»), або
 * ФАСУВАННЯ («0,25л»). Фасування множиться на кількість (`2 × 0,25 л` →
 * `500 мл`), чиста одиниця виміру — береться як є.
 *
 * `null` означає «чесно порахувати не можна» — напр. `уп` (пакет може
 * важити будь-що). Викликач у такому разі не створює варіант, а не вигадує
 * число.
 */
export function receiptQtyToBase(
  qty: number | null | undefined,
  unit: string | null | undefined,
): { qty: number; unit: BaseUnit } | null {
  if (qty == null || !Number.isFinite(qty) || qty <= 0) return null;
  const raw = String(unit ?? "").trim();
  if (!raw) return null;

  if (PACKAGING_RE.test(raw)) {
    const m = PACK_SPLIT_RE.exec(raw);
    const amount = m?.[1] ? Number(m[1].replace(",", ".")) : null;
    if (amount == null || !Number.isFinite(amount) || amount <= 0) return null;
    const packUnit = normalizeUnit(m?.[2] ?? "");
    if (!packUnit) return null;
    const based = toBase(amount * qty, packUnit);
    if (!based) return null;
    return { qty: based.base, unit: baseUnitFor(based.dimension) };
  }

  const normalized = normalizeUnit(raw);
  if (!normalized) return null;
  const based = toBase(qty, normalized);
  if (!based) return null;
  return { qty: based.base, unit: baseUnitFor(based.dimension) };
}
