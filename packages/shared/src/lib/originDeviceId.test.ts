import { describe, expect, it } from "vitest";

import { createMemoryKVStore } from "../test-utils";
import {
  ORIGIN_DEVICE_ID_MAX_LENGTH,
  fallbackRandomId,
  normalizeOriginDeviceId,
  resolveOriginDeviceId,
} from "./originDeviceId";
import { STORAGE_KEYS } from "./storageKeys";

describe("normalizeOriginDeviceId", () => {
  it("returns null for null / empty / whitespace-only", () => {
    expect(normalizeOriginDeviceId(null)).toBeNull();
    expect(normalizeOriginDeviceId("")).toBeNull();
    expect(normalizeOriginDeviceId("   ")).toBeNull();
    expect(normalizeOriginDeviceId("\t\n")).toBeNull();
  });

  it("trims whitespace", () => {
    expect(normalizeOriginDeviceId("  device-A  ")).toBe("device-A");
  });

  it("truncates over the 64-char ceiling", () => {
    const long = "x".repeat(ORIGIN_DEVICE_ID_MAX_LENGTH + 12);
    expect(normalizeOriginDeviceId(long)).toHaveLength(
      ORIGIN_DEVICE_ID_MAX_LENGTH,
    );
  });
});

describe("resolveOriginDeviceId", () => {
  it("mints + persists a fresh ID when the store is empty", () => {
    const store = createMemoryKVStore();
    let calls = 0;
    const id = resolveOriginDeviceId({
      store,
      randomUUID: () => {
        calls += 1;
        return "minted-id";
      },
    });
    expect(id).toBe("minted-id");
    expect(store.getString(STORAGE_KEYS.SYNC_ORIGIN_DEVICE_ID)).toBe(
      "minted-id",
    );
    expect(calls).toBe(1);
  });

  it("re-uses the persisted value on subsequent boots (stable across reloads)", () => {
    const store = createMemoryKVStore();
    store.setString(STORAGE_KEYS.SYNC_ORIGIN_DEVICE_ID, "persisted-id");

    let calls = 0;
    const id = resolveOriginDeviceId({
      store,
      randomUUID: () => {
        calls += 1;
        return "should-not-be-called";
      },
    });
    expect(id).toBe("persisted-id");
    expect(calls).toBe(0);
  });

  it("treats whitespace-only persisted values as missing and re-mints", () => {
    const store = createMemoryKVStore();
    store.setString(STORAGE_KEYS.SYNC_ORIGIN_DEVICE_ID, "   ");
    const id = resolveOriginDeviceId({
      store,
      randomUUID: () => "fresh",
    });
    expect(id).toBe("fresh");
    expect(store.getString(STORAGE_KEYS.SYNC_ORIGIN_DEVICE_ID)).toBe("fresh");
  });

  it("clamps the minted value to ≤64 chars at storage time", () => {
    const store = createMemoryKVStore();
    const id = resolveOriginDeviceId({
      store,
      randomUUID: () => "y".repeat(80),
    });
    expect(id).toHaveLength(ORIGIN_DEVICE_ID_MAX_LENGTH);
    expect(store.getString(STORAGE_KEYS.SYNC_ORIGIN_DEVICE_ID)).toHaveLength(
      ORIGIN_DEVICE_ID_MAX_LENGTH,
    );
  });

  it("falls back when randomUUID returns whitespace-only", () => {
    const store = createMemoryKVStore();
    const id = resolveOriginDeviceId({
      store,
      randomUUID: () => "   ",
    });
    expect(id).not.toBe("");
    expect(id.trim()).toBe(id);
    expect(store.getString(STORAGE_KEYS.SYNC_ORIGIN_DEVICE_ID)).toBe(id);
  });
});

describe("fallbackRandomId", () => {
  it("produces a non-empty string each call", () => {
    expect(fallbackRandomId().length).toBeGreaterThan(0);
  });

  it("is unlikely to repeat across rapid calls (best-effort uniqueness)", () => {
    const ids = new Set<string>();
    for (let i = 0; i < 50; i += 1) ids.add(fallbackRandomId());
    expect(ids.size).toBeGreaterThan(40);
  });
});
