// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { KVStore } from "@sergeant/shared";

/**
 * Після reload залогінена людина читає SQLite warm-cache, зібраний з
 * ІНШОЇ партиції (бут стартує на анонімній), тож усе, що вона писала в
 * `kv_store` своєї партиції, на старті невидиме. Тест моделює рівно це:
 * «reload» підміняє активне SQLite-сховище порожнім.
 */
function memoryKv(): KVStore {
  const map = new Map<string, string>();
  return {
    getString: (k) => map.get(k) ?? null,
    setString: (k, v) => void map.set(k, v),
    remove: (k) => void map.delete(k),
    listKeys: () => [...map.keys()],
    onChange: () => () => undefined,
  };
}

let activeKv: KVStore = memoryKv();
vi.mock("../db/kvStoreBoot", () => ({
  getActiveSqliteKvStore: () => activeKv,
  resetKvStoreBoot: () => undefined,
}));

const {
  readMemoryEntries,
  writeMemoryEntries,
  readMemoryBankMeta,
  setMemoryBankOwner,
} = await import("./memoryBank");
const {
  readBiometrics,
  writeBiometrics,
  readBiometricsOwnerId,
  setBiometricsOwner,
} = await import("./biometrics");

function reload() {
  activeKv = memoryKv();
}

describe("profile local durability across reload", () => {
  beforeEach(() => {
    localStorage.clear();
    activeKv = memoryKv();
  });

  it("memory bank facts survive a reload that loses the SQLite warm-cache", () => {
    setMemoryBankOwner("user-1");
    writeMemoryEntries([
      {
        id: "m1",
        fact: "Не їм лактозу",
        category: "allergy",
        createdAt: "2026-09-28T10:00:00.000Z",
      },
    ]);
    reload();
    expect(readMemoryEntries().map((e) => e.fact)).toEqual(["Не їм лактозу"]);
    expect(readMemoryBankMeta().ownerId).toBe("user-1");
    expect(readMemoryBankMeta().updatedAt).not.toBe(new Date(0).toISOString());
  });

  it("biometrics survive a reload that loses the SQLite warm-cache", () => {
    setBiometricsOwner("user-1");
    writeBiometrics({ ...readBiometrics(), heightCm: 181 });
    reload();
    expect(readBiometrics().heightCm).toBe(181);
    expect(readBiometricsOwnerId()).toBe("user-1");
  });
});
