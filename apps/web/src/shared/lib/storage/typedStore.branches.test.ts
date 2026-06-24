/**
 * Supplemental branch coverage for `typedStore` — the error / edge paths
 * the main `typedStore.test.ts` doesn't exercise:
 *   - a missing migration step (version bump with no transform → `continue`);
 *   - a migration that throws → `reportError("migrate…")` + default;
 *   - a listener that throws → `reportError("listener")`, other listeners
 *     still run, the write still succeeds;
 *   - a non-serialisable value on `set` → `reportError("write")` + false;
 *   - the SSR / no-localStorage paths for `get`, `set`, and `reset`;
 *   - the envelope with a non-numeric `__v` (treated as version 0);
 *   - `reload` notifying subscribers with the re-read value;
 *   - the default reporter swallowing errors without throwing.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { createTypedStore } from "./typedStore";

function makeLS() {
  const map = new Map<string, string>();
  return {
    getItem: (k: string) => (map.has(k) ? map.get(k)! : null),
    setItem: (k: string, v: string) => map.set(k, String(v)),
    removeItem: (k: string) => map.delete(k),
    clear: () => map.clear(),
    key: (i: number) => Array.from(map.keys())[i] ?? null,
    get length() {
      return map.size;
    },
  };
}

const schema = z.object({ count: z.number(), name: z.string() });
const def = { count: 0, name: "" };

describe("typedStore — migration branches", () => {
  beforeEach(() => {
    globalThis.localStorage = makeLS();
  });

  it("bumps the version without transforming when a migration step is missing", () => {
    // Stored as v0 envelope; current version is 2, but no migration for 0→1
    // or 1→2 is supplied. Each step is a no-op `continue`, so the raw data
    // (already in the current shape) passes the schema unchanged.
    globalThis.localStorage.setItem(
      "test",
      JSON.stringify({ __v: 0, data: { count: 9, name: "kept" } }),
    );
    const store = createTypedStore({
      key: "test",
      version: 2,
      schema,
      defaultValue: def,
    });
    expect(store.get()).toEqual({ count: 9, name: "kept" });
  });

  it("falls back to default when a migration throws", () => {
    globalThis.localStorage.setItem(
      "test",
      JSON.stringify({ __v: 0, data: { count: 1, name: "x" } }),
    );
    const report = vi.fn();
    const store = createTypedStore({
      key: "test",
      version: 1,
      schema,
      defaultValue: def,
      reportError: report,
      migrations: {
        0: () => {
          throw new Error("boom");
        },
      },
    });
    expect(store.get()).toEqual(def);
    expect(report).toHaveBeenCalledWith("migrate(0→1)", expect.any(Error));
  });

  it("treats a non-numeric envelope __v as version 0", () => {
    globalThis.localStorage.setItem(
      "test",
      JSON.stringify({ __v: "weird", data: { count: 2, name: "y" } }),
    );
    const migrate0 = vi.fn((old: unknown) => old);
    const store = createTypedStore({
      key: "test",
      version: 1,
      schema,
      defaultValue: def,
      migrations: { 0: migrate0 },
    });
    expect(store.get()).toEqual({ count: 2, name: "y" });
    // __v coerced to 0 → the 0→1 migration ran.
    expect(migrate0).toHaveBeenCalledTimes(1);
  });
});

describe("typedStore — listener + write error branches", () => {
  beforeEach(() => {
    globalThis.localStorage = makeLS();
  });

  it("reports a throwing listener but still runs the others and persists", () => {
    const report = vi.fn();
    const store = createTypedStore({
      key: "test",
      version: 1,
      schema,
      defaultValue: def,
      reportError: report,
    });
    const good = vi.fn();
    store.subscribe(() => {
      throw new Error("listener-broke");
    });
    store.subscribe(good);

    expect(store.set({ count: 3, name: "z" })).toBe(true);
    expect(good).toHaveBeenCalledWith({ count: 3, name: "z" });
    expect(report).toHaveBeenCalledWith("listener", expect.any(Error));
    // The write still landed despite the throwing listener.
    expect(store.get()).toEqual({ count: 3, name: "z" });
  });

  it("returns false and reports when the value cannot be serialised", () => {
    // BigInt is schema-valid for a loose schema but not JSON-serialisable.
    const bigSchema = z.object({ n: z.bigint() });
    const report = vi.fn();
    const store = createTypedStore({
      key: "big",
      version: 1,
      schema: bigSchema,
      defaultValue: { n: 0n },
      reportError: report,
    });
    expect(store.set({ n: 1n })).toBe(false);
    expect(report).toHaveBeenCalledWith("write", expect.any(Error));
  });
});

describe("typedStore — SSR / no-localStorage", () => {
  const original = Object.getOwnPropertyDescriptor(globalThis, "localStorage");

  beforeEach(() => {
    Object.defineProperty(globalThis, "localStorage", {
      configurable: true,
      writable: true,
      value: undefined,
    });
  });

  afterEach(() => {
    if (original) Object.defineProperty(globalThis, "localStorage", original);
  });

  it("get returns the default value when no localStorage exists", () => {
    const store = createTypedStore({
      key: "test",
      version: 1,
      schema,
      defaultValue: def,
    });
    expect(store.get()).toEqual(def);
  });

  it("set updates the in-memory cache and notifies without touching storage", () => {
    const store = createTypedStore({
      key: "test",
      version: 1,
      schema,
      defaultValue: def,
    });
    const seen: Array<{ count: number; name: string }> = [];
    store.subscribe((v) => seen.push(v));
    expect(store.set({ count: 5, name: "mem" })).toBe(true);
    expect(store.get()).toEqual({ count: 5, name: "mem" });
    expect(seen).toEqual([{ count: 5, name: "mem" }]);
  });

  it("reset returns to default and notifies without touching storage", () => {
    const store = createTypedStore({
      key: "test",
      version: 1,
      schema,
      defaultValue: def,
    });
    store.set({ count: 5, name: "mem" });
    const seen: Array<{ count: number; name: string }> = [];
    store.subscribe((v) => seen.push(v));
    store.reset();
    expect(store.get()).toEqual(def);
    expect(seen).toEqual([def]);
  });
});

describe("typedStore — reload + default reporter", () => {
  beforeEach(() => {
    globalThis.localStorage = makeLS();
  });

  it("reload notifies subscribers with the freshly-read value", () => {
    const store = createTypedStore({
      key: "test",
      version: 1,
      schema,
      defaultValue: def,
    });
    const seen: Array<{ count: number; name: string }> = [];
    store.subscribe((v) => seen.push(v));
    globalThis.localStorage.setItem(
      "test",
      JSON.stringify({ __v: 1, data: { count: 11, name: "ext" } }),
    );
    expect(store.reload()).toEqual({ count: 11, name: "ext" });
    expect(seen).toContainEqual({ count: 11, name: "ext" });
  });

  it("the default reporter swallows malformed data without throwing", () => {
    // No `reportError` → exercises `defaultReport` (logger.warn) path.
    globalThis.localStorage.setItem("test", "not-json{");
    expect(() =>
      createTypedStore({
        key: "test",
        version: 1,
        schema,
        defaultValue: def,
      }).get(),
    ).not.toThrow();
  });
});
