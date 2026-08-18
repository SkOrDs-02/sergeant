import { describe, expect, it } from "vitest";
import {
  mapReceiptItemToCategory,
  suggestSplitsFromReceiptItems,
  type ReceiptItemForSplit,
} from "./receiptSplitSuggestion";

function item(over: Partial<ReceiptItemForSplit> = {}): ReceiptItemForSplit {
  return { name: "Молоко Яготинське 2.6% 900г", priceKop: 4_500, ...over };
}

describe("mapReceiptItemToCategory", () => {
  it("їжа за замовчуванням → groceries", () => {
    expect(mapReceiptItemToCategory(item())).toBe("groceries");
  });

  it("гігієна/аптека за назвою → health", () => {
    expect(
      mapReceiptItemToCategory(item({ name: "Зубна паста Sensodyne 75мл" })),
    ).toBe("health");
    expect(
      mapReceiptItemToCategory(item({ name: "Шампунь Head&Shoulders" })),
    ).toBe("health");
  });

  it("побутова хімія/госптовари за назвою → shopping", () => {
    expect(
      mapReceiptItemToCategory(item({ name: "Пральний порошок Persil 2.4кг" })),
    ).toBe("shopping");
    expect(
      mapReceiptItemToCategory(item({ name: "Папір туалетний Zewa 8шт" })),
    ).toBe("shopping");
    expect(
      mapReceiptItemToCategory(item({ name: "Корм для котів Whiskas" })),
    ).toBe("shopping");
  });

  it("слаг Сільпо має пріоритет над назвою", () => {
    expect(
      mapReceiptItemToCategory(
        item({ name: "Мило дитяче", categorySlug: "hygiene-baby" }),
      ),
    ).toBe("health");
    expect(
      mapReceiptItemToCategory(
        item({ name: "Щось незрозуміле", categorySlug: "household-cleaning" }),
      ),
    ).toBe("shopping");
  });

  it("алкоголь свідомо лишається groceries (окремої категорії немає)", () => {
    expect(
      mapReceiptItemToCategory(item({ name: "Вино Shabo Каберне 0.75л" })),
    ).toBe("groceries");
  });
});

describe("suggestSplitsFromReceiptItems", () => {
  it("групує за категоріями, сортує за сумою, рахує total у копійках", () => {
    const result = suggestSplitsFromReceiptItems([
      item({ name: "Хліб", priceKop: 2_000 }),
      item({ name: "Сир", priceKop: 12_000 }),
      item({ name: "Пральний порошок", priceKop: 20_000 }),
      item({ name: "Зубна паста", priceKop: 5_000 }),
    ]);
    expect(result.totalKop).toBe(39_000);
    expect(result.singleCategory).toBe(false);
    expect(result.splits).toEqual([
      { categoryId: "shopping", amountKop: 20_000, itemCount: 1 },
      { categoryId: "groceries", amountKop: 14_000, itemCount: 2 },
      { categoryId: "health", amountKop: 5_000, itemCount: 1 },
    ]);
  });

  it("одна категорія → singleCategory=true (спліт не потрібен)", () => {
    const result = suggestSplitsFromReceiptItems([
      item({ priceKop: 1_000 }),
      item({ name: "Яйця", priceKop: 2_000 }),
    ]);
    expect(result.singleCategory).toBe(true);
    expect(result.splits).toEqual([
      { categoryId: "groceries", amountKop: 3_000, itemCount: 2 },
    ]);
  });

  it("ігнорує позиції з нульовою/невалідною ціною", () => {
    const result = suggestSplitsFromReceiptItems([
      item({ priceKop: 0 }),
      item({ name: "Сік", priceKop: 3_000 }),
    ]);
    expect(result.totalKop).toBe(3_000);
    expect(result.splits[0]?.itemCount).toBe(1);
  });

  it("порожній чек → порожня пропозиція", () => {
    const result = suggestSplitsFromReceiptItems([]);
    expect(result.splits).toEqual([]);
    expect(result.singleCategory).toBe(true);
    expect(result.totalKop).toBe(0);
  });
});
