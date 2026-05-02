// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  FINYK_STORAGE_KEYS,
  readJSON,
  writeJSON,
  readRaw,
  writeRaw,
  removeItem,
  writeJSONDebounced,
  flushPendingWrites,
  getTransactions,
  saveTransactions,
  getCategories,
  saveCategories,
  getBudget,
  saveBudget,
} from "./finykStorage";

beforeEach(() => {
  localStorage.clear();
  vi.useRealTimers();
});
afterEach(() => {
  flushPendingWrites();
  localStorage.clear();
  vi.useRealTimers();
});

describe("readJSON", () => {
  it("повертає fallback для відсутнього ключа", () => {
    expect(readJSON("missing", { a: 1 })).toEqual({ a: 1 });
  });

  it("повертає fallback при биттих даних без падіння", () => {
    localStorage.setItem("bad", "{not json");
    expect(readJSON("bad", [])).toEqual([]);
  });

  it("читає валідний JSON", () => {
    localStorage.setItem("ok", JSON.stringify({ x: 42 }));
    expect(readJSON("ok")).toEqual({ x: 42 });
  });
});

describe("writeJSON + readJSON", () => {
  it("серіалізує та десеріалізує значення", () => {
    const value = { foo: "bar", nums: [1, 2, 3] };
    expect(writeJSON("roundtrip", value)).toBe(true);
    expect(readJSON("roundtrip")).toEqual(value);
  });
});

describe("readRaw / writeRaw", () => {
  it("зберігає рядок без JSON обгортки", () => {
    writeRaw("pref", "1");
    expect(readRaw("pref")).toBe("1");
    expect(readRaw("other", "def")).toBe("def");
  });
});

describe("removeItem", () => {
  it("видаляє ключ", () => {
    writeRaw("tmp", "hello");
    expect(readRaw("tmp")).toBe("hello");
    removeItem("tmp");
    expect(readRaw("tmp", null)).toBeNull();
  });
});

describe("writeJSONDebounced", () => {
  it("затримує запис, не записує однакові значення повторно", async () => {
    vi.useFakeTimers();
    writeJSONDebounced("k", { a: 1 }, 200);
    // Ще не записано.
    expect(localStorage.getItem("k")).toBeNull();
    vi.advanceTimersByTime(199);
    expect(localStorage.getItem("k")).toBeNull();
    vi.advanceTimersByTime(2);
    expect(JSON.parse(localStorage.getItem("k")!)).toEqual({ a: 1 });

    // Той самий payload — debounce не повинен нічого планувати повторно.
    const spy = vi.spyOn(Storage.prototype, "setItem");
    writeJSONDebounced("k", { a: 1 }, 200);
    vi.advanceTimersByTime(500);
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  it("останнє значення перемагає при швидких послідовних викликах", () => {
    vi.useFakeTimers();
    writeJSONDebounced("q", 1, 300);
    writeJSONDebounced("q", 2, 300);
    writeJSONDebounced("q", 3, 300);
    vi.advanceTimersByTime(301);
    expect(JSON.parse(localStorage.getItem("q")!)).toBe(3);
  });
});

describe("flushPendingWrites", () => {
  it("скидає всі відкладені записи одразу", () => {
    vi.useFakeTimers();
    writeJSONDebounced("pending", "value", 500);
    expect(localStorage.getItem("pending")).toBeNull();
    flushPendingWrites();
    expect(JSON.parse(localStorage.getItem("pending")!)).toBe("value");
  });
});

describe("Domain API", () => {
  it("transactions: default/get/save", () => {
    expect(getTransactions()).toEqual([]);
    saveTransactions([{ id: "1" } as never]);
    flushPendingWrites();
    expect(getTransactions()).toEqual([{ id: "1" }]);
    expect(
      JSON.parse(localStorage.getItem(FINYK_STORAGE_KEYS.transactions)!),
    ).toEqual([{ id: "1" }]);
  });

  it("categories: default/get/save", () => {
    expect(getCategories()).toEqual([]);
    saveCategories([{ id: "c1", name: "Food" } as never]);
    flushPendingWrites();
    expect(getCategories()).toEqual([{ id: "c1", name: "Food" }]);
  });

  it("budget: default/get/save", () => {
    expect(getBudget()).toEqual([]);
    saveBudget([{ id: "b1", limit: 100 }]);
    flushPendingWrites();
    expect(getBudget()).toEqual([{ id: "b1", limit: 100 }]);
  });

  it("коректно обробляє биті дані у storage", () => {
    localStorage.setItem(FINYK_STORAGE_KEYS.transactions, "corrupted");
    localStorage.setItem(FINYK_STORAGE_KEYS.categories, "{bad");
    localStorage.setItem(FINYK_STORAGE_KEYS.budget, "not json either");
    expect(getTransactions()).toEqual([]);
    expect(getCategories()).toEqual([]);
    expect(getBudget()).toEqual([]);
  });
});
