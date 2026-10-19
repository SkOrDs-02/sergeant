import { afterEach, describe, expect, it, vi } from "vitest";

// rel-03: SERGEANT_CLIENT_IP_SECRET опційний; задане значення мусить мати ≥32
// символи, порожній рядок = «не задано» (Coolify любить лишати порожні змінні).
async function loadEnv() {
  vi.resetModules();
  return (await import("./env.js")).env;
}

describe("env: SERGEANT_CLIENT_IP_SECRET", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it("не задано -> undefined", async () => {
    vi.stubEnv("SERGEANT_CLIENT_IP_SECRET", "");
    expect((await loadEnv()).SERGEANT_CLIENT_IP_SECRET).toBeUndefined();
  });

  it("32+ символи приймається", async () => {
    vi.stubEnv("SERGEANT_CLIENT_IP_SECRET", "a".repeat(32));
    expect((await loadEnv()).SERGEANT_CLIENT_IP_SECRET).toBe("a".repeat(32));
  });

  it("коротший за 32 символи -> помилка при boot", async () => {
    vi.stubEnv("SERGEANT_CLIENT_IP_SECRET", "short");
    await expect(loadEnv()).rejects.toThrow(/SERGEANT_CLIENT_IP_SECRET/);
  });
});
