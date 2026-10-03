// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  PROFILE_KEY,
  CATEGORY_META,
  normalizeMemoryCategory,
  normalizeMemoryEntry,
  readMemoryEntries,
  writeMemoryEntries,
  groupMemoryEntries,
  memoryStorageSize,
  upsertMemoryFact,
  removeMemoryEntry,
  makeMemoryId,
  buildMemoryImportPreview,
  isKnownMemoryCategory,
  toWritableMemoryCategory,
  subscribeMemoryEntries,
} from "./memoryBank";
import type { MemoryEntry } from "./types";

beforeEach(() => localStorage.clear());

describe("normalizeMemoryCategory", () => {
  it("defaults to other and lowercases/trims", () => {
    expect(normalizeMemoryCategory()).toBe("other");
    expect(normalizeMemoryCategory("  GOAL ")).toBe("goal");
    expect(normalizeMemoryCategory("")).toBe("other");
  });
});

describe("normalizeMemoryEntry", () => {
  it("returns null for non-objects and missing/empty fact", () => {
    expect(normalizeMemoryEntry(null)).toBeNull();
    expect(normalizeMemoryEntry("str")).toBeNull();
    expect(normalizeMemoryEntry({})).toBeNull();
    expect(normalizeMemoryEntry({ fact: "  " })).toBeNull();
  });

  it("normalizes a valid entry, generating id/createdAt when absent", () => {
    const e = normalizeMemoryEntry({ fact: " Любить каву ", category: "DIET" });
    expect(e).not.toBeNull();
    expect(e!.fact).toBe("Любить каву");
    expect(e!.category).toBe("diet");
    expect(typeof e!.id).toBe("string");
    expect(typeof e!.createdAt).toBe("string");
  });

  it("preserves provided id/createdAt and defaults category to other", () => {
    const e = normalizeMemoryEntry({
      fact: "x",
      id: " keep ",
      createdAt: "2024-01-01T00:00:00Z",
    });
    expect(e!.id).toBe("keep");
    expect(e!.createdAt).toBe("2024-01-01T00:00:00Z");
    expect(e!.category).toBe("other");
  });
});

describe("readMemoryEntries / writeMemoryEntries", () => {
  it("round-trips entries via localStorage", () => {
    const entries: MemoryEntry[] = [
      {
        id: "m1",
        fact: "Біжить вранці",
        category: "training",
        createdAt: "2024-01-01",
      },
    ];
    writeMemoryEntries(entries);
    const read = readMemoryEntries();
    expect(read).toHaveLength(1);
    expect(read[0]!.fact).toBe("Біжить вранці");
  });

  it("returns empty array when storage holds a non-array", () => {
    localStorage.setItem(PROFILE_KEY, JSON.stringify({ not: "array" }));
    expect(readMemoryEntries()).toEqual([]);
  });

  it("filters out invalid entries on read", () => {
    localStorage.setItem(
      PROFILE_KEY,
      JSON.stringify([{ fact: "ok" }, { nope: 1 }, "bad"]),
    );
    expect(readMemoryEntries()).toHaveLength(1);
  });
});

describe("groupMemoryEntries", () => {
  it("groups by normalized category", () => {
    const grouped = groupMemoryEntries([
      { id: "1", fact: "a", category: "Diet", createdAt: "x" },
      { id: "2", fact: "b", category: "diet", createdAt: "x" },
      { id: "3", fact: "c", category: "goal", createdAt: "x" },
    ]);
    expect(grouped["diet"]).toHaveLength(2);
    expect(grouped["goal"]).toHaveLength(1);
  });
});

describe("memoryStorageSize", () => {
  it("returns 0 B for empty", () => {
    expect(memoryStorageSize([])).toBe("0 B");
  });
  it("returns byte size for small payloads", () => {
    const out = memoryStorageSize([
      { id: "1", fact: "a", category: "other", createdAt: "x" },
    ]);
    expect(out.endsWith("B")).toBe(true);
  });
  it("returns KB for large payloads", () => {
    const entries: MemoryEntry[] = Array.from({ length: 50 }, (_, i) => ({
      id: `id${i}`,
      fact: "a".repeat(40),
      category: "other",
      createdAt: "2024-01-01T00:00:00Z",
    }));
    expect(memoryStorageSize(entries)).toContain("KB");
  });
});

describe("upsertMemoryFact", () => {
  it("throws on empty fact", () => {
    expect(() => upsertMemoryFact([], "  ")).toThrow("Потрібен факт");
  });

  it("creates a new entry at the front", () => {
    const { entries, entry, created } = upsertMemoryFact(
      [],
      "Нова ціль",
      "goal",
    );
    expect(created).toBe(true);
    expect(entries[0]).toBe(entry);
    expect(entry.category).toBe("goal");
  });

  it("updates an existing entry (case-insensitive fact match)", () => {
    const existing: MemoryEntry[] = [
      { id: "m1", fact: "Любить каву", category: "other", createdAt: "x" },
    ];
    const { entries, created } = upsertMemoryFact(
      existing,
      "любить каву",
      "preference",
    );
    expect(created).toBe(false);
    expect(entries).toHaveLength(1);
    expect(entries[0]!.category).toBe("preference");
  });

  it("зводить невідому категорію в other на запису", () => {
    const { entry } = upsertMemoryFact([], "Біжить марафон", "спорт");
    expect(entry.category).toBe("other");
  });

  it("зберігає всі канонічні категорії як є", () => {
    for (const category of Object.keys(CATEGORY_META)) {
      const { entry } = upsertMemoryFact([], `факт ${category}`, category);
      expect(entry.category).toBe(category);
    }
  });
});

describe("isKnownMemoryCategory", () => {
  it("канонічний набір = ключі CATEGORY_META", () => {
    for (const category of Object.keys(CATEGORY_META)) {
      expect(isKnownMemoryCategory(category)).toBe(true);
    }
    expect(isKnownMemoryCategory("спорт")).toBe(false);
    // Захист від прототипних ключів: `"toString" in CATEGORY_META` було б true.
    expect(isKnownMemoryCategory("toString")).toBe(false);
  });
});

describe("toWritableMemoryCategory", () => {
  it("нормалізує регістр і пробіли перед звіркою з канонічним набором", () => {
    expect(toWritableMemoryCategory("  DIET ")).toBe("diet");
  });

  it("порожнє / відсутнє значення → other", () => {
    expect(toWritableMemoryCategory()).toBe("other");
    expect(toWritableMemoryCategory("   ")).toBe("other");
  });

  // Читання лишається толерантним: легасі-записи з доенумної доби
  // (`category` була optional) не переписуємо під користувачем.
  it("не чіпає легасі-категорію на читанні", () => {
    const entry = normalizeMemoryEntry({ fact: "a", category: "спорт" });
    expect(entry!.category).toBe("спорт");
  });
});

describe("removeMemoryEntry", () => {
  it("removes by id", () => {
    const entries: MemoryEntry[] = [
      { id: "m1", fact: "a", category: "other", createdAt: "x" },
      { id: "m2", fact: "b", category: "other", createdAt: "x" },
    ];
    const { entries: next, removed } = removeMemoryEntry(entries, " m1 ");
    expect(removed!.id).toBe("m1");
    expect(next).toHaveLength(1);
  });

  it("returns unchanged list + null when id not found", () => {
    const entries: MemoryEntry[] = [
      { id: "m1", fact: "a", category: "other", createdAt: "x" },
    ];
    const { entries: next, removed } = removeMemoryEntry(entries, "nope");
    expect(removed).toBeNull();
    expect(next).toBe(entries);
  });
});

describe("buildMemoryImportPreview", () => {
  it("counts valid, invalid, duplicate and new JSON entries without overwriting", () => {
    const existing: MemoryEntry[] = [
      {
        id: "m1",
        fact: "Любить каву",
        category: "preference",
        createdAt: "x",
      },
    ];

    const preview = buildMemoryImportPreview(existing, [
      { id: "m1", fact: "Інший текст", category: "other" },
      { id: "m2", fact: "любить каву", category: "other" },
      { id: "m3", fact: "Хоче бігати", category: "goal" },
      { id: "m4", fact: "Хоче бігати", category: "goal" },
      { nope: true },
    ]);

    expect(preview.validCount).toBe(4);
    expect(preview.invalidCount).toBe(1);
    expect(preview.duplicateCount).toBe(3);
    expect(preview.newEntries).toHaveLength(1);
    expect(preview.newEntries[0]?.fact).toBe("Хоче бігати");
  });
});

describe("makeMemoryId", () => {
  it("produces unique non-empty ids", () => {
    expect(makeMemoryId()).not.toBe(makeMemoryId());
    expect(makeMemoryId().length).toBeGreaterThan(0);
  });
});

describe("CATEGORY_META", () => {
  it("has labels for known categories", () => {
    expect(CATEGORY_META["goal"]?.label).toBe("Цілі");
    // 2026-08-03: `emoji` → `icon` з іменем із атласу дизайн-системи.
    expect(CATEGORY_META["other"]?.icon).toBe("pen");
  });
});

/**
 * Банк пишуть дві незалежні поверхні: екран «Памʼять ШІ» і виконавці
 * чат-інструментів (`remember` / `forget`). Чат відкривається оверлеєм
 * ПОВЕРХ екрана, тож екран не перемонтовується — без нотифікації його
 * `useState`-знімок лишався таким, яким був до розмови. `window.storage`
 * тут не рятує: у вкладці, яка сама зробила запис, він не спрацьовує.
 */
describe("subscribeMemoryEntries", () => {
  it("сповіщає підписників після успішного запису", () => {
    const seen: MemoryEntry[][] = [];
    const off = subscribeMemoryEntries((entries) => seen.push(entries));

    const next = upsertMemoryFact([], "Не любить чорнослив", "preference");
    writeMemoryEntries(next.entries);

    expect(seen).toHaveLength(1);
    expect(seen[0]?.[0]?.fact).toBe("Не любить чорнослив");
    off();
  });

  it("відписка справді відписує", () => {
    const fn = vi.fn();
    subscribeMemoryEntries(fn)();
    writeMemoryEntries([]);
    expect(fn).not.toHaveBeenCalled();
  });

  it("виняток в одному підписнику не глушить решту й не ховає запис", () => {
    const ok = vi.fn();
    const offBad = subscribeMemoryEntries(() => {
      throw new Error("підписник упав");
    });
    const offOk = subscribeMemoryEntries(ok);

    expect(() => writeMemoryEntries([])).not.toThrow();
    expect(ok).toHaveBeenCalledTimes(1);
    offBad();
    offOk();
  });
});
