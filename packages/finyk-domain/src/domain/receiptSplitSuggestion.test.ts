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

  // Репорт founder-а 2026-08-25: у чеку були цигарки, а спліт сказав
  // «все їжа». Обидва кошики додані рішенням «цигарки та алкоголь —
  // різні категорії».
  it.each([
    "Цигарки Marlboro Gold",
    "СИГАРЕТИ Winston XS",
    "Тютюн для кальяну",
    "Стіки HEETS Amber",
    "IQOS Iluma картридж",
  ])("«%s» → smoking", (name) => {
    expect(mapReceiptItemToCategory(item({ name }))).toBe("smoking");
  });

  it.each([
    "Вино Шабо червоне сухе 0,75л",
    "Пиво Львівське світле 0,5л",
    "Напій слабоалкогольний Лонгер",
    "Вино ігристе брют",
    "Віскі Jameson 0,7л",
    "Горілка Хортиця 0,5л",
  ])("«%s» → alcohol", (name) => {
    expect(mapReceiptItemToCategory(item({ name }))).toBe("alcohol");
  });

  // Межа слова на `\p{L}`, а не ``: під `u` кирилиця не входить у
  // `\w`, тож наївний `вино` не збігся б узагалі, а голе «ром»
  // ловило б half чека.
  it.each([
    "Чай ромашковий",
    "Джинси дитячі",
    "Півонія зрізана",
    "Виноград кишмиш",
  ])("«%s» НЕ алкоголь", (name) => {
    expect(mapReceiptItemToCategory(item({ name }))).not.toBe("alcohol");
  });

  it("голий «Пакет» на касі → shopping, не їжа", () => {
    expect(mapReceiptItemToCategory(item({ name: "Пакет" }))).toBe("shopping");
    expect(mapReceiptItemToCategory(item({ name: "Пакет-майка Сільпо" }))).toBe(
      "shopping",
    );
  });

  it("«пакет» усередині назви продукту лишається їжею", () => {
    expect(mapReceiptItemToCategory(item({ name: "Молоко в пакеті 1л" }))).toBe(
      "groceries",
    );
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

  it("алкоголь більше НЕ groceries — власний кошик із 2026-08-25", () => {
    expect(
      mapReceiptItemToCategory(item({ name: "Вино Shabo Каберне 0.75л" })),
    ).toBe("alcohol");
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
