/**
 * Tests for `resolveConfiguredProvider` — reads `VITE_VOICE_PROVIDER`
 * and normalises it to a known provider, defaulting to "auto".
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import { resolveConfiguredProvider } from "./resolveVoiceProvider";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("resolveConfiguredProvider", () => {
  it("defaults to 'auto' when the env var is unset", () => {
    vi.stubEnv("VITE_VOICE_PROVIDER", "");
    expect(resolveConfiguredProvider()).toBe("auto");
  });

  it("returns 'groq' when configured", () => {
    vi.stubEnv("VITE_VOICE_PROVIDER", "groq");
    expect(resolveConfiguredProvider()).toBe("groq");
  });

  it("returns 'webspeech' when configured", () => {
    vi.stubEnv("VITE_VOICE_PROVIDER", "webspeech");
    expect(resolveConfiguredProvider()).toBe("webspeech");
  });

  it("normalises case and whitespace", () => {
    vi.stubEnv("VITE_VOICE_PROVIDER", "  GROQ  ");
    expect(resolveConfiguredProvider()).toBe("groq");
  });

  it("falls back to 'auto' for an unrecognised value", () => {
    vi.stubEnv("VITE_VOICE_PROVIDER", "nonsense");
    expect(resolveConfiguredProvider()).toBe("auto");
  });
});
