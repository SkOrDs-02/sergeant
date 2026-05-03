import { describe, it, expect, beforeEach } from "vitest";
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
    // вікно у тестах симулюємо руками, storage event нам тут не критичний
  };
}

describe("typedStore", () => {
  beforeEach(() => {
    globalThis.localStorage = makeLS();
  });

  const schema = z.object({ count: z.number(), name: z.string() });

  it("повертає defaultValue, якщо ключа немає", () => {
    const store = createTypedStore({
      key: "test",
      version: 1,
      schema,
      defaultValue: { count: 0, name: "" },
    });
    expect(store.get()).toEqual({ count: 0, name: "" });
  });

  it("зберігає/читає envelope з версією", () => {
    const store = createTypedStore({
      key: "test",
      version: 2,
      schema,
      defaultValue: { count: 0, name: "" },
    });
    store.set({ count: 5, name: "a" });
    const raw = JSON.parse(globalThis.localStorage.getItem("test")!);
    expect(raw).toEqual({ __v: 2, data: { count: 5, name: "a" } });
    expect(store.get()).toEqual({ count: 5, name: "a" });
  });

  it("повертає default при бітому JSON без падіння", () => {
    globalThis.localStorage.setItem("test", "not-json{");
    const store = createTypedStore({
      key: "test",
      version: 1,
      schema,
      defaultValue: { count: -1, name: "fb" },
      reportError: () => {},
    });
    expect(store.get()).toEqual({ count: -1, name: "fb" });
  });

  it("повертає default, якщо схема не співпадає", () => {
    globalThis.localStorage.setItem(
      "test",
      JSON.stringify({ __v: 1, data: { count: "oops", name: 1 } }),
    );
    const store = createTypedStore({
      key: "test",
      version: 1,
      schema,
      defaultValue: { count: 0, name: "" },
      reportError: () => {},
    });
    expect(store.get()).toEqual({ count: 0, name: "" });
  });

  it("застосовує міграції v0→v2 послідовно", () => {
    // v0 — сира форма без envelope
    globalThis.localStorage.setItem(
      "test",
      JSON.stringify({ cnt: 3, title: "hi" }),
    );
    const store = createTypedStore({
      key: "test",
      version: 2,
      schema,
      defaultValue: { count: 0, name: "" },
      legacyVersion: 0,
      migrations: {
        0: (old: unknown) => {
          const o = old as { cnt: number; title: string };
          return { count: o.cnt, title: o.title };
        },
        1: (old: unknown) => {
          const o = old as { count: number; title: string };
          return { count: o.count, name: o.title };
        },
      },
    });
    expect(store.get()).toEqual({ count: 3, name: "hi" });
  });

  it("повертає default для формату з майбутнього", () => {
    globalThis.localStorage.setItem(
      "test",
      JSON.stringify({ __v: 99, data: { count: 1, name: "future" } }),
    );
    const store = createTypedStore({
      key: "test",
      version: 1,
      schema,
      defaultValue: { count: 0, name: "" },
      reportError: () => {},
    });
    expect(store.get()).toEqual({ count: 0, name: "" });
  });

  it("notify викликає підписників при set", () => {
    const store = createTypedStore({
      key: "test",
      version: 1,
      schema,
      defaultValue: { count: 0, name: "" },
    });
    let seen: { count: number; name: string } | null = null;
    const off = store.subscribe((v) => {
      seen = v;
    });
    store.set({ count: 7, name: "x" });
    expect(seen).toEqual({ count: 7, name: "x" });
    off();
  });

  it("set відхиляє невалідне значення і не чіпає LS", () => {
    const store = createTypedStore({
      key: "test",
      version: 1,
      schema,
      defaultValue: { count: 0, name: "" },
      reportError: () => {},
    });
    store.set({ count: 1, name: "ok" });
    const ok = store.set({ count: "nope", name: 1 } as unknown as {
      count: number;
      name: string;
    });
    expect(ok).toBe(false);
    expect(store.get()).toEqual({ count: 1, name: "ok" });
  });

  it("reset прибирає ключ і переводить на default", () => {
    const store = createTypedStore({
      key: "test",
      version: 1,
      schema,
      defaultValue: { count: 0, name: "" },
    });
    store.set({ count: 4, name: "z" });
    store.reset();
    expect(store.get()).toEqual({ count: 0, name: "" });
    expect(globalThis.localStorage.getItem("test")).toBeNull();
  });

  it("reload перечитує з LS (симуляція зовнішньої зміни)", () => {
    const store = createTypedStore({
      key: "test",
      version: 1,
      schema,
      defaultValue: { count: 0, name: "" },
    });
    store.set({ count: 1, name: "a" });
    globalThis.localStorage.setItem(
      "test",
      JSON.stringify({ __v: 1, data: { count: 42, name: "ext" } }),
    );
    expect(store.reload()).toEqual({ count: 42, name: "ext" });
  });
});
