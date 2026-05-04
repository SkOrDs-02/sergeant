// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { loadDigest, hasLiveWeeklyDigest } from "./weeklyDigestStorage";

beforeEach(() => {
  localStorage.clear();
});

describe("loadDigest", () => {
  it("повертає null коли ключ відсутній", () => {
    expect(loadDigest("2025-W24")).toBeNull();
  });

  it("повертає null для невалідного JSON", () => {
    localStorage.setItem("weekly_digest_2025-W24", "broken{json");
    expect(loadDigest("2025-W24")).toBeNull();
  });
});

describe("hasLiveWeeklyDigest", () => {
  it("повертає false коли дайджестів немає", () => {
    expect(hasLiveWeeklyDigest(new Date("2025-06-15"))).toBe(false);
  });
});

// `safeReadStringLS` — це новий адаптер замість inline try/catch (Item 6
// round 9). Перевіряємо, що Safari Private Mode / quota / disabled-storage
// випадки не пробивають через `loadDigest` як throw.
describe("storage adapter resilience (Item 6 round 9)", () => {
  const original = Object.getOwnPropertyDescriptor(
    Storage.prototype,
    "getItem",
  );

  afterEach(() => {
    if (original) {
      Object.defineProperty(Storage.prototype, "getItem", original);
    }
  });

  it("повертає null коли localStorage.getItem кидає (Safari Private Mode)", () => {
    Object.defineProperty(Storage.prototype, "getItem", {
      configurable: true,
      value: vi.fn(() => {
        throw new DOMException("SecurityError");
      }),
    });

    expect(() => loadDigest("2025-W24")).not.toThrow();
    expect(loadDigest("2025-W24")).toBeNull();
  });

  it("hasLiveWeeklyDigest не кидає коли storage недоступний", () => {
    Object.defineProperty(Storage.prototype, "getItem", {
      configurable: true,
      value: vi.fn(() => {
        throw new Error("disabled");
      }),
    });

    expect(() => hasLiveWeeklyDigest(new Date("2025-06-15"))).not.toThrow();
    expect(hasLiveWeeklyDigest(new Date("2025-06-15"))).toBe(false);
  });
});
