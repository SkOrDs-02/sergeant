import { afterEach, describe, expect, it, vi } from "vitest";

// ai-pipeline B16: стелі бюджету й захисні прапорці не мають мовчки падати на
// дефолт. Перевіряємо на рівні boot-у `env.ts`, бо саме там spread-иться shape:
// якщо поле повернуть на `floatFromEnv`/`boolFromEnv`, тест почервоніє.
async function loadEnv() {
  vi.resetModules();
  return (await import("./env.js")).env;
}

describe("env: стелі бюджету й захисні прапорці (B16)", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it.each([
    "ANTHROPIC_BUDGET_SOFT_USD",
    "ANTHROPIC_BUDGET_HARD_USD",
    "ANTHROPIC_MONTHLY_BUDGET_USD",
    "VOYAGE_MONTHLY_BUDGET_USD",
    "VOYAGE_DAILY_BUDGET_USD",
    "VOYAGE_DAILY_BUDGET_USD_SOFT",
    "VOYAGE_DAILY_BUDGET_USD_HARD",
  ])("%s=5$ валить старт", async (name) => {
    vi.stubEnv(name, "5$");
    await expect(loadEnv()).rejects.toThrow(new RegExp(name));
  });

  it("валідна стеля парситься як число", async () => {
    vi.stubEnv("ANTHROPIC_BUDGET_HARD_USD", "12.5");
    expect((await loadEnv()).ANTHROPIC_BUDGET_HARD_USD).toBe(12.5);
  });

  it.each(["WEBHOOK_HMAC_REQUIRED", "AI_TIERED_PRO_ENABLED"])(
    "%s=yes валить старт, а не дає дефолт",
    async (name) => {
      vi.stubEnv(name, "yes");
      await expect(loadEnv()).rejects.toThrow(new RegExp(name));
    },
  );

  it("WEBHOOK_HMAC_REQUIRED=false лишається свідомим opt-out", async () => {
    vi.stubEnv("WEBHOOK_HMAC_REQUIRED", "false");
    expect((await loadEnv()).WEBHOOK_HMAC_REQUIRED).toBe(false);
  });
});
