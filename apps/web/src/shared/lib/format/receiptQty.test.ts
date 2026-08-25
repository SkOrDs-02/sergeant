import { describe, expect, it } from "vitest";
import { formatReceiptQty } from "./receiptQty";

const nbsp = " ";

describe("formatReceiptQty", () => {
  it("одна пачка — без множника (це і був баг «1 200г»)", () => {
    expect(formatReceiptQty(1, "200г")).toBe(`200${nbsp}г`);
    expect(formatReceiptQty(1, "0,25л")).toBe(`0,25${nbsp}л`);
  });

  it("кілька пачок — множник відділений «×»", () => {
    expect(formatReceiptQty(2, "0,25л")).toBe(`2${nbsp}×${nbsp}0,25${nbsp}л`);
    expect(formatReceiptQty(3, "800г")).toBe(`3${nbsp}×${nbsp}800${nbsp}г`);
  });

  it("одиниця виміру лишається сумісною з кількістю", () => {
    expect(formatReceiptQty(0.196, "кг")).toBe(`0,196${nbsp}кг`);
    expect(formatReceiptQty(1, "шт")).toBe(`1${nbsp}шт`);
    expect(formatReceiptQty(2, "пачка")).toBe(`2${nbsp}пачка`);
  });

  it("порожні поля не дають сміття", () => {
    expect(formatReceiptQty(null, "кг")).toBe("кг");
    expect(formatReceiptQty(null, null)).toBeNull();
    expect(formatReceiptQty(2, null)).toBe("2");
    expect(formatReceiptQty(2, "  ")).toBe("2");
  });
});
