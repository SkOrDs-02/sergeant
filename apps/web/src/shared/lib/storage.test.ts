import { describe, it, expect, beforeEach, beforeAll } from "vitest";
import { z } from "zod";
import {
  safeReadLS,
  safeReadLSValidated,
  safeReadStringLS,
  safeWriteLS,
  safeRemoveLS,
} from "./storage";

// vitest is configured with environment: "node" so we need a minimal
// localStorage polyfill for these tests.
beforeAll(() => {
  if (typeof globalThis.localStorage === "undefined") {
    const store = new Map();
    globalThis.localStorage = {
      getItem: (k) => (store.has(k) ? store.get(k) : null),
      setItem: (k, v) => {
        store.set(k, String(v));
      },
      removeItem: (k) => {
        store.delete(k);
      },
      clear: () => store.clear(),
      key: (i) => Array.from(store.keys())[i] ?? null,
      get length() {
        return store.size;
      },
    };
  }
});

describe("shared storage helpers", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("safeReadLS returns fallback when key is missing", () => {
    expect(safeReadLS("missing", { a: 1 })).toEqual({ a: 1 });
    expect(safeReadLS("missing")).toBeNull();
  });

  it("safeReadLS returns fallback when JSON is malformed", () => {
    localStorage.setItem("bad", "{not json");
    expect(safeReadLS("bad", [])).toEqual([]);
  });

  it("safeReadLS returns fallback when stored value is null", () => {
    localStorage.setItem("nully", "null");
    expect(safeReadLS("nully", "x")).toBe("x");
  });

  it("safeReadLS parses stored JSON", () => {
    localStorage.setItem("k", JSON.stringify({ a: 1, b: [2, 3] }));
    expect(safeReadLS("k")).toEqual({ a: 1, b: [2, 3] });
  });

  it("safeReadStringLS returns raw string without parsing", () => {
    localStorage.setItem("token", "raw-value-123");
    expect(safeReadStringLS("token")).toBe("raw-value-123");
    expect(safeReadStringLS("missing", "fallback")).toBe("fallback");
  });

  it("safeWriteLS serializes objects and returns true on success", () => {
    expect(safeWriteLS("obj", { x: 1 })).toBe(true);
    expect(JSON.parse(localStorage.getItem("obj")!)).toEqual({ x: 1 });
  });

  it("safeWriteLS stores raw strings without double-quoting", () => {
    expect(safeWriteLS("s", "hello")).toBe(true);
    expect(localStorage.getItem("s")).toBe("hello");
  });

  it("safeRemoveLS deletes the key", () => {
    localStorage.setItem("x", "1");
    expect(safeRemoveLS("x")).toBe(true);
    expect(localStorage.getItem("x")).toBeNull();
  });

  describe("safeReadLSValidated", () => {
    const Schema = z.object({ count: z.number().int(), label: z.string() });
    const fallback = { count: 0, label: "default" };

    it("returns fallback when key is missing", () => {
      expect(safeReadLSValidated("missing", Schema, fallback)).toEqual(
        fallback,
      );
    });

    it("returns fallback when JSON is malformed", () => {
      localStorage.setItem("bad", "{not json");
      expect(safeReadLSValidated("bad", Schema, fallback)).toEqual(fallback);
    });

    it("returns fallback when payload fails schema validation", () => {
      // String where the schema demands an object — typical "user manually
      // edited the value" or "older format" corruption.
      localStorage.setItem("scalar", JSON.stringify("nope"));
      expect(safeReadLSValidated("scalar", Schema, fallback)).toEqual(fallback);

      // Object with a wrong-typed field — the dangerous case
      // `safeReadLS<T>` would silently let through.
      localStorage.setItem(
        "wrongShape",
        JSON.stringify({ count: "two", label: "x" }),
      );
      expect(safeReadLSValidated("wrongShape", Schema, fallback)).toEqual(
        fallback,
      );
    });

    it("returns the parsed value when payload matches the schema", () => {
      const value = { count: 7, label: "ok" };
      localStorage.setItem("ok", JSON.stringify(value));
      expect(safeReadLSValidated("ok", Schema, fallback)).toEqual(value);
    });
  });
});
