import { afterEach, describe, expect, it } from "vitest";

import { getPlatform, isCapacitor } from "./platform";

const originalCapacitor = Object.getOwnPropertyDescriptor(
  globalThis,
  "Capacitor",
);

function setCapacitor(value: unknown): void {
  Object.defineProperty(globalThis, "Capacitor", {
    configurable: true,
    value,
  });
}

describe("platform detection", () => {
  afterEach(() => {
    if (originalCapacitor) {
      Object.defineProperty(globalThis, "Capacitor", originalCapacitor);
      return;
    }
    Reflect.deleteProperty(globalThis, "Capacitor");
  });

  it("defaults to web when the Capacitor global is absent", () => {
    Reflect.deleteProperty(globalThis, "Capacitor");

    expect(isCapacitor()).toBe(false);
    expect(getPlatform()).toBe("web");
  });

  it("delegates native detection to the injected Capacitor global", () => {
    setCapacitor({
      isNativePlatform: () => true,
      getPlatform: () => "android",
    });

    expect(isCapacitor()).toBe(true);
    expect(getPlatform()).toBe("android");
  });

  it("normalizes unknown Capacitor platforms to web", () => {
    setCapacitor({
      isNativePlatform: () => false,
      getPlatform: () => "electron",
    });

    expect(isCapacitor()).toBe(false);
    expect(getPlatform()).toBe("web");
  });
});
