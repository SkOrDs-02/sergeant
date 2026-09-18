// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createModuleStorage } from "./createModuleStorage";

let storage: ReturnType<typeof createModuleStorage>;

beforeEach(() => {
  localStorage.clear();
  vi.useRealTimers();
  storage = createModuleStorage({ name: "test" });
});
afterEach(() => {
  storage.flushPendingWrites();
  localStorage.clear();
  vi.useRealTimers();
});

describe("createModuleStorage: readJSON", () => {
  it("повертає fallback на відсутній ключ", () => {
    expect(storage.readJSON("x", { a: 1 })).toEqual({ a: 1 });
  });
  it("повертає fallback на битий JSON", () => {
    localStorage.setItem("bad", "{not json");
    expect(storage.readJSON("bad", [])).toEqual([]);
  });
  it("читає валідний JSON", () => {
    localStorage.setItem("ok", JSON.stringify({ n: 7 }));
    expect(storage.readJSON("ok")).toEqual({ n: 7 });
  });
});

describe("createModuleStorage: writeJSON round-trip", () => {
  it("серіалізує та десеріалізує значення", () => {
    expect(storage.writeJSON("k", { foo: "bar" })).toBe(true);
    expect(storage.readJSON("k")).toEqual({ foo: "bar" });
  });
});

describe("createModuleStorage: raw/remove", () => {
  it("readRaw/writeRaw без JSON", () => {
    storage.writeRaw("pref", "1");
    expect(storage.readRaw("pref")).toBe("1");
    expect(storage.readRaw("missing", "def")).toBe("def");
  });
  it("removeItem видаляє ключ", () => {
    storage.writeRaw("t", "hello");
    storage.removeItem("t");
    expect(storage.readRaw("t", null)).toBeNull();
  });
});

describe("createModuleStorage: debounce + skip-if-equal", () => {
  it("затримує запис, пропускає ідентичне значення", () => {
    vi.useFakeTimers();
    storage.writeJSONDebounced("k", { a: 1 }, 200);
    expect(localStorage.getItem("k")).toBeNull();
    vi.advanceTimersByTime(201);
    expect(JSON.parse(localStorage.getItem("k")!)).toEqual({ a: 1 });

    const spy = vi.spyOn(Storage.prototype, "setItem");
    storage.writeJSONDebounced("k", { a: 1 }, 200);
    vi.advanceTimersByTime(500);
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  it("останнє значення перемагає", () => {
    vi.useFakeTimers();
    storage.writeJSONDebounced("q", 1, 300);
    storage.writeJSONDebounced("q", 2, 300);
    storage.writeJSONDebounced("q", 3, 300);
    vi.advanceTimersByTime(301);
    expect(JSON.parse(localStorage.getItem("q")!)).toBe(3);
  });

  it("flushPendingWrites одразу скидає буфер", () => {
    vi.useFakeTimers();
    storage.writeJSONDebounced("p", "v", 500);
    expect(localStorage.getItem("p")).toBeNull();
    storage.flushPendingWrites();
    expect(JSON.parse(localStorage.getItem("p")!)).toBe("v");
  });

  it("removeItem скасовує pending write", () => {
    vi.useFakeTimers();
    storage.writeJSONDebounced("rm", "value", 500);
    storage.removeItem("rm");
    vi.advanceTimersByTime(1000);
    expect(localStorage.getItem("rm")).toBeNull();
  });
});

describe("createModuleStorage: ізоляція між модулями", () => {
  it("debounce-буфер одного модуля не впливає на інший", () => {
    vi.useFakeTimers();
    const a = createModuleStorage({ name: "a" });
    const b = createModuleStorage({ name: "b" });
    a.writeJSONDebounced("same", "A", 100);
    b.writeJSONDebounced("same", "B", 100);
    // b перезапише a, бо ключ один — але pending-стан ізольований.
    vi.advanceTimersByTime(101);
    // Останнє застосоване = B (оскільки обидва записали).
    expect(JSON.parse(localStorage.getItem("same")!)).toBe("B");
    a.flushPendingWrites();
    b.flushPendingWrites();
  });
});
