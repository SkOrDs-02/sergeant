/**
 * `silpoReplenish.ts` - чисті функції аркуша чека Сільпо (спеки
 * `docs/work/specs/silpo-pantry-auto-import.md` § «Логіку рядків виносимо в
 * чисті функції» і `docs/work/specs/silpo-pantry-confirm.md`).
 */
import { describe, expect, it } from "vitest";
import { buildPantryIndex } from "@sergeant/nutrition-domain";
import type { SilpoReceiptItemDto } from "@shared/api";
import {
  buildPantrySkipUpdate,
  buildSilpoReplenishRows,
  isStaleReceipt,
  pantryProductKey,
  rowsToPantryItems,
} from "./silpoReplenish";

function item(overrides: Partial<SilpoReceiptItemDto>): SilpoReceiptItemDto {
  return {
    id: 1,
    name: "Хліб",
    qty: 1,
    unit: "шт",
    priceKop: 3000,
    categorySlug: null,
    barcode: null,
    pantryClaimedAt: null,
    ...overrides,
  };
}

describe("buildSilpoReplenishRows", () => {
  it("дефолт groceries - увімкнено, не-groceries - вимкнено", () => {
    const rows = buildSilpoReplenishRows({
      items: [
        item({ id: 1, name: "Курка гомілка", unit: "кг" }),
        item({ id: 2, name: "Пральний порошок Persil" }),
      ],
      pantryIndex: buildPantryIndex([]),
      checkedState: {},
      keepFullState: {},
    });
    expect(rows.find((r) => r.item.id === 1)?.checked).toBe(true);
    expect(rows.find((r) => r.item.id === 2)?.checked).toBe(false);
  });

  it("pantryClaimedAt != null - БЕЗ галочки за замовчуванням, навіть groceries", () => {
    const rows = buildSilpoReplenishRows({
      items: [
        item({
          id: 1,
          name: "Курка гомілка",
          unit: "кг",
          pantryClaimedAt: "2026-09-25T10:00:00.000Z",
        }),
      ],
      pantryIndex: buildPantryIndex([]),
      checkedState: {},
      keepFullState: {},
    });
    expect(rows[0]?.checked).toBe(false);
  });

  it("взяте з чека, що досі в коморі, заблоковане навіть проти явної галочки", () => {
    const claimed = item({
      id: 1,
      name: "Курка гомілка",
      unit: "кг",
      pantryClaimedAt: "2026-09-25T10:00:00.000Z",
    });
    const inPantry = buildSilpoReplenishRows({
      items: [claimed],
      pantryIndex: buildPantryIndex([{ name: "Курка гомілка" }]),
      checkedState: { 1: true },
      keepFullState: {},
    });
    expect(inPantry[0]).toMatchObject({ locked: true, checked: false });

    const removedFromPantry = buildSilpoReplenishRows({
      items: [claimed],
      pantryIndex: buildPantryIndex([]),
      checkedState: { 1: true },
      keepFullState: {},
    });
    expect(removedFromPantry[0]).toMatchObject({
      locked: false,
      checked: true,
    });
  });

  it("явний вибір людини (checkedState) переважає дефолт", () => {
    const rows = buildSilpoReplenishRows({
      items: [item({ id: 1, name: "Пральний порошок Persil" })],
      pantryIndex: buildPantryIndex([]),
      checkedState: { 1: true },
      keepFullState: {},
    });
    expect(rows[0]?.checked).toBe(true);
  });

  it("matchedName - збіг за canonicalFoodKey, інакше null (нова позиція)", () => {
    const rows = buildSilpoReplenishRows({
      items: [item({ id: 1, name: "молоко яготинське 900г" })],
      pantryIndex: buildPantryIndex([{ name: "Молоко Яготинське 900г" }]),
      checkedState: {},
      keepFullState: {},
    });
    expect(rows[0]?.matchedName).toBe("Молоко Яготинське 900г");
  });
});

describe("rowsToPantryItems", () => {
  it("дає той самий PantryItem[], що й ручний потік до рефакторингу (snapshot)", () => {
    const rows = buildSilpoReplenishRows({
      items: [
        item({
          id: 1,
          name: "Молоко Яготинське 2.6% 900г",
          unit: "900г",
        }),
      ],
      pantryIndex: buildPantryIndex([]),
      checkedState: {},
      keepFullState: {},
    });
    const out = rowsToPantryItems(rows, "2026-08-17T10:00:00.000Z");
    expect(out).toMatchSnapshot();
  });

  it("keepFull лишає повну назву з чека замість родової", () => {
    const rows = buildSilpoReplenishRows({
      items: [
        item({ id: 1, name: "Молоко Яготинське 2.6% 900г", unit: "900г" }),
      ],
      pantryIndex: buildPantryIndex([]),
      checkedState: {},
      keepFullState: { 1: true },
    });
    const out = rowsToPantryItems(rows, "2026-08-17T10:00:00.000Z");
    expect(out[0]?.name).toBe("Молоко Яготинське 2.6% 900г");
  });
});

describe("галочки за замовчуванням: давність і «зазвичай не додаєш»", () => {
  const base = {
    pantryIndex: buildPantryIndex([]),
    checkedState: {},
    keepFullState: {},
  };

  it("продукт із лічильником 3 без галочки і з підписом", () => {
    const rows = buildSilpoReplenishRows({
      ...base,
      items: [
        item({ id: 1, name: "Молоко Галичина 2,5% 900г" }),
        item({ id: 2, name: "Хліб Київхліб" }),
      ],
      skippedKeys: new Set([pantryProductKey("Молоко Яготинське 2,6% 900г")]),
    });
    expect(rows[0]).toMatchObject({ checked: false, usuallySkipped: true });
    expect(rows[1]).toMatchObject({ checked: true, usuallySkipped: false });
  });

  it("чек старший за 7 днів дає всі рядки без галочки", () => {
    const rows = buildSilpoReplenishRows({
      ...base,
      items: [item({ id: 1, name: "Курка гомілка" }), item({ id: 2 })],
      stale: true,
    });
    expect(rows.map((r) => r.checked)).toEqual([false, false]);
    expect(rows.every((r) => !r.usuallySkipped)).toBe(true);
  });

  it("хімія без галочки, як і раніше, і підпису «зазвичай не додаєш» не має", () => {
    const rows = buildSilpoReplenishRows({
      ...base,
      items: [item({ id: 1, name: "Пральний порошок Persil" })],
      skippedKeys: new Set([pantryProductKey("Пральний порошок Persil")]),
    });
    expect(rows[0]).toMatchObject({ checked: false, usuallySkipped: false });
  });

  it("isStaleReceipt: поріг рівно 7 днів", () => {
    const now = Date.parse("2026-11-26T12:00:00.000Z");
    expect(isStaleReceipt("2026-11-19T12:00:00.000Z", now)).toBe(false);
    expect(isStaleReceipt("2026-11-19T11:59:00.000Z", now)).toBe(true);
  });
});

describe("pantryProductKey", () => {
  it("один продукт різних брендів дає один ключ", () => {
    expect(pantryProductKey("Молоко Галичина 2,5% 900г")).toBe(
      pantryProductKey("Молоко Яготинське 2,6% 900г"),
    );
  });

  it("різні сири лишаються різними ключами", () => {
    expect(pantryProductKey("Сир кисломолочний Галичина 9%")).not.toBe(
      pantryProductKey("Сир твердий Гауда Пирятин 45%"),
    );
  });
});

describe("buildPantrySkipUpdate", () => {
  const base = {
    pantryIndex: buildPantryIndex([]),
    keepFullState: {},
  };

  it("знята дефолтна галочка - skipped, додане - added", () => {
    const rows = buildSilpoReplenishRows({
      ...base,
      items: [
        item({ id: 1, name: "Молоко Галичина 900г" }),
        item({ id: 2, name: "Хліб Київхліб" }),
      ],
      checkedState: { 1: false },
    });
    expect(buildPantrySkipUpdate(rows, new Set([2]))).toEqual({
      skipped: [pantryProductKey("Молоко Галичина 900г")],
      added: [pantryProductKey("Хліб Київхліб")],
    });
  });

  it("рядки без дефолтної галочки, яких не чіпали, не рахуються", () => {
    const stale = buildSilpoReplenishRows({
      ...base,
      items: [item({ id: 1, name: "Курка гомілка" })],
      checkedState: {},
      stale: true,
    });
    const chem = buildSilpoReplenishRows({
      ...base,
      items: [item({ id: 2, name: "Пральний порошок Persil" })],
      checkedState: {},
    });
    const learned = buildSilpoReplenishRows({
      ...base,
      items: [item({ id: 3, name: "Молоко Галичина 900г" })],
      checkedState: {},
      skippedKeys: new Set([pantryProductKey("Молоко Галичина 900г")]),
    });
    expect(
      buildPantrySkipUpdate([...stale, ...chem, ...learned], new Set()),
    ).toEqual({ skipped: [], added: [] });
  });

  it("додавання рядка зі старого чека скидає лічильник", () => {
    const rows = buildSilpoReplenishRows({
      ...base,
      items: [item({ id: 1, name: "Курка гомілка" })],
      checkedState: { 1: true },
      stale: true,
    });
    expect(buildPantrySkipUpdate(rows, new Set([1]))).toEqual({
      skipped: [],
      added: [pantryProductKey("Курка гомілка")],
    });
  });

  it("продукт і знятий, і доданий в одному «Додати» - лише added", () => {
    const rows = buildSilpoReplenishRows({
      ...base,
      items: [
        item({ id: 1, name: "Молоко Галичина 900г" }),
        item({ id: 2, name: "Молоко Яготинське 900г" }),
      ],
      checkedState: { 1: false },
    });
    expect(buildPantrySkipUpdate(rows, new Set([2]))).toEqual({
      skipped: [],
      added: [pantryProductKey("Молоко Галичина 900г")],
    });
  });
});
