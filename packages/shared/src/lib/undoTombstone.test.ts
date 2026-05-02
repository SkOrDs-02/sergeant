import { describe, it, expect } from "vitest";
import { createMemoryKVStore } from "./kvStore";
import {
  DEFAULT_TOMBSTONE_TTL_MS,
  clearTombstone,
  purgeExpiredTombstones,
  readTombstone,
  writeTombstone,
} from "./undoTombstone";

const BUCKET = "test_bucket_v1";

describe("undoTombstone", () => {
  it("writes and reads a tombstone within the TTL window", () => {
    const store = createMemoryKVStore();
    const now = new Date("2026-01-01T12:00:00Z");
    writeTombstone(
      store,
      BUCKET,
      { id: "abc", data: { name: "Habit X" } },
      now,
    );
    const fresh = new Date(now.getTime() + 1000);
    const t = readTombstone<{ name: string }>(store, BUCKET, "abc", fresh);
    expect(t?.data.name).toBe("Habit X");
  });

  it("treats expired tombstones as missing", () => {
    const store = createMemoryKVStore();
    const now = new Date("2026-01-01T12:00:00Z");
    writeTombstone(store, BUCKET, { id: "abc", data: 1, ttlMs: 100 }, now);
    const later = new Date(now.getTime() + 200);
    expect(readTombstone(store, BUCKET, "abc", later)).toBeNull();
  });

  it("clearTombstone removes a single entry without affecting others", () => {
    const store = createMemoryKVStore();
    writeTombstone(store, BUCKET, { id: "a", data: 1 });
    writeTombstone(store, BUCKET, { id: "b", data: 2 });
    clearTombstone(store, BUCKET, "a");
    expect(readTombstone(store, BUCKET, "a")).toBeNull();
    expect(readTombstone(store, BUCKET, "b")).not.toBeNull();
  });

  it("purgeExpiredTombstones drops only expired entries", () => {
    const store = createMemoryKVStore();
    const now = new Date("2026-01-01T12:00:00Z");
    writeTombstone(store, BUCKET, { id: "old", data: 1, ttlMs: 100 }, now);
    writeTombstone(store, BUCKET, { id: "fresh", data: 2, ttlMs: 60_000 }, now);
    const later = new Date(now.getTime() + 1000);
    purgeExpiredTombstones(store, BUCKET, later);
    expect(readTombstone(store, BUCKET, "old", later)).toBeNull();
    expect(readTombstone(store, BUCKET, "fresh", later)).not.toBeNull();
  });

  it("DEFAULT_TOMBSTONE_TTL_MS exceeds the 5 s undo toast window", () => {
    expect(DEFAULT_TOMBSTONE_TTL_MS).toBeGreaterThan(5_000);
  });
});
