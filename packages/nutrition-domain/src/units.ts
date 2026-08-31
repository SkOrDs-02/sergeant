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
 * Виміри між собою конвертуються ЛИШЕ там, де щільність продукту відома
 * явно (`massToVolumeIfKnown`). Для решти маса й обʼєм лишаються різними
 * позиціями навіть за однакової назви: вигаданий коефіцієнт гірший за дві
 * чесні позиції.
 */
import { normalizeUnit } from "./pantryTextParser.js";
import { knownDensityGPerMl } from "./density.js";

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

/**
 * Зводить масу рідини до об'єму — але ЛИШЕ коли щільність продукту відома.
 *
 * 900 г молока це 874 мл, а не 900 мл: щільність 1.03. Без цієї конверсії
 * «Молоко 900 г» із чека і «Молоко 1 л» лишались би двома позиціями за
 * однакової назви — тобто головний кейс фічі («скільки в мене молока —
 * одним рядком») не спрацьовував би саме на молоці, бо в чеку Сільпо воно
 * приходить у грамах.
 *
 * AI-DANGER: межа тут — `knownDensityGPerMl`, а НЕ `densityFor`. Дефолт
 * 1.0 перетворив би «не знаю» на «900 г = 900 мл»; для меду це помилка на
 * 30%, і вона тихо потекла б у калорії та список покупок. Продукт без
 * щільності лишається у своєму вимірі — дві чесні позиції кращі за одну з
 * вигаданим числом.
 */
export function massToVolumeIfKnown(
  base: { dimension: UnitDimension; base: number },
  name: unknown,
): { dimension: UnitDimension; base: number } {
  if (base.dimension !== "mass") return base;
  const density = knownDensityGPerMl(name);
  if (density == null || !(density > 0)) return base;
  // Ціле число мілілітрів. Дробові мл у коморі сенсу не мають, а без
  // округлення саме тут воно протікає в показ: 900 / 1.03 = 873.786, і
  // позиція малює «1 873,786 мл». Округлюємо ДО запису у варіант, тож
  // інваріант суми рахується вже з цілих і не розходиться.
  return { dimension: "volume", base: Math.round(base.base / density) };
}

/**
 * Найзручніша «побутова» одиниця для виміру: та сама шкала, що й
 * `LOW_STOCK_THRESHOLD_BY_UNIT` і що вже показує список покупок.
 *
 * Поріг 1000 — саме він робить читабельним обидва кінці шкали. Місячна
 * закупівля молока в базовій одиниці це «20 000 мл», і таке число читається
 * як помилка; одна ж пачка в літрах — «0,874 л» — читається гірше за «874
 * мл». Одне правило на обидва рівні картки продукту дає потрібне саме
 * собою: сума виїжджає в літри, окремі покупки лишаються в мілілітрах.
 *
 * `шт` більшої одиниці не має і лишається собою.
 */
export function fromBaseNatural(
  base: number,
  dimension: UnitDimension,
): { value: number; unit: string } {
  if (dimension === "mass") {
    return base >= 1000
      ? { value: base / 1000, unit: "кг" }
      : { value: base, unit: "г" };
  }
  if (dimension === "volume") {
    return base >= 1000
      ? { value: base / 1000, unit: "л" }
      : { value: base, unit: "мл" };
  }
  return { value: base, unit: "шт" };
}

/**
 * Точність показу побутової одиниці: до сотих для `кг`/`л` (кухонна вага
 * рідко точніша за 10 г, «1.20 кг» читається гірше за «1.2 кг»), ціле для
 * решти (`г`/`мл`/`шт`).
 *
 * unification-modules.md #2.11: те саме правило раніше жило окремо в
 * `shoppingListPantryMath.ts` і в `formatPantryQty.ts` — тут єдине джерело.
 */
export function displayDecimalsFor(unit: string): number {
  return unit === "кг" || unit === "л" ? 2 : 0;
}

/**
 * Кількість позиції комори у побутовій одиниці, або `null` коли одиниця
 * не є одиницею ВИМІРУ.
 *
 * Друге важливе: `null` тут — не помилка, а нормальний стан. У полі `unit`
 * позиції, набитої з чека без варіантів, лежить ФАСУВАННЯ («0,25л»), а не
 * одиниця виміру; зводити його до побутової шкали не можна, бо це не та
 * сама величина. Викликач у такому разі показує рядок як раніше.
 *
 * Вимір НЕ змінюється: позиція в грамах лишається в грамах або кілограмах.
 * Конверсія маси рідини в об'єм належить моменту ЗАПИСУ
 * (`massToVolumeIfKnown`), не показу — інакше людина купила б «900 г», а
 * комора малювала б «874 мл» на тому самому числі.
 */
export function pantryQtyNatural(
  qty: number | null | undefined,
  unit: string | null | undefined,
): { value: number; unit: string } | null {
  const q = Number(qty);
  if (qty == null || !Number.isFinite(q)) return null;
  const normalized = unit ? normalizeUnit(unit) : null;
  if (!normalized) return null;
  const based = toBase(q, normalized);
  if (!based) return null;
  return fromBaseNatural(based.base, based.dimension);
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
  name?: unknown,
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
    const out = massToVolumeIfKnown(based, name);
    return { qty: out.base, unit: baseUnitFor(out.dimension) };
  }

  const normalized = normalizeUnit(raw);
  if (!normalized) return null;
  const based = toBase(qty, normalized);
  if (!based) return null;
  const out = massToVolumeIfKnown(based, name);
  return { qty: out.base, unit: baseUnitFor(out.dimension) };
}

/**
 * Скільки ОДИНИЦЬ фасування було в покупці: `2` для «2 × 0,25 л».
 *
 * Живе окремо від {@link receiptQtyToBase}, бо там кількість уже втоплена в
 * добуток і назад не дістається: «500 мл» однаково описує дві банки по 250
 * і одну пляшку 500. Число суто презентаційне — арифметика комори працює
 * лише з базовою кількістю, тож інваріант суми варіантів воно не чіпає.
 *
 * `null` там, де множення не відбувалось: чиста одиниця виміру («0.212 кг»
 * вагового товару) або одна штука фасування.
 */
export function receiptPackCount(
  qty: number | null | undefined,
  unit: string | null | undefined,
): number | null {
  if (qty == null || !Number.isFinite(qty) || qty <= 1) return null;
  if (!Number.isInteger(qty)) return null;
  const raw = String(unit ?? "").trim();
  if (!raw || !PACKAGING_RE.test(raw)) return null;
  return qty;
}
