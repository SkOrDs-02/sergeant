import { afterEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";

import {
  founderIdsFromEnv,
  enumBoolFromEnv,
  optionalStrictBoolFromEnv,
  strictBoolFromEnv,
} from "./envHelpers.js";

describe("strictBoolFromEnv (B15)", () => {
  const schema = z.object({ F: strictBoolFromEnv("F", false) });

  it.each([
    ["true", true],
    ["1", true],
    [" TRUE ", true],
    ["false", false],
    ["0", false],
  ])("приймає %j", (raw, expected) => {
    expect(schema.parse({ F: raw }).F).toBe(expected);
  });

  it("порожнє/відсутнє → дефолт", () => {
    expect(schema.parse({}).F).toBe(false);
    expect(schema.parse({ F: "" }).F).toBe(false);
    expect(z.object({ F: strictBoolFromEnv("F", true) }).parse({}).F).toBe(
      true,
    );
  });

  it.each(["yes", "on", "enabled", "tru"])("відкидає %j", (raw) => {
    const r = schema.safeParse({ F: raw });
    expect(r.success).toBe(false);
    if (!r.success) {
      expect(r.error.issues[0]?.message).toMatch(/refusing to guess/);
    }
  });
});

describe("founderIdsFromEnv (B16)", () => {
  const schema = z.object({ IDS: founderIdsFromEnv("IDS") });

  it("приймає відсутнє, порожнє, список з пробілами навколо і кінцевою комою", () => {
    expect(schema.safeParse({}).success).toBe(true);
    expect(schema.safeParse({ IDS: "" }).success).toBe(true);
    expect(schema.safeParse({ IDS: "abc123, def456 ," }).success).toBe(true);
  });

  it("відкидає запис із пробілом усередині (пропущена кома)", () => {
    expect(schema.safeParse({ IDS: "abc123 def456" }).success).toBe(false);
  });
});

describe("env.ts — startup fail-loud", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it("ANTHROPIC_BUDGET_HARD_DEGRADE_ALL=yes кидає на старті", async () => {
    vi.stubEnv("ANTHROPIC_BUDGET_HARD_DEGRADE_ALL", "yes");
    vi.resetModules();
    await expect(import("./env.js")).rejects.toThrow(
      /ANTHROPIC_BUDGET_HARD_DEGRADE_ALL must be one of/,
    );
  });

  it("ANTHROPIC_BUDGET_ALERT_ENABLED=on кидає на старті", async () => {
    vi.stubEnv("ANTHROPIC_BUDGET_ALERT_ENABLED", "on");
    vi.resetModules();
    await expect(import("./env.js")).rejects.toThrow(
      /ANTHROPIC_BUDGET_ALERT_ENABLED must be one of/,
    );
  });

  it("AI_QUOTA_FOUNDER_IDS з пробілом усередині кидає на старті", async () => {
    vi.stubEnv("AI_QUOTA_FOUNDER_IDS", "abc def");
    vi.resetModules();
    await expect(import("./env.js")).rejects.toThrow(/AI_QUOTA_FOUNDER_IDS/);
  });

  it("=true і коректні id проходять", async () => {
    vi.stubEnv("ANTHROPIC_BUDGET_HARD_DEGRADE_ALL", "true");
    vi.stubEnv("AI_QUOTA_FOUNDER_IDS", "abc123,def456");
    vi.resetModules();
    const { env } = await import("./env.js");
    expect(env.ANTHROPIC_BUDGET_HARD_DEGRADE_ALL).toBe(true);
  });
});

describe("optionalStrictBoolFromEnv (sec-08)", () => {
  const schema = z.object({ FLAG: optionalStrictBoolFromEnv() });

  it("не задано або порожньо → undefined (рішення за викликачем)", () => {
    expect(schema.parse({}).FLAG).toBeUndefined();
    expect(schema.parse({ FLAG: "" }).FLAG).toBeUndefined();
  });

  it("true/1 → true, false/0 → false", () => {
    expect(schema.parse({ FLAG: "true" }).FLAG).toBe(true);
    expect(schema.parse({ FLAG: "1" }).FLAG).toBe(true);
    expect(schema.parse({ FLAG: "false" }).FLAG).toBe(false);
    expect(schema.parse({ FLAG: "0" }).FLAG).toBe(false);
  });

  it("будь-яке інше значення валить парсинг, а не вмикає прапорець", () => {
    expect(() => schema.parse({ FLAG: "yes" })).toThrow();
    expect(() => schema.parse({ FLAG: "TRUE" })).toThrow();
  });
});

describe("enumBoolFromEnv", () => {
  const schema = z.object({ FLAG: enumBoolFromEnv() });

  it.each([
    ["true", true],
    ["1", true],
    ["false", false],
    ["0", false],
    ["", false],
  ])("приймає %j", (raw, expected) => {
    expect(schema.parse({ FLAG: raw }).FLAG).toBe(expected);
  });

  it("не задано → false", () => {
    expect(schema.parse({}).FLAG).toBe(false);
  });

  it.each(["yes", "TRUE", " true"])("відкидає %j", (raw) => {
    expect(schema.safeParse({ FLAG: raw }).success).toBe(false);
  });
});
