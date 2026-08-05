import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Request } from "express";

import { resolvePresetBudget } from "./aiQuotaBudget.js";

/** Мінімальний `req` — резолвер читає лише `body.preset`. */
function reqWith(body: unknown): Request {
  return { body } as Request;
}

const ENV_KEYS = [
  "AI_QUOTA_PRESET_LIMITS",
  "AI_QUOTA_PRESET_WEEKLY_LIMIT",
] as const;
const saved: Record<string, string | undefined> = {};

beforeEach(() => {
  for (const key of ENV_KEYS) {
    saved[key] = process.env[key];
    delete process.env[key];
  }
});

afterEach(() => {
  for (const key of ENV_KEYS) {
    if (saved[key] === undefined) delete process.env[key];
    else process.env[key] = saved[key];
  }
});

describe("resolvePresetBudget", () => {
  it("невідомий / відсутній preset → звичайне денне відро", () => {
    expect(resolvePresetBudget(reqWith(undefined))).toBeNull();
    expect(resolvePresetBudget(reqWith({}))).toBeNull();
    // Підсунути собі нове відро довільним рядком не можна — enum-звірка.
    expect(
      resolvePresetBudget(reqWith({ preset: "my_own_bucket" })),
    ).toBeNull();
    expect(resolvePresetBudget(reqWith({ preset: 42 }))).toBeNull();
  });

  it("кожен preset має ВЛАСНЕ відро, не спільне", () => {
    const a = resolvePresetBudget(reqWith({ preset: "profile_interview" }));
    const b = resolvePresetBudget(reqWith({ preset: "profile_add_info" }));
    expect(a!.bucket).toBe("preset:profile_interview");
    expect(b!.bucket).toBe("preset:profile_add_info");
    expect(a!.bucket).not.toBe(b!.bucket);
  });

  // Вікно тижневе — інакше стеля зловживання була б +limit ЩОДНЯ.
  it("вікно = понеділок київського тижня, спільний для обох режимів", () => {
    const a = resolvePresetBudget(reqWith({ preset: "profile_interview" }))!;
    const b = resolvePresetBudget(reqWith({ preset: "profile_add_info" }))!;
    expect(a.day).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(a.day).toBe(b.day);
    // Понеділок: `Date.UTC` тут безпечний, бо звіряємо саме календарний день.
    const [y, m, d] = a.day.split("-").map(Number);
    expect(new Date(Date.UTC(y!, m! - 1, d!)).getUTCDay()).toBe(1);
  });

  it("вбудовані дефолти різні для різних режимів", () => {
    expect(
      resolvePresetBudget(reqWith({ preset: "profile_interview" }))!.limit,
    ).toBe(10);
    expect(
      resolvePresetBudget(reqWith({ preset: "profile_add_info" }))!.limit,
    ).toBe(4);
  });

  describe("precedence лімітів", () => {
    it("AI_QUOTA_PRESET_LIMITS перебиває глобальний і вбудований", () => {
      process.env["AI_QUOTA_PRESET_WEEKLY_LIMIT"] = "7";
      process.env["AI_QUOTA_PRESET_LIMITS"] = '{"profile_interview":3}';
      expect(
        resolvePresetBudget(reqWith({ preset: "profile_interview" }))!.limit,
      ).toBe(3);
      // Режим поза мапою падає на глобальний, а не на вбудований.
      expect(
        resolvePresetBudget(reqWith({ preset: "profile_add_info" }))!.limit,
      ).toBe(7);
    });

    it("глобальний AI_QUOTA_PRESET_WEEKLY_LIMIT перебиває вбудований", () => {
      process.env["AI_QUOTA_PRESET_WEEKLY_LIMIT"] = "6";
      expect(
        resolvePresetBudget(reqWith({ preset: "profile_interview" }))!.limit,
      ).toBe(6);
    });

    it("0 — валідне значення (вимикає режим), не «не задано»", () => {
      process.env["AI_QUOTA_PRESET_WEEKLY_LIMIT"] = "0";
      expect(
        resolvePresetBudget(reqWith({ preset: "profile_interview" }))!.limit,
      ).toBe(0);
    });

    // Fail-open: advisory-налаштування не має класти запити.
    it("битий JSON → вбудований дефолт, без винятку", () => {
      process.env["AI_QUOTA_PRESET_LIMITS"] = "{not json";
      expect(
        resolvePresetBudget(reqWith({ preset: "profile_interview" }))!.limit,
      ).toBe(10);
    });

    it("невалідне значення в мапі ігнорується", () => {
      process.env["AI_QUOTA_PRESET_LIMITS"] =
        '{"profile_interview":"багато","profile_add_info":-3}';
      expect(
        resolvePresetBudget(reqWith({ preset: "profile_interview" }))!.limit,
      ).toBe(10);
      expect(
        resolvePresetBudget(reqWith({ preset: "profile_add_info" }))!.limit,
      ).toBe(4);
    });
  });
});
