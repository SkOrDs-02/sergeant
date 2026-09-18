import { describe, expect, it } from "vitest";

import { STORAGE_KEYS } from "./storageKeys";
import {
  FRESH_DIGEST_AGE_MS,
  digestStorageKey,
  getWeekKey,
  hasLiveWeeklyDigest,
  loadDigest,
  type StorageReader,
} from "./weeklyDigest";

/**
 * Minimal in-memory `StorageReader` used by every test — mirrors the
 * shape callers pass on web (`localStorage`) and mobile (MMKV shim).
 */
class MemoryStore implements StorageReader {
  private store = new Map<string, string>();

  set(key: string, value: string): void {
    this.store.set(key, value);
  }

  getItem(key: string): string | null {
    return this.store.has(key) ? (this.store.get(key) as string) : null;
  }
}

function seedDigest(
  store: MemoryStore,
  weekKey: string,
  payload: unknown,
): void {
  store.set(digestStorageKey(weekKey), JSON.stringify(payload));
}

describe("getWeekKey", () => {
  it("returns Monday's YYYY-MM-DD for a mid-week date", () => {
    // 2026-04-22 is a Wednesday → expect Monday 2026-04-20
    expect(getWeekKey(new Date("2026-04-22T10:00:00"))).toBe("2026-04-20");
  });

  it("returns the date itself when input is a Monday", () => {
    expect(getWeekKey(new Date("2026-04-20T10:00:00"))).toBe("2026-04-20");
  });

  it("rolls Sunday back to the preceding Monday", () => {
    // 2026-04-26 is a Sunday → expect Monday 2026-04-20
    expect(getWeekKey(new Date("2026-04-26T22:00:00"))).toBe("2026-04-20");
  });
});

describe("digestStorageKey", () => {
  it("prefixes with the shared WEEKLY_DIGEST_PREFIX constant", () => {
    expect(digestStorageKey("2026-04-20")).toBe(
      `${STORAGE_KEYS.WEEKLY_DIGEST_PREFIX}2026-04-20`,
    );
  });
});

describe("loadDigest", () => {
  it("returns null when storage has no entry", () => {
    const store = new MemoryStore();
    expect(loadDigest("2026-04-20", store)).toBeNull();
  });

  it("returns the parsed object when the entry is a valid JSON object", () => {
    const store = new MemoryStore();
    seedDigest(store, "2026-04-20", { generatedAt: 123, finyk: { x: 1 } });
    const res = loadDigest("2026-04-20", store);
    expect(res).toEqual({ generatedAt: 123, finyk: { x: 1 } });
  });

  it("returns null for malformed JSON", () => {
    const store = new MemoryStore();
    store.set(digestStorageKey("2026-04-20"), "{not json");
    expect(loadDigest("2026-04-20", store)).toBeNull();
  });

  it("returns null for non-object JSON (arrays / primitives / null)", () => {
    const store = new MemoryStore();
    store.set(digestStorageKey("a"), "[1,2]");
    store.set(digestStorageKey("b"), "42");
    store.set(digestStorageKey("c"), "null");
    expect(loadDigest("a", store)).toBeNull();
    expect(loadDigest("b", store)).toBeNull();
    expect(loadDigest("c", store)).toBeNull();
  });

  it("swallows storage errors and returns null", () => {
    const throwing: StorageReader = {
      getItem: () => {
        throw new Error("boom");
      },
    };
    expect(loadDigest("2026-04-20", throwing)).toBeNull();
  });
});

describe("hasLiveWeeklyDigest", () => {
  it("is true on Monday regardless of digest state", () => {
    // 2026-04-20 is a Monday
    const store = new MemoryStore();
    expect(hasLiveWeeklyDigest(store, new Date("2026-04-20T10:00:00"))).toBe(
      true,
    );
  });

  it("is true when a digest exists for the current week", () => {
    const store = new MemoryStore();
    const wed = new Date("2026-04-22T10:00:00");
    seedDigest(store, getWeekKey(wed), { generatedAt: Date.now() });
    expect(hasLiveWeeklyDigest(store, wed)).toBe(true);
  });

  it("is true when last week's digest was generated within 48h", () => {
    const store = new MemoryStore();
    const wed = new Date("2026-04-22T10:00:00");
    const prev = new Date(wed);
    prev.setDate(wed.getDate() - 7);
    const freshAt = wed.getTime() - 12 * 60 * 60 * 1000; // 12h ago
    seedDigest(store, getWeekKey(prev), {
      generatedAt: new Date(freshAt).toISOString(),
    });
    expect(hasLiveWeeklyDigest(store, wed)).toBe(true);
  });

  it("is false mid-week with no current digest and a stale previous one", () => {
    const store = new MemoryStore();
    const fri = new Date("2026-04-24T10:00:00");
    const prev = new Date(fri);
    prev.setDate(fri.getDate() - 7);
    const staleAt = fri.getTime() - 5 * 24 * 60 * 60 * 1000; // 5d ago
    seedDigest(store, getWeekKey(prev), {
      generatedAt: new Date(staleAt).toISOString(),
    });
    expect(hasLiveWeeklyDigest(store, fri)).toBe(false);
  });

  it("is false with no digests at all on a non-Monday", () => {
    const store = new MemoryStore();
    expect(hasLiveWeeklyDigest(store, new Date("2026-04-24T10:00:00"))).toBe(
      false,
    );
  });

  it("ignores previous-week digest with missing/invalid generatedAt", () => {
    const store = new MemoryStore();
    const fri = new Date("2026-04-24T10:00:00");
    const prev = new Date(fri);
    prev.setDate(fri.getDate() - 7);
    seedDigest(store, getWeekKey(prev), { generatedAt: "not-a-date" });
    expect(hasLiveWeeklyDigest(store, fri)).toBe(false);

    seedDigest(store, getWeekKey(prev), { notes: "no generatedAt at all" });
    expect(hasLiveWeeklyDigest(store, fri)).toBe(false);
  });

  it("ignores a previous-week digest generated at a future timestamp", () => {
    const store = new MemoryStore();
    const fri = new Date("2026-04-24T10:00:00");
    const prev = new Date(fri);
    prev.setDate(fri.getDate() - 7);
    seedDigest(store, getWeekKey(prev), {
      generatedAt: new Date(fri.getTime() + 1_000).toISOString(),
    });
    expect(hasLiveWeeklyDigest(store, fri)).toBe(false);
  });
});

describe("FRESH_DIGEST_AGE_MS", () => {
  it("equals 48 hours in milliseconds", () => {
    expect(FRESH_DIGEST_AGE_MS).toBe(48 * 60 * 60 * 1000);
  });
});
