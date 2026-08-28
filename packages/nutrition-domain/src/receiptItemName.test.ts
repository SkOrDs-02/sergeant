import { describe, expect, it } from "vitest";
import {
  findPantryMatch,
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
