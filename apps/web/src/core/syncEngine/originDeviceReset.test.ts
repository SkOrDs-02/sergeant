/**
 * Last validated: 2026-11-19
 * Status: Active
 */
import { describe, expect, it } from "vitest";
import { STORAGE_KEYS } from "@sergeant/shared";
import {
  ORIGIN_DEVICE_RESET_MARKER,
  requestOriginDeviceReset,
  resolveBootOriginDeviceId,
} from "./originDeviceReset";

function memoryStore(initial: Record<string, string> = {}) {
  const map = new Map(Object.entries(initial));
  return {
    map,
    getString: (key: string) => map.get(key) ?? null,
    setString: (key: string, value: string) => {
      map.set(key, value);
    },
    remove: (key: string) => {
      map.delete(key);
    },
  };
}

const KEY = STORAGE_KEYS.SYNC_ORIGIN_DEVICE_ID;

describe("resolveBootOriginDeviceId", () => {
  it("без прохання повертає збережений id", () => {
    const kv = memoryStore({ [KEY]: "dev-old" });
    const ls = memoryStore();
    expect(
      resolveBootOriginDeviceId(kv, { ls, randomUUID: () => "dev-new" }),
    ).toBe("dev-old");
  });

  it("на першому старті мінтить і зберігає id, як раніше", () => {
    const kv = memoryStore();
    expect(
      resolveBootOriginDeviceId(kv, {
        ls: memoryStore(),
        randomUUID: () => "dev-1",
      }),
    ).toBe("dev-1");
    expect(kv.map.get(KEY)).toBe("dev-1");
  });

  it("після прохання видає НОВИЙ id, перезаписує старий і знімає позначку", () => {
    const kv = memoryStore({ [KEY]: "dev-old" });
    const ls = memoryStore();
    requestOriginDeviceReset(ls);
    expect(ls.map.get(ORIGIN_DEVICE_RESET_MARKER)).toBe("1");

    const id = resolveBootOriginDeviceId(kv, {
      ls,
      randomUUID: () => "dev-new",
    });
    expect(id).toBe("dev-new");
    expect(kv.map.get(KEY)).toBe("dev-new");
    expect(ls.map.has(ORIGIN_DEVICE_RESET_MARKER)).toBe(false);

    // Наступний старт без прохання тримає вже новий id.
    expect(
      resolveBootOriginDeviceId(kv, { ls, randomUUID: () => "dev-other" }),
    ).toBe("dev-new");
  });

  it("без сирого LS працює як раніше", () => {
    const kv = memoryStore({ [KEY]: "dev-old" });
    expect(resolveBootOriginDeviceId(kv, { ls: null })).toBe("dev-old");
    expect(() => requestOriginDeviceReset(null)).not.toThrow();
  });
});
