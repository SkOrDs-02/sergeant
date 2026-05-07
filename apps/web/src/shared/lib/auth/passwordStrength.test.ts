import { describe, it, expect } from "vitest";
import { estimatePasswordStrength } from "./passwordStrength";

describe("estimatePasswordStrength", () => {
  it("returns weak/zero for empty string", () => {
    const r = estimatePasswordStrength("");
    expect(r.level).toBe(0);
    expect(r.score).toBe(0);
    expect(r.classCount).toBe(0);
    expect(r.uniqueChars).toBe(0);
    expect(r.uniqueRatio).toBe(0);
  });

  it("rates `aaaaaaaaaa` (10 chars, 1 unique, 1 class) as weak", () => {
    // PR-15 acceptance criterion #1.
    const r = estimatePasswordStrength("aaaaaaaaaa");
    expect(r.classCount).toBe(1);
    expect(r.uniqueChars).toBe(1);
    expect(r.level).toBe(0);
  });

  it("rates `Aa1!Aa1!Aa` (10 chars, 4 classes) as strong", () => {
    // PR-15 acceptance criterion #2 — повний 4-class набір з достатньою
    // довжиною.
    const r = estimatePasswordStrength("Aa1!Aa1!Aa");
    expect(r.classCount).toBe(4);
    expect(r.level).toBe(2);
  });

  it("rates 10-char two-class word at most medium", () => {
    // `password11` — 9 unique chars, але лише digit + lowercase classes;
    // 2-class cap не дозволяє strong.
    const r = estimatePasswordStrength("password11");
    expect(r.classCount).toBe(2);
    expect(r.level).toBeLessThan(2);
  });

  it("rates pure long lowercase password as weak (single-class cap)", () => {
    // `qwertyuiop` має 10 unique chars, але лише 1 клас → forced weak.
    const r = estimatePasswordStrength("qwertyuiop");
    expect(r.classCount).toBe(1);
    expect(r.level).toBe(0);
  });

  it("rates a long mixed password as strong", () => {
    const r = estimatePasswordStrength("CorrectHorseBattery!9");
    expect(r.classCount).toBeGreaterThanOrEqual(3);
    expect(r.level).toBe(2);
  });

  it("rates a 6-char mixed password as not-strong", () => {
    // Класи всі 4, але length занадто мала для strong.
    const r = estimatePasswordStrength("Ab1!Ab");
    expect(r.classCount).toBe(4);
    expect(r.level).toBeLessThan(2);
  });

  it("uses Cyrillic uppercase/lowercase as separate classes", () => {
    const r = estimatePasswordStrength("Привіт1!Привіт");
    expect(r.classCount).toBe(4);
    expect(r.level).toBeGreaterThan(0);
  });
});
