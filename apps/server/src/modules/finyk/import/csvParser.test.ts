import { describe, expect, it } from "vitest";
import {
  inferDecimalSeparator,
  parseSignedAmountKopiykas,
} from "./csvParser.js";

describe("parseSignedAmountKopiykas", () => {
  it("парсить dot-decimal відʼємну суму", () => {
    expect(parseSignedAmountKopiykas("-847.50")).toBe(-84750);
  });

  it("парсить dot-decimal додатну суму", () => {
    expect(parseSignedAmountKopiykas("1000.00")).toBe(100000);
  });

  it("парсить comma-decimal суму з decimalComma:true", () => {
    expect(parseSignedAmountKopiykas("1234,56", { decimalComma: true })).toBe(
      123456,
    );
  });

  it("парсить суму з пробілом-роздільником тисяч", () => {
    expect(parseSignedAmountKopiykas("1 234,56", { decimalComma: true })).toBe(
      123456,
    );
  });

  it("парсить суму з NBSP-роздільником тисяч", () => {
    expect(parseSignedAmountKopiykas("1 234,56", { decimalComma: true })).toBe(
      123456,
    );
  });

  it("автодетект: лише кома присутня", () => {
    expect(parseSignedAmountKopiykas("100,50")).toBe(10050);
  });

  it("автодетект: останній з коми і крапки вважається десятковим", () => {
    expect(parseSignedAmountKopiykas("1,234.56")).toBe(123456);
    expect(parseSignedAmountKopiykas("1.234,56")).toBe(123456);
  });

  it("прибирає суфікс валюти", () => {
    expect(parseSignedAmountKopiykas("100.00 UAH")).toBe(10000);
    expect(parseSignedAmountKopiykas("100.00 грн")).toBe(10000);
  });

  it("decimalComma:false форсує крапку", () => {
    expect(parseSignedAmountKopiykas("1,234.56", { decimalComma: false })).toBe(
      123456,
    );
  });

  it("повертає null на порожній рядок", () => {
    expect(parseSignedAmountKopiykas("")).toBeNull();
    expect(parseSignedAmountKopiykas("   ")).toBeNull();
  });

  it("повертає null на нечисловий рядок", () => {
    expect(parseSignedAmountKopiykas("не число")).toBeNull();
  });

  it("округлює копійки від float-дрейфу", () => {
    expect(parseSignedAmountKopiykas("10.1")).toBe(1010);
  });

  it("відкидає hex, експоненту й Infinity замість мовчазної «суми» (data-31)", () => {
    expect(parseSignedAmountKopiykas("0x10")).toBeNull();
    expect(parseSignedAmountKopiykas("1e3")).toBeNull();
    expect(parseSignedAmountKopiykas("-1E3")).toBeNull();
    expect(parseSignedAmountKopiykas("Infinity")).toBeNull();
    expect(
      parseSignedAmountKopiykas("0x10", { decimalComma: true }),
    ).toBeNull();
    expect(
      parseSignedAmountKopiykas("1e3", { decimalComma: false }),
    ).toBeNull();
  });

  it("лишає прийнятними звичайні десяткові, знак і float-хвіст з XLSX", () => {
    expect(parseSignedAmountKopiykas("+1000.5")).toBe(100050);
    expect(parseSignedAmountKopiykas("-45.5")).toBe(-4550);
    expect(parseSignedAmountKopiykas("12.300000000000001")).toBe(1230);
    expect(parseSignedAmountKopiykas("1 234,56 грн")).toBe(123456);
  });
});

describe("parseSignedAmountKopiykas — реальні формати (data-31)", () => {
  it.each([
    ["1 234,56", 123456],
    ["1\u00A0234,56", 123456],
    ["1,234.56", 123456],
    ["1.234,56", 123456],
    ["1234", 123400],
    ["1,234,567.89", 123456789],
    ["1.234.567,89", 123456789],
    ["-95,50", -9550],
    ["\u221295,50", -9550],
    ["(95,50)", -9550],
    ["95,50 ₴", 9550],
    ["0,125", 13],
  ])("«%s» читається за собою без підказки", (raw, expected) => {
    expect(parseSignedAmountKopiykas(raw)).toBe(expected);
  });

  it("неоднозначне «1,234» і «1.234» без підказки відхиляється", () => {
    expect(parseSignedAmountKopiykas("1,234")).toBeNull();
    expect(parseSignedAmountKopiykas("1.234")).toBeNull();
    expect(parseSignedAmountKopiykas("-1,234")).toBeNull();
  });

  it("підказка розв'язує «1,234»: кома тисячна ⇒ 1234, кома десяткова ⇒ відмова", () => {
    expect(parseSignedAmountKopiykas("1,234", { decimalComma: false })).toBe(
      123400,
    );
    expect(
      parseSignedAmountKopiykas("1,234", { decimalComma: true }),
    ).toBeNull();
    expect(parseSignedAmountKopiykas("1.234", { decimalComma: true })).toBe(
      123400,
    );
    expect(
      parseSignedAmountKopiykas("1.234", { decimalComma: false }),
    ).toBeNull();
  });

  it("підказка не псує однозначну клітинку (раніше «1,234.56» з true давало ~1,23)", () => {
    expect(parseSignedAmountKopiykas("1,234.56", { decimalComma: true })).toBe(
      123456,
    );
    expect(parseSignedAmountKopiykas("12.50", { decimalComma: true })).toBe(
      1250,
    );
  });

  it("відкидає криві групи тисяч", () => {
    expect(parseSignedAmountKopiykas("1,23,456")).toBeNull();
    expect(parseSignedAmountKopiykas("1,234,56")).toBeNull();
    expect(parseSignedAmountKopiykas("1.2.3")).toBeNull();
    expect(parseSignedAmountKopiykas("1,234.567,8")).toBeNull();
  });
});

describe("inferDecimalSeparator — по колонці", () => {
  it("копійки з комою в колонці роблять кому десятковою", () => {
    expect(inferDecimalSeparator(["12,50", "1,234", "7"])).toBe(",");
  });

  it("копійки з крапкою ⇒ крапка десяткова", () => {
    expect(inferDecimalSeparator(["12.50", "1,234", "7"])).toBe(".");
  });

  it("«1,234,567» доводить, що кома тисячна", () => {
    expect(inferDecimalSeparator(["1,234,567", "1,234"])).toBe(".");
  });

  it("«1.234,56» і «1,234.56» дають свій роздільник", () => {
    expect(inferDecimalSeparator(["1.234,56"])).toBe(",");
    expect(inferDecimalSeparator(["1,234.56"])).toBe(".");
  });

  it("лише цілі та неоднозначні ⇒ відповіді немає", () => {
    expect(inferDecimalSeparator(["1234", "1,234", "", "abc"])).toBeUndefined();
  });

  it("докази обох видів ⇒ mixed", () => {
    expect(inferDecimalSeparator(["12,50", "12.50"])).toBe("mixed");
  });
});
