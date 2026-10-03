// @vitest-environment jsdom
/**
 * Last validated: 2026-08-29
 * Status: Active
 *
 * Побутові одиниці на картці продукту. Скарга founder-а 2026-08-29:
 * місячна закупівля молока показувалась як «20 000 мл» — число, що
 * читається як помилка вводу.
 */
import { describe, expect, it } from "vitest";

import { formatPantryQty } from "./formatPantryQty";

/** Нерозривний пробіл, яким форматер клеїть число з одиницею. */
const NBSP = "\u00a0";

describe("formatPantryQty", () => {
  it.each([
    [1874, "мл", `1,87${NBSP}л`],
    [20000, "мл", `20${NBSP}л`],
    [1500, "мл", `1,5${NBSP}л`],
    [1500, "г", `1,5${NBSP}кг`],
    [2, "кг", `2${NBSP}кг`],
    [1, "л", `1${NBSP}л`],
  ])("%s %s → %s", (qty, unit, expected) => {
    expect(formatPantryQty(qty, unit)).toBe(expected);
  });

  it.each([
    [874, "мл", `874${NBSP}мл`],
    [999, "мл", `999${NBSP}мл`],
    [250, "г", `250${NBSP}г`],
    [10, "шт", `10${NBSP}шт`],
  ])("нижче порога лишається базовою: %s %s → %s", (qty, unit, expected) => {
    expect(formatPantryQty(qty, unit)).toBe(expected);
  });

  it("рівно 1000 уже переходить у велику одиницю", () => {
    expect(formatPantryQty(1000, "мл")).toBe(`1${NBSP}л`);
    expect(formatPantryQty(999, "мл")).toBe(`999${NBSP}мл`);
  });

  it("хвостові нулі не показуються", () => {
    expect(formatPantryQty(1500, "мл")).not.toContain("1,50");
  });

  // Той самий поріг, що й у списку покупок: одна картка продукту не має
  // малювати «1874 мл» там, де покупки кажуть «1,87 л».
  it("вимір НЕ змінюється — грами не стають мілілітрами", () => {
    // Конверсія маси рідини в об'єм належить моменту запису, не показу.
    expect(formatPantryQty(900, "г")).toBe(`900${NBSP}г`);
  });

  it("фасування з чека лишається фасуванням, а не побутовою шкалою", () => {
    // `unit` тут — не одиниця виміру, а розмір пачки.
    expect(formatPantryQty(2, "0,25л")).toBe(`2${NBSP}×${NBSP}0,25${NBSP}л`);
    expect(formatPantryQty(1, "уп")).toBe(`1${NBSP}уп`);
  });

  it("порожня кількість не вигадує числа", () => {
    expect(formatPantryQty(null, "мл")).toBe("мл");
    expect(formatPantryQty(null, null)).toBeNull();
  });
});
