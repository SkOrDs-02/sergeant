/**
 * `silpoReplenish.ts` - чисті функції, спільні для ручного
 * (`useSilpoPantryReplenish`) і автоматичного (`useSilpoPantryAutoImport`)
 * потоків (спека `docs/work/specs/silpo-pantry-auto-import.md` §
 * «Логіку рядків виносимо в чисті функції»).
 */
import { describe, expect, it } from "vitest";
import { buildPantryIndex } from "@sergeant/nutrition-domain";
import type { SilpoReceiptItemDto } from "@shared/api";
import { buildSilpoReplenishRows, rowsToPantryItems } from "./silpoReplenish";

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
