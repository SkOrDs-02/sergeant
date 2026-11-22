import { afterEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";

import {
  founderIdsFromEnv,
  enumBoolFromEnv,
  jsonRecordOfNonNegIntFromEnv,
  optionalIsoInstantFromEnv,
  optionalStrictBoolFromEnv,
  parseIsoInstant,
  strictBoolFromEnv,
  strictFloatFromEnv,
  strictPositiveIntFromEnv,
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

describe("jsonRecordOfNonNegIntFromEnv (ai-pipeline B15)", () => {
  const schema = z.object({ M: jsonRecordOfNonNegIntFromEnv("M") });

  it("приймає відсутнє, порожнє і валідну мапу", () => {
    expect(schema.safeParse({}).success).toBe(true);
    expect(schema.safeParse({ M: "" }).success).toBe(true);
    expect(schema.safeParse({ M: '{"a":0,"b":30}' }).success).toBe(true);
  });

  it.each([
    "{not valid",
    '{"a":30,}',
    "[1,2]",
    "null",
    "30",
    '{"a":"30"}',
    '{"a":-1}',
    '{"a":2.5}',
  ])("відкидає %j", (raw) => {
    const r = schema.safeParse({ M: raw });
    expect(r.success).toBe(false);
    if (!r.success) {
      expect(r.error.issues[0]?.message).toMatch(/^M: .*silently disabled/);
    }
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

  it("AI_QUOTA_TOOL_LIMITS з битим JSON кидає на старті", async () => {
    vi.stubEnv("AI_QUOTA_TOOL_LIMITS", '{"create_debt":10,}');
    vi.resetModules();
    await expect(import("./env.js")).rejects.toThrow(/AI_QUOTA_TOOL_LIMITS/);
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

describe("optionalIsoInstantFromEnv (sec-46: EMAIL_VERIFICATION_REQUIRED_FROM)", () => {
  const schema = z.object({ AT: optionalIsoInstantFromEnv("AT") });

  it.each([undefined, "", "  "])("%j означає «не задано»", (raw) => {
    expect(schema.parse({ AT: raw }).AT).toBeUndefined();
  });

  it("дата без часу — північ за UTC", () => {
    expect(schema.parse({ AT: "2026-11-21" }).AT?.toISOString()).toBe(
      "2026-11-21T00:00:00.000Z",
    );
  });

  it("datetime із зоною зводиться до UTC", () => {
    expect(
      schema.parse({ AT: "2026-11-21T10:00:00+02:00" }).AT?.toISOString(),
    ).toBe("2026-11-21T08:00:00.000Z");
  });

  it.each([
    "2026-02-30",
    "2026-13-01",
    "2026-11-21T10:00:00",
    "21.11.2026",
    "tomorrow",
    "2026-11-21T25:00Z",
    "1732147200",
  ])("відкидає %j, а не вмикає гейт тихо", (raw) => {
    expect(schema.safeParse({ AT: raw }).success).toBe(false);
    expect(parseIsoInstant(raw)).toBeNull();
  });
});

describe("strictPositiveIntFromEnv (rel-34)", () => {
  const schema = z.object({ N: strictPositiveIntFromEnv("N", 50) });

  it("відсутнє чи порожнє значення дає дефолт", () => {
    expect(schema.parse({}).N).toBe(50);
    expect(schema.parse({ N: "  " }).N).toBe(50);
  });

  it("приймає ціле ≥ 1 (з крайніми пробілами)", () => {
    expect(schema.parse({ N: "1" }).N).toBe(1);
    expect(schema.parse({ N: " 120 " }).N).toBe(120);
  });

  it.each(["0", "-1", "5O", "1.5", "1e3", "abc", "50 users"])(
    "%j — помилка на старті, а не тихий дефолт",
    (raw) => {
      expect(() => schema.parse({ N: raw })).toThrow(/integer >= 1/);
    },
  );
});

describe("strictFloatFromEnv (ai-pipeline B16)", () => {
  const schema = z.object({ USD: strictFloatFromEnv("USD", 5) });

  it("відсутнє чи порожнє значення дає дефолт", () => {
    expect(schema.parse({}).USD).toBe(5);
    expect(schema.parse({ USD: "" }).USD).toBe(5);
    expect(schema.parse({ USD: "  " }).USD).toBe(5);
  });

  it.each([
    ["0", 0],
    ["3", 3],
    ["2.5", 2.5],
    [" 7.25 ", 7.25],
    [".5", 0.5],
  ])("приймає %j", (raw, expected) => {
    expect(schema.parse({ USD: raw }).USD).toBe(expected);
  });

  it.each(["yes", "5$", "-1", "1e3", "0x10", "5,5", "Infinity", "NaN"])(
    "%j — помилка на старті, а не тихий дефолт чи часткове число",
    (raw) => {
      expect(() => schema.parse({ USD: raw })).toThrow(/decimal number >= 0/);
    },
  );
});
