import { describe, it, expect } from "vitest";
import { normalizeAmountInput } from "./amount";
import {
  clampNumericInput,
  normalizeDecimalInput,
  parseDecimalInput,
} from "./numberInput";

const MAX_WEIGHT_KG = 1000;

describe("clampNumericInput", () => {
  it("reads an empty field as zero", () => {
    expect(clampNumericInput("", MAX_WEIGHT_KG)).toBe(0);
  });

  it("passes a value inside the range through", () => {
    expect(clampNumericInput("82.5", MAX_WEIGHT_KG)).toBe(82.5);
  });

  it("приймає кому — тут вона так само обовʼязкова, як у parseDecimalInput", () => {
    // До 2026-08-16 докстрінг стверджував, що споживачів немає, тож кому
    // можна не підтримувати. Споживачів було пʼять, і всі вони мовчки
    // писали 0 замість дробу: вага, грами, план, сума розбиття.
    expect(clampNumericInput("82,5", MAX_WEIGHT_KG)).toBe(82.5);
    expect(clampNumericInput("1 212,1", 99999)).toBe(1212.1);
  });

  it("clamps above the ceiling instead of storing it", () => {
    expect(clampNumericInput("99999999", MAX_WEIGHT_KG)).toBe(MAX_WEIGHT_KG);
    expect(clampNumericInput("1e9", MAX_WEIGHT_KG)).toBe(MAX_WEIGHT_KG);
  });

  it("rejects negatives, NaN and Infinity", () => {
    expect(clampNumericInput("-5", MAX_WEIGHT_KG)).toBe(0);
    expect(clampNumericInput("abc", MAX_WEIGHT_KG)).toBe(0);
    expect(clampNumericInput("Infinity", MAX_WEIGHT_KG)).toBe(0);
  });
});

describe("normalizeDecimalInput", () => {
  it("перетворює кому на крапку — саме її дає UA-розкладка", () => {
    expect(normalizeDecimalInput("1212,1")).toBe("1212.1");
  });

  it("прибирає роздільники груп, які вставляє клавіатура або copy-paste", () => {
    expect(normalizeDecimalInput("1 212,1")).toBe("1212.1");
    expect(normalizeDecimalInput("1 212,1")).toBe("1212.1");
    expect(normalizeDecimalInput("1 212,1")).toBe("1212.1");
    expect(normalizeDecimalInput("1 212,1")).toBe("1212.1");
    expect(normalizeDecimalInput("1'212,1")).toBe("1212.1");
  });

  it("паритет із грошовим нормалізатором — списки роздільників не мають розійтись", () => {
    // `format/amount.ts` тримає власну копію того самого регекспа (там гроші,
    // тут — довільні десяткові, обʼєднувати не можна). Цей тест — гейт проти
    // дрейфу: розійдуться списки — кома працюватиме в одній формі й ні в іншій.
    const samples = [
      "1212,1",
      "1 212,1",
      "1 212,1",
      "1 212,1",
      "1 212,1",
      "1'212,1",
      "  82.5  ",
      "",
    ];
    for (const s of samples) {
      expect(normalizeDecimalInput(s)).toBe(normalizeAmountInput(s));
    }
  });
});

describe("parseDecimalInput", () => {
  it("приймає кому — це і був баг бета-тестера 2026-08-10", () => {
    expect(parseDecimalInput("1212,1")).toEqual({ ok: true, value: 1212.1 });
    expect(parseDecimalInput("121,1")).toEqual({ ok: true, value: 121.1 });
  });

  it("приймає крапку і нуль", () => {
    expect(parseDecimalInput("82.5")).toEqual({ ok: true, value: 82.5 });
    expect(parseDecimalInput("0")).toEqual({ ok: true, value: 0 });
  });

  it("відхиляє відʼємні окремою помилкою", () => {
    expect(parseDecimalInput("-5")).toEqual({ ok: false, error: "negative" });
  });

  it("відхиляє сміття, експоненту й напівчисла", () => {
    for (const bad of [
      "abc",
      "Infinity",
      "1e9",
      "0x10",
      "1.",
      "--5",
      "",
      " ",
    ]) {
      expect(parseDecimalInput(bad)).toEqual({
        ok: false,
        error: "not-a-number",
      });
    }
  });
});
