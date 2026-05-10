import { describe, it, expect } from "vitest";
import { parsePluginConfig, PluginConfigSchema } from "./config.js";

const VALID_API_KEY = "x".repeat(32);

const minimalRaw = (overrides: Record<string, unknown> = {}) =>
  JSON.stringify({
    serverInternalUrl: "http://localhost:3000",
    internalApiKey: VALID_API_KEY,
    founderUserId: "user_test",
    ...overrides,
  });

describe("parsePluginConfig", () => {
  it("parses minimal valid config and applies defaults", () => {
    const cfg = parsePluginConfig(minimalRaw());
    expect(cfg.serverInternalUrl).toBe("http://localhost:3000");
    expect(cfg.internalApiKey).toBe(VALID_API_KEY);
    expect(cfg.founderUserId).toBe("user_test");
    expect(cfg.maxPerCallUsd).toBe(0.5);
    expect(cfg.councilUsdBudget).toBe(2.0);
    expect(cfg.approvalVariant).toBe("B");
    expect(cfg.approvalCallbackTimeoutMs).toBe(300_000);
    expect(cfg.seo).toEqual({});
  });

  it("coerces numeric strings (env-substituted) for per-call cap", () => {
    const cfg = parsePluginConfig(minimalRaw({ maxPerCallUsd: "0.75" }));
    expect(cfg.maxPerCallUsd).toBe(0.75);
  });

  it("rejects malformed JSON with a descriptive error", () => {
    expect(() => parsePluginConfig("{not-json")).toThrow(/not valid JSON/);
  });

  it("rejects empty internalApiKey (anti-bypass guard)", () => {
    expect(() =>
      parsePluginConfig(minimalRaw({ internalApiKey: "short" })),
    ).toThrow();
  });

  it("rejects non-positive maxPerCallUsd (Locked decision #4 invariant)", () => {
    expect(() =>
      parsePluginConfig(minimalRaw({ maxPerCallUsd: "0" })),
    ).toThrow();
    expect(() =>
      parsePluginConfig(minimalRaw({ maxPerCallUsd: "-1" })),
    ).toThrow();
  });

  it("accepts approvalVariant A / B / C; rejects others", () => {
    for (const variant of ["A", "B", "C"]) {
      const cfg = parsePluginConfig(minimalRaw({ approvalVariant: variant }));
      expect(cfg.approvalVariant).toBe(variant);
    }
    expect(() =>
      parsePluginConfig(minimalRaw({ approvalVariant: "D" })),
    ).toThrow();
  });

  it("populates SEO defaults to empty object", () => {
    const cfg = PluginConfigSchema.parse({
      serverInternalUrl: "http://localhost:3000",
      internalApiKey: VALID_API_KEY,
      founderUserId: "user_test",
    });
    expect(cfg.seo).toEqual({});
  });
});
