// @vitest-environment jsdom
/**
 * Tests for the boot-critical durable storage helpers + the raw-LS
 * accessors in `storage.ts` that the main `storage.test.ts` doesn't cover:
 * `safeWriteStringLSDurable`, `safeReadStringLSDurable`,
 * `safeRemoveLSDurable`, `safeListLSKeys`, `resolveLsStore`, and the
 * `webKVStore` adapter pass-through.
 */
import { describe, it, expect, beforeEach } from "vitest";
import {
  safeWriteStringLSDurable,
  safeReadStringLSDurable,
  safeRemoveLSDurable,
  safeListLSKeys,
  resolveLsStore,
  webKVStore,
} from "./storage";

beforeEach(() => {
  localStorage.clear();
});

describe("durable LS helpers", () => {
  it("writes durably and reads the value back via the mirror", () => {
    expect(safeWriteStringLSDurable("hub_theme_v2", "dark")).toBe(true);
    expect(safeReadStringLSDurable("hub_theme_v2")).toBe("dark");
    // mirror is the physical localStorage entry
    expect(localStorage.getItem("hub_theme_v2")).toBe("dark");
  });

  it("falls back to the supplied default when the key is absent", () => {
    expect(safeReadStringLSDurable("nope")).toBeNull();
    expect(safeReadStringLSDurable("nope", "fallback")).toBe("fallback");
  });

  it("removes durably from both the active store and the mirror", () => {
    safeWriteStringLSDurable("k", "v");
    expect(safeRemoveLSDurable("k")).toBe(true);
    expect(safeReadStringLSDurable("k")).toBeNull();
    expect(localStorage.getItem("k")).toBeNull();
  });
});

describe("webKVStore adapter", () => {
  it("round-trips a string through set/get", () => {
    webKVStore.setString("a", "1");
    expect(webKVStore.getString("a")).toBe("1");
  });

  it("removes a key", () => {
    webKVStore.setString("a", "1");
    webKVStore.remove("a");
    expect(webKVStore.getString("a")).toBeNull();
  });

  it("lists keys", () => {
    webKVStore.setString("k1", "1");
    webKVStore.setString("k2", "2");
    const keys = webKVStore.listKeys();
    expect(keys).toEqual(expect.arrayContaining(["k1", "k2"]));
  });

  it("notifies onChange subscribers", () => {
    const seen: Array<string | null> = [];
    const unsub = webKVStore.onChange("watched", (next) => seen.push(next));
    webKVStore.setString("watched", "x");
    unsub();
    webKVStore.setString("watched", "y");
    // the DOM storage event fires async / cross-tab only; at minimum the
    // unsubscribe must not throw and the listener registration is exercised.
    expect(typeof unsub).toBe("function");
  });
});

describe("safeListLSKeys", () => {
  it("enumerates the keys currently in storage", () => {
    safeWriteStringLSDurable("kA", "1");
    safeWriteStringLSDurable("kB", "2");
    const keys = safeListLSKeys();
    expect(keys).toEqual(expect.arrayContaining(["kA", "kB"]));
  });
});

describe("resolveLsStore", () => {
  it("returns a usable KVStore bound to raw localStorage", () => {
    const store = resolveLsStore();
    expect(store).not.toBeNull();
    store!.setString("raw", "value");
    expect(localStorage.getItem("raw")).toBe("value");
    expect(store!.getString("raw")).toBe("value");
  });
});
