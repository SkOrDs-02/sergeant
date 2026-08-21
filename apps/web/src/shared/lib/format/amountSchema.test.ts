import { describe, it, expect } from "vitest";
import { amountStringSchema, amountStringToHryvnia } from "./amountSchema";

describe("amountStringSchema", () => {
  const schema = amountStringSchema("Вкажи ліміт");

  it("приймає валідну суму", () => {
    expect(schema.safeParse("1500,50").success).toBe(true);
  });

  it("вживає власне повідомлення для порожнього поля", () => {
    const r = schema.safeParse("");
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error.issues[0]?.message).toBe("Вкажи ліміт");
  });

  it("вживає власне повідомлення і для недодатної суми", () => {
    const r = schema.safeParse("0");
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error.issues[0]?.message).toBe("Вкажи ліміт");
  });

  it("integerOnly відхиляє дробову суму", () => {
    const intSchema = amountStringSchema("Введи ліміт більше 0", {
      integerOnly: true,
    });
    expect(intSchema.safeParse("1500.5").success).toBe(false);
    expect(intSchema.safeParse("1500").success).toBe(true);
  });

  it("лишає канонічні повідомлення для решти помилок", () => {
    const r = schema.safeParse("99999999");
    expect(r.success).toBe(false);
    if (!r.success) {
      expect(r.error.issues[0]?.message).toBe("Максимальна сума: 10 000 000 ₴");
    }
  });

  it.each(["1e9", "-5", "0", "abc", "Infinity"])("відхиляє %s", (v) => {
    expect(schema.safeParse(v).success).toBe(false);
  });
});

describe("amountStringToHryvnia", () => {
  it("округлює до копійки", () => {
    expect(amountStringToHryvnia("12.345")).toBe(12.35);
  });

  it("нормалізує кому й пробіли", () => {
    expect(amountStringToHryvnia(" 1 500,50 ")).toBe(1500.5);
  });
});
