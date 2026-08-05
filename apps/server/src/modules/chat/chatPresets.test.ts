import { describe, expect, it } from "vitest";
import { CHAT_PRESETS } from "@sergeant/shared";

import { isChatPreset, presetInstruction } from "./chatPresets.js";

describe("presetInstruction", () => {
  it("повертає текст для кожного ідентифікатора з CHAT_PRESETS", () => {
    for (const preset of CHAT_PRESETS) {
      const text = presetInstruction(preset);
      expect(text, `preset "${preset}" без інструкції`).toBeTruthy();
      expect(text).toContain("РЕЖИМ:");
    }
  });

  // Функція навмисно толерантна до `unknown`: `assertAiQuota` читає
  // `req.body.preset` ДО `parseBody`, тобто до звуження типом.
  it("нуль для всього, що не є відомим preset-ом", () => {
    expect(presetInstruction(undefined)).toBeNull();
    expect(presetInstruction("")).toBeNull();
    expect(presetInstruction("profile_interview ")).toBeNull();
    expect(presetInstruction("../../etc/passwd")).toBeNull();
    expect(presetInstruction(42)).toBeNull();
    expect(
      presetInstruction({ toString: () => "profile_interview" }),
    ).toBeNull();
  });
});

describe("інструкція інтервʼю", () => {
  const text = presetInstruction("profile_interview") ?? "";

  // Кожна з цих вимог — окремий дефект попередньої версії промпта,
  // розібраний у docstring-у `chatPresets.ts`. Тест тримає їх на місці,
  // щоб редагування тексту не відкотило рішення мовчки.
  it("обмежує довжину інтервʼю", () => {
    expect(text).toMatch(/Максимум 4 тво/);
  });

  it("зберігає одразу, без раунду підтверджень", () => {
    expect(text).toMatch(/Дозволу не питай/);
    expect(text).not.toMatch(/підтверд/i);
  });

  it("вимагає категорію і один факт на виклик", () => {
    expect(text).toMatch(/один короткий факт із категорією/);
  });

  it("забороняє створювати сутності поза памʼяттю", () => {
    expect(text).toMatch(/Не створюй звички, цілі, транзакції/);
  });

  it("має умову завершення", () => {
    expect(text).toMatch(/У кінці одним реченням/);
  });
});

describe("isChatPreset", () => {
  it("звужує лише до значень із CHAT_PRESETS", () => {
    for (const preset of CHAT_PRESETS) expect(isChatPreset(preset)).toBe(true);
    expect(isChatPreset("profile")).toBe(false);
    expect(isChatPreset(null)).toBe(false);
    expect(isChatPreset(["profile_interview"])).toBe(false);
  });
});
