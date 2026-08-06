/**
 * Tests for `resolveConfiguredProvider` — always resolves "auto" (the
 * `VITE_VOICE_PROVIDER` override is unwired in every environment).
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

  it("resolves 'auto' regardless of the env var value", () => {
    vi.stubEnv("VITE_VOICE_PROVIDER", "nonsense");
    expect(resolveConfiguredProvider()).toBe("auto");
  });
});
