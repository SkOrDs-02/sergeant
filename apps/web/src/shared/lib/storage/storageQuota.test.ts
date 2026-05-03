import { describe, it, expect, beforeAll, beforeEach, vi } from "vitest";
import {
  estimateUtf8Bytes,
  safeSetItem,
  safeJsonSet,
  DEFAULT_MAX_BYTES,
} from "./storageQuota";

// Minimal localStorage polyfill — vitest runs in node by default.
beforeAll(() => {
  if (typeof globalThis.localStorage === "undefined") {
    const store = new Map<string, string>();
    globalThis.localStorage = {
      getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
      setItem: (k: string, v: string) => store.set(k, String(v)),
      removeItem: (k: string) => store.delete(k),
      clear: () => store.clear(),
      key: (i: number) => Array.from(store.keys())[i] ?? null,
      get length() {
        return store.size;
      },
    } as Storage;
  }
});

beforeEach(() => localStorage.clear());

// ─── estimateUtf8Bytes ────────────────────────────────────────────────────────

describe("estimateUtf8Bytes", () => {
  it("returns byte count for ASCII", () => {
    expect(estimateUtf8Bytes("hello")).toBe(5);
    expect(estimateUtf8Bytes("")).toBe(0);
  });

  it("returns more bytes than chars for multi-byte UTF-8 (Cyrillic)", () => {
    // "Привіт" = 6 chars, 11 bytes in UTF-8
    const bytes = estimateUtf8Bytes("Привіт");
    expect(bytes).toBeGreaterThan(6);
  });

  it("coerces null / undefined to empty string → 0 bytes", () => {
    expect(estimateUtf8Bytes(null)).toBe(0);
    expect(estimateUtf8Bytes(undefined)).toBe(0);
  });

  it("coerces non-string values via String()", () => {
    expect(estimateUtf8Bytes(42)).toBe(2); // "42"
    expect(estimateUtf8Bytes(true)).toBe(4); // "true"
  });
});

// ─── safeSetItem ──────────────────────────────────────────────────────────────

describe("safeSetItem", () => {
  it("stores a value and returns ok: true with byte count", () => {
    const result = safeSetItem("k", "hello");
    expect(result.ok).toBe(true);
    expect(typeof result.bytes).toBe("number");
    expect(localStorage.getItem("k")).toBe("hello");
  });

  it("returns { ok: false, reason: 'too_large' } when value exceeds maxBytes", () => {
    const big = "x".repeat(50);
    const result = safeSetItem("big", big, { maxBytes: 10 });
    expect(result.ok).toBe(false);
    expect(result.reason).toBe("too_large");
    expect(result.bytes).toBeGreaterThan(10);
    expect(result.maxBytes).toBe(10);
    // Must not have written anything
    expect(localStorage.getItem("big")).toBeNull();
  });

  it("does not reject when value is exactly at maxBytes boundary", () => {
    // 5 ASCII chars = 5 bytes; maxBytes = 5 → should pass
    const result = safeSetItem("edge", "abcde", { maxBytes: 5 });
    expect(result.ok).toBe(true);
  });

  it("returns { ok: false, reason: 'exception' } on storage errors", () => {
    const origSetItem = localStorage.setItem.bind(localStorage);
    vi.spyOn(localStorage, "setItem").mockImplementationOnce(() => {
      throw new DOMException("QuotaExceededError");
    });
    const result = safeSetItem("err", "x");
    expect(result.ok).toBe(false);
    expect(result.reason).toBe("exception");
    expect(result.error).toBeDefined();
    vi.restoreAllMocks();
    // Restore is called automatically, but keep explicit for clarity
    void origSetItem;
  });

  it("uses DEFAULT_MAX_BYTES when no options provided", () => {
    expect(DEFAULT_MAX_BYTES).toBeGreaterThan(0);
    // A small value should always pass the default limit
    const result = safeSetItem("small", "x");
    expect(result.ok).toBe(true);
  });
});

// ─── safeJsonSet ─────────────────────────────────────────────────────────────

describe("safeJsonSet", () => {
  it("stringifies an object and stores it", () => {
    const result = safeJsonSet("obj", { a: 1, b: [2, 3] });
    expect(result.ok).toBe(true);
    expect(JSON.parse(localStorage.getItem("obj")!)).toEqual({
      a: 1,
      b: [2, 3],
    });
  });

  it("stores null as the JSON string 'null'", () => {
    const result = safeJsonSet("n", null);
    expect(result.ok).toBe(true);
    expect(localStorage.getItem("n")).toBe("null");
  });

  it("rejects oversized objects", () => {
    const big = { data: "x".repeat(200) };
    const result = safeJsonSet("bigobj", big, { maxBytes: 10 });
    expect(result.ok).toBe(false);
    expect(result.reason).toBe("too_large");
    expect(localStorage.getItem("bigobj")).toBeNull();
  });

  it("stores arrays correctly", () => {
    safeJsonSet("arr", [1, 2, 3]);
    expect(JSON.parse(localStorage.getItem("arr")!)).toEqual([1, 2, 3]);
  });

  it("returns exception when JSON.stringify throws", () => {
    // Circular reference causes JSON.stringify to throw
    const circular: Record<string, unknown> = {};
    circular.self = circular;
    const result = safeJsonSet("circ", circular);
    expect(result.ok).toBe(false);
    expect(result.reason).toBe("exception");
  });
});
