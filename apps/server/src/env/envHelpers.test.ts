import { afterEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";

import { founderIdsFromEnv, strictBoolFromEnv } from "./envHelpers.js";

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
