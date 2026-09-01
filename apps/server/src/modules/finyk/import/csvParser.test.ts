import { describe, expect, it } from "vitest";
import { parseSignedAmountKopiykas } from "./csvParser.js";

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
});
