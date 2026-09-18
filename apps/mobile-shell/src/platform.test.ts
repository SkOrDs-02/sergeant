import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Тонка обгортка над `@capacitor/core`.Capacitor — весь тест зводиться до
 * того, щоб `isCapacitor()` чесно проксі-викликав `isNativePlatform()`.
 */

const isNativePlatform = vi.fn<() => boolean>();

vi.mock("@capacitor/core", () => ({
  Capacitor: {
    isNativePlatform: () => isNativePlatform(),
  },
}));

beforeEach(() => {
  vi.resetModules();
  isNativePlatform.mockReset();
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("isCapacitor", () => {
  it("повертає true, коли Capacitor.isNativePlatform() = true", async () => {
    isNativePlatform.mockReturnValue(true);
    const mod = await import("./platform.js");
    expect(mod.isCapacitor()).toBe(true);
    expect(isNativePlatform).toHaveBeenCalledTimes(1);
  });

  it("повертає false, коли Capacitor.isNativePlatform() = false", async () => {
    isNativePlatform.mockReturnValue(false);
    const mod = await import("./platform.js");
    expect(mod.isCapacitor()).toBe(false);
  });
});
