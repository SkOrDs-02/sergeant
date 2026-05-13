import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// PR-21 — env-parsing для нового operator-toggle `MONO_AI_MEMORY_DIGEST_ENABLED`.
// Server-side digest-hook поки відсутній (workflow живе у n8n), але змінна
// парситься у env-схемі для парності з `MONO_AI_MEMORY_INGEST_ENABLED` (PR-19)
// і майбутніх metrics. Тест перевіряє:
//   1. Default `false`, коли env не виставлений.
//   2. Explicit `"true"` / `"1"` → `true`.
//   3. Explicit `"false"` / `"0"` → `false`.
//   4. Junk string → fallback на default (`false`).
describe("env: MONO_AI_MEMORY_DIGEST_ENABLED (PR-21)", () => {
  const ORIGINAL = process.env["MONO_AI_MEMORY_DIGEST_ENABLED"];

  beforeEach(() => {
    vi.resetModules();
    delete process.env["MONO_AI_MEMORY_DIGEST_ENABLED"];
  });

  afterEach(() => {
    if (ORIGINAL === undefined) {
      delete process.env["MONO_AI_MEMORY_DIGEST_ENABLED"];
    } else {
      process.env["MONO_AI_MEMORY_DIGEST_ENABLED"] = ORIGINAL;
    }
    vi.resetModules();
  });

  it("default `false` коли env не виставлений", async () => {
    const { env } = await import("./env");
    expect(env.MONO_AI_MEMORY_DIGEST_ENABLED).toBe(false);
  });

  it("'true' → true", async () => {
    process.env["MONO_AI_MEMORY_DIGEST_ENABLED"] = "true";
    const { env } = await import("./env");
    expect(env.MONO_AI_MEMORY_DIGEST_ENABLED).toBe(true);
  });

  it("'1' → true (boolFromEnv semantics)", async () => {
    process.env["MONO_AI_MEMORY_DIGEST_ENABLED"] = "1";
    const { env } = await import("./env");
    expect(env.MONO_AI_MEMORY_DIGEST_ENABLED).toBe(true);
  });

  it("'false' → false (НЕ truthy-string coercion)", async () => {
    process.env["MONO_AI_MEMORY_DIGEST_ENABLED"] = "false";
    const { env } = await import("./env");
    expect(env.MONO_AI_MEMORY_DIGEST_ENABLED).toBe(false);
  });

  it("'0' → false", async () => {
    process.env["MONO_AI_MEMORY_DIGEST_ENABLED"] = "0";
    const { env } = await import("./env");
    expect(env.MONO_AI_MEMORY_DIGEST_ENABLED).toBe(false);
  });

  it("junk string → fallback на default `false`", async () => {
    process.env["MONO_AI_MEMORY_DIGEST_ENABLED"] = "maybe";
    const { env } = await import("./env");
    expect(env.MONO_AI_MEMORY_DIGEST_ENABLED).toBe(false);
  });
});
