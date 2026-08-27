import { describe, expect, it } from "vitest";
import {
  canonicalFoodKey,
  displayFoodName,
  matchFoodName,
  normalizeFoodName,
  normalizeUnit,
  parseLoosePantryText,
} from "./pantryTextParser.js";

describe("normalizeFoodName", () => {
  it("trims and collapses whitespace", () => {
    expect(normalizeFoodName("  курка   філе ")).toBe("курка філе");
  });

  it("лишається аліасом match-нормалізації (сумісність з apps/mobile)", () => {
    expect(normalizeFoodName("Яготинське Молоко")).toBe(
      matchFoodName("Яготинське Молоко"),
    );
  });
});

describe("displayFoodName", () => {
  it("зберігає регістр брендів і власних назв", () => {
    expect(displayFoodName("Яготинське молоко")).toBe("Яготинське молоко");
    expect(displayFoodName("Coca-Cola Zero")).toBe("Coca-Cola Zero");
    expect(displayFoodName("Наша Ряба")).toBe("Наша Ряба");
  });

  it("прибирає лише зайві пробіли та хвостову пунктуацію", () => {
    expect(displayFoodName("  Курка   Філе ")).toBe("Курка Філе");
    expect(displayFoodName(",Хліб;")).toBe("Хліб");
  });

  it("порізаний однаково з match-ключем — різниця рівно у регістрі", () => {
    for (const raw of ["  Яготинське   молоко ", ",Coca-Cola;", "•Сіль"]) {
      expect(displayFoodName(raw).toLowerCase()).toBe(matchFoodName(raw));
    }
  });
});

describe("matchFoodName", () => {
  it("зводить різний регістр однієї назви до одного ключа", () => {
    expect(matchFoodName("Яготинське молоко")).toBe("яготинське молоко");
    expect(matchFoodName("ЯГОТИНСЬКЕ МОЛОКО")).toBe(
      matchFoodName("яготинське молоко"),
    );
  });
});

describe("normalizeUnit", () => {
  it("normalizes common units", () => {
    expect(normalizeUnit("гр")).toBe("г");
    expect(normalizeUnit("кг")).toBe("кг");
    expect(normalizeUnit("л")).toBe("л");
    expect(normalizeUnit("шт")).toBe("шт");
  });
});

describe("parseLoosePantryText", () => {
  it("parses qty+unit+name", () => {
    expect(parseLoosePantryText("2 яйця")).toEqual([
      { name: "яйця", qty: 2, unit: "шт", notes: null },
    ]);
    expect(parseLoosePantryText("200 г курка")).toEqual([
      { name: "курка", qty: 200, unit: "г", notes: null },
    ]);
    expect(parseLoosePantryText("0.5л молоко")).toEqual([
      { name: "молоко", qty: 0.5, unit: "л", notes: null },
    ]);
  });

  it("splits by commas/semicolons and newlines", () => {
    const items = parseLoosePantryText("яйця, рис;\nогірок");
    expect(items.map((x) => x.name)).toEqual(["яйця", "рис", "огірок"]);
  });

  // B7: розбір не має «зʼїдати» регістр — саме через це комора показувала
  // «qa молоко» замість «QA молоко 1л».
  it("зберігає введений регістр назви у всіх гілках розбору", () => {
    expect(parseLoosePantryText("QA молоко 1л")).toEqual([
      { name: "QA молоко", qty: 1, unit: "л", notes: null },
    ]);
    expect(parseLoosePantryText("1 л Яготинське молоко")).toEqual([
      { name: "Яготинське молоко", qty: 1, unit: "л", notes: null },
    ]);
    expect(parseLoosePantryText("Наша Ряба 2 шт")).toEqual([
      { name: "Наша Ряба", qty: 2, unit: "шт", notes: null },
    ]);
    // гілка «одне слово після числа = назва, не одиниця»
    expect(parseLoosePantryText("2 Яйця")).toEqual([
      { name: "Яйця", qty: 2, unit: "шт", notes: null },
    ]);
    // гілка без кількості взагалі
    expect(parseLoosePantryText("Coca-Cola, Сіль")).toEqual([
      { name: "Coca-Cola", qty: null, unit: null, notes: null },
      { name: "Сіль", qty: null, unit: null, notes: null },
    ]);
  });

  it("одиниця в верхньому регістрі все одно нормалізується", () => {
    expect(parseLoosePantryText("0.5Л Молоко")).toEqual([
      { name: "Молоко", qty: 0.5, unit: "л", notes: null },
    ]);
  });

  it("parses trailing quantity and auto-assigns шт", () => {
    expect(parseLoosePantryText("огірки 4")).toEqual([
      { name: "огірки", qty: 4, unit: "шт", notes: null },
    ]);
    expect(parseLoosePantryText("яйця 3 шт")).toEqual([
      { name: "яйця", qty: 3, unit: "шт", notes: null },
    ]);
  });
});

describe("canonicalFoodKey", () => {
  it("maps plural/genitive forms to canonical", () => {
    expect(canonicalFoodKey("огірки")).toBe("огірок");
    expect(canonicalFoodKey("огірків")).toBe("огірок");
    expect(canonicalFoodKey("помідори")).toBe("помідор");
    expect(canonicalFoodKey("яйця")).toBe("яйце");
  });

  it("passes through unknown single words", () => {
    expect(canonicalFoodKey("кіноа")).toBe("кіноа");
  });

  it("нечутливий до регістру — «Яготинське молоко» зіставляється з нижнім", () => {
    expect(canonicalFoodKey("Яготинське молоко")).toBe(
      canonicalFoodKey("яготинське молоко"),
    );
    expect(canonicalFoodKey("Огірки")).toBe("огірок");
  });
});
