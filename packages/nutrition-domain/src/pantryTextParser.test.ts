import { describe, expect, it } from "vitest";
import {
  canonicalFoodKey,
  displayFoodName,
  matchFoodName,
  normalizeFoodName,
  normalizeUnit,
  parseLoosePantryText,
  PANTRY_AMBIGUOUS_QTY_THRESHOLD,
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

  // Регресії браузерного аудиту 2026-09-01. Кома в українському записі
  // числа двозначна, і сліпий спліт по ній робив із ОДНОГО введеного
  // рядка ДВА записи в коморі, один з яких був товаром на імʼя «%».
  describe("десяткова кома не є роздільником списку", () => {
    it("«Йогурт … 2,2%» лишається однією позицією без фантомного «%»", () => {
      expect(
        parseLoosePantryText("Йогурт Галичина Карпатський чорниця 2,2%"),
      ).toEqual([
        {
          name: "Йогурт Галичина Карпатський чорниця",
          qty: null,
          unit: null,
          notes: null,
        },
      ]);
    });

    it("кома все ще ділить список, коли з якогось боку не цифра", () => {
      expect(parseLoosePantryText("молоко, яйця 3")).toEqual([
        { name: "молоко", qty: null, unit: null, notes: null },
        { name: "яйця", qty: 3, unit: "шт", notes: null },
      ]);
      expect(parseLoosePantryText("огірок 2, яйця")).toEqual([
        { name: "огірок", qty: 2, unit: "шт", notes: null },
        { name: "яйця", qty: null, unit: null, notes: null },
      ]);
    });

    it("десяткова кома з одиницею дає дробову кількість", () => {
      expect(parseLoosePantryText("молоко 1,5 л")).toEqual([
        { name: "молоко", qty: 1.5, unit: "л", notes: null },
      ]);
    });
  });

  describe("негодяща кількість не стає частиною назви", () => {
    it.each([
      ["Молоко -5 г", "Молоко"],
      ["Сіль 1e9 г", "Сіль"],
      ["Цукор 0 г", "Цукор"],
    ])("«%s» → назва «%s» без кількості", (raw, name) => {
      expect(parseLoosePantryText(raw)).toEqual([
        { name, qty: null, unit: null, notes: null },
      ]);
    });

    it("побутова велика кількість лишається дозволеною", () => {
      expect(parseLoosePantryText("цукор 50000 г")).toEqual([
        { name: "цукор", qty: 50000, unit: "г", notes: null },
      ]);
    });
  });

  describe("відсоток це жирність, а не одиниця й не назва", () => {
    it("«2 %» не породжує безіменний запис", () => {
      expect(parseLoosePantryText("2 %")).toEqual([]);
    });

    it("одиниця «%» не доїжджає до позиції комори", () => {
      expect(normalizeUnit("%")).toBeNull();
      // Жирність числом не є: «сметана 20%» це сметана, а не 20 чогось.
      expect(parseLoosePantryText("сметана 20 %")).toEqual([
        { name: "сметана", qty: null, unit: null, notes: null },
      ]);
    });
  });
  // UX-4 (аудит 2026-09-01): голе хвостове число без одиниці ≥ порога — це
  // здогадка, не факт. Founder-рішення: перепитувати, а не мовчки ставити
  // «шт». Нижче порога поведінка НЕ змінюється (регресія на «Coca-Cola 2» /
  // «Яйця 10» нижче в тому самому describe).
  describe("ambiguousQty (UX-4)", () => {
    it("flags a bare trailing number at/above the threshold as ambiguous", () => {
      expect(parseLoosePantryText("Нутелла 350")).toEqual([
        {
          name: "Нутелла",
          qty: 350,
          unit: "шт",
          notes: null,
          ambiguousQty: true,
        },
      ]);
      expect(
        parseLoosePantryText(`Цукор ${PANTRY_AMBIGUOUS_QTY_THRESHOLD}`),
      ).toEqual([
        {
          name: "Цукор",
          qty: PANTRY_AMBIGUOUS_QTY_THRESHOLD,
          unit: "шт",
          notes: null,
          ambiguousQty: true,
        },
      ]);
    });

    it("does not flag one below the threshold", () => {
      expect(
        parseLoosePantryText(`Цукор ${PANTRY_AMBIGUOUS_QTY_THRESHOLD - 1}`),
      ).toEqual([
        {
          name: "Цукор",
          qty: PANTRY_AMBIGUOUS_QTY_THRESHOLD - 1,
          unit: "шт",
          notes: null,
        },
      ]);
    });

    // Регресія: обидва приклади з живого репро (edge/Q4) лишаються тихими.
    it("regression: small counts and explicit units never get flagged", () => {
      expect(parseLoosePantryText("Coca-Cola 2")).toEqual([
        { name: "Coca-Cola", qty: 2, unit: "шт", notes: null },
      ]);
      expect(parseLoosePantryText("Яйця 10")).toEqual([
        { name: "Яйця", qty: 10, unit: "шт", notes: null },
      ]);
      expect(parseLoosePantryText("рис 2 кг")).toEqual([
        { name: "рис", qty: 2, unit: "кг", notes: null },
      ]);
    });

    it("an explicit unit is never ambiguous even above the threshold", () => {
      expect(parseLoosePantryText("Борошно 500 г")).toEqual([
        { name: "Борошно", qty: 500, unit: "г", notes: null },
      ]);
    });

    // "N <назва>" завжди рахує предмети, а не вагу — навіть при великому N.
    it("leading count-of-items form ('2 яйця') is never ambiguous", () => {
      expect(parseLoosePantryText("150 огірків")).toEqual([
        { name: "огірків", qty: 150, unit: "шт", notes: null },
      ]);
    });
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
