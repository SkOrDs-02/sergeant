import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// HR-2 (dead-code/hard-rules) — env-parsing for `GROQ_TRANSCRIBE_MODEL`.
// The M4 Groq Whisper allowlist now lives entirely at the env
// single-source-of-truth (transcribe.ts reads the validated `env`, no
// `process.env`). This suite owns the semantics that used to live in
// transcribe.test.ts:
//   1. Default `whisper-large-v3-turbo` when env unset.
//   2. Empty-string env treated as unset → default (legacy `|| default`).
//   3. Allowlisted alternative (`whisper-large-v3`) passes through.
//   4. Unknown / experimental model → env parse throws (boot fail-fast).
describe("env: GROQ_TRANSCRIBE_MODEL (M4 allowlist, HR-2)", () => {
  const ORIGINAL = process.env["GROQ_TRANSCRIBE_MODEL"];

  beforeEach(() => {
    vi.resetModules();
    delete process.env["GROQ_TRANSCRIBE_MODEL"];
  });

  afterEach(() => {
    if (ORIGINAL === undefined) {
      delete process.env["GROQ_TRANSCRIBE_MODEL"];
    } else {
      process.env["GROQ_TRANSCRIBE_MODEL"] = ORIGINAL;
    }
    vi.resetModules();
  });

  it("defaults to whisper-large-v3-turbo when env unset", async () => {
    const { env } = await import("./env");
    expect(env.GROQ_TRANSCRIBE_MODEL).toBe("whisper-large-v3-turbo");
  });

  it("treats empty-string env as default", async () => {
    process.env["GROQ_TRANSCRIBE_MODEL"] = "";
    const { env } = await import("./env");
    expect(env.GROQ_TRANSCRIBE_MODEL).toBe("whisper-large-v3-turbo");
  });

  it("accepts the allowlisted alternative model", async () => {
    process.env["GROQ_TRANSCRIBE_MODEL"] = "whisper-large-v3";
    const { env } = await import("./env");
    expect(env.GROQ_TRANSCRIBE_MODEL).toBe("whisper-large-v3");
  });

  it("rejects an unknown / experimental model (boot fail-fast)", async () => {
    process.env["GROQ_TRANSCRIBE_MODEL"] = "whisper-evil-experimental";
    await expect(import("./env")).rejects.toThrow();
  });
});
