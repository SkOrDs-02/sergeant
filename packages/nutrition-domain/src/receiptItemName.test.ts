import { describe, expect, it } from "vitest";
import {
  findPantryMatch,
  genericFoodName,
  normalizeReceiptItemName,
} from "./receiptItemName.js";

describe("normalizeReceiptItemName", () => {
  it("прибирає пакувальний шум, лишаючи продукт", () => {
    expect(normalizeReceiptItemName("Молоко Яготинське 2.6% 900г")).toBe(
      "Молоко Яготинське",
    );
    expect(normalizeReceiptItemName("Хліб Київський нарізний 600г")).toBe(
      "Хліб Київський нарізний",
    );
    expect(normalizeReceiptItemName("Сир кисломолочний 9% 350г ТМ")).toBe(
      "Сир кисломолочний",
    );
  });

  it("не чіпає назву без пакувальних токенів", () => {
    // Обидві позиції з реального чека — там нема чого прибирати.
    expect(normalizeReceiptItemName("Котлети курячі з кускусом")).toBe(
      "Котлети курячі з кускусом",
    );
    expect(normalizeReceiptItemName("Асорті із свіжих овочів")).toBe(
      "Асорті із свіжих овочів",
    );
  });

  it("повертає вихідну назву, коли після чистки нічого не лишилось", () => {
    expect(normalizeReceiptItemName("900г")).toBe("900г");
    expect(normalizeReceiptItemName("")).toBe("");
  });
});

describe("findPantryMatch", () => {
  const pantry = [
    { name: "Молоко" },
    { name: "Яйця" },
    { name: "Молоко кокосове" },
  ];

  it("знаходить коротку позицію комори всередині довгої назви з чека", () => {
    // Саме цей випадок раніше створював у коморі дубль замість доливання.
    expect(findPantryMatch("Молоко Яготинське 2.6% 900г", pantry)).toEqual({
      name: "Молоко",
    });
  });

  it("віддає перевагу специфічнішій позиції при неоднозначності", () => {
    expect(findPantryMatch("Молоко кокосове Aroy-D 400мл", pantry)).toEqual({
      name: "Молоко кокосове",
    });
  });

  it("не вигадує збіг для чужого продукту", () => {
    expect(findPantryMatch("Котлети курячі з кускусом", pantry)).toBeNull();
    expect(findPantryMatch("", pantry)).toBeNull();
  });

  it("точний збіг лишається точним", () => {
    expect(findPantryMatch("яйця", pantry)).toEqual({ name: "Яйця" });
  });
});

describe("genericFoodName", () => {
  // Таблиця з § Рішення 3 спеки `pantry-generic-names.md`.
  it.each([
    ["Молоко Яготинське 2.6% 900г", "Молоко"],
    ["Насіння Roni гарбуза", "Насіння гарбуза"],
    ["Паста арахісова Лавка традицій Aumi кранч", "Паста арахісова кранч"],
    ["Напій енергетичний Red Bull", "Напій енергетичний"],
    ["Котлети курячі з кускусом", "Котлети курячі з кускусом"],
  ])("'%s' → '%s'", (raw, expected) => {
    expect(genericFoodName(raw)).toBe(expected);
  });

  it("не втрачає сорт у CAPS-назві (правило великої літери вимкнене)", () => {
    // Без захисту від CAPS від назви лишилось би «СИР».
    expect(genericFoodName("СИР КИСЛОМОЛОЧНИЙ 9%")).toBe("СИР КИСЛОМОЛОЧНИЙ");
  });

  it("у CAPS-назві латиниця все одно вважається брендом", () => {
    expect(genericFoodName("СИР ADYGEA КИСЛОМОЛОЧНИЙ")).toBe(
      "СИР КИСЛОМОЛОЧНИЙ",
    );
  });

  it.each([
    ["Сир Адигейський", "Сир Адигейський"],
    ["Ковбаса Краківська", "Ковбаса Краківська"],
    ["Соус BBQ Heinz", "Соус BBQ"],
    ["Кола Zero", "Кола Zero"],
    ["Яблука Голден", "Яблука Голден"],
  ])("стоп-лист зберігає сорт: '%s' → '%s'", (raw, expected) => {
    expect(genericFoodName(raw)).toBe(expected);
  });

  it("перший токен не викидається ніколи", () => {
    expect(genericFoodName("Nutella 350г")).toBe("Nutella");
    expect(genericFoodName("Яготинське 900г")).toBe("Яготинське");
  });

  it("фолбек: назва з самого шуму лишається повною", () => {
    expect(genericFoodName("900г")).toBe("900г");
    expect(genericFoodName("")).toBe("");
    // Після викидання бренду лишився б один символ — беремо повну назву.
    expect(genericFoodName("Я Roni")).toBe("Я Roni");
  });
});

describe("buildPantryIndex + findPantryMatch зі варіантами", () => {
  it("знаходить позицію за назвою її варіанта", () => {
    const pantry = [
      {
        name: "Молоко",
        sources: [
          {
            name: "Молоко Яготинське 2.6% 900г",
            qty: 900,
            unit: "мл",
            addedAt: "2026-08-21",
          },
        ],
      },
    ];
    expect(findPantryMatch("Молоко Яготинське 2.6% 900г", pantry)?.name).toBe(
      "Молоко",
    );
  });
});
