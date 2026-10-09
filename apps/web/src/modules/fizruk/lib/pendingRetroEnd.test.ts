// @vitest-environment jsdom
/**
 * Last validated: 2026-10-08
 * Status: Active
 *
 * data-37 (аудит 2026-10-01): введений кінець ретро-тренування мусить
 * пережити перезапуск вкладки/PWA. iOS вивантажує PWA разом із
 * sessionStorage, і слот, що жив там, зникав: «Завершити» ставило «зараз».
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { KVStore } from "@sergeant/shared";

// Бойовий шлях: після `bootstrapKvStore` запис іде у warm-cache SQLite, а в
// OPFS — асинхронно (fire-and-forget). Тут активний SQLite-стор — Map, який
// «перезавантаження» підміняє порожнім: upsert, що не встиг, втрачено.
const sqliteSlot = vi.hoisted(() => ({ store: null as KVStore | null }));
vi.mock("../../../core/db/kvStoreBoot", () => ({
  getActiveSqliteKvStore: () => sqliteSlot.store,
}));

import {
  clearPendingRetroEnd,
  peekPendingRetroEnd,
  setPendingRetroEnd,
  takePendingRetroEnd,
} from "./pendingRetroEnd";

const END = "2026-09-29T19:00:00.000Z";

function makeWarmCacheStore(): KVStore {
  const map = new Map<string, string>();
  return {
    getString: (k) => map.get(k) ?? null,
    setString: (k, v) => void map.set(k, v),
    remove: (k) => void map.delete(k),
    listKeys: () => [...map.keys()],
    onChange: () => () => {},
  };
}

describe("pendingRetroEnd", () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    sqliteSlot.store = null;
  });

  it("з активним SQLite KV слот переживає втрату незавершеного write-back (перезапуск PWA)", () => {
    sqliteSlot.store = makeWarmCacheStore();
    setPendingRetroEnd("w1", END);

    // Перезапуск: warm-cache піднято з SQLite, де upsert не долетів.
    sqliteSlot.store = makeWarmCacheStore();
    sessionStorage.clear();

    expect(peekPendingRetroEnd("w1")).toBe(END);
    expect(takePendingRetroEnd("w1")).toBe(END);
  });

  it("з активним SQLite KV take гасить слот і в сторі, і у фізичному localStorage", () => {
    const sqlite = makeWarmCacheStore();
    sqliteSlot.store = sqlite;
    setPendingRetroEnd("w1", END);
    expect(localStorage.getItem("fizruk_pending_retro_end_v1")).not.toBeNull();

    expect(takePendingRetroEnd("w1")).toBe(END);

    expect(localStorage.getItem("fizruk_pending_retro_end_v1")).toBeNull();
    expect(sqlite.getString("fizruk_pending_retro_end_v1")).toBeNull();
    expect(takePendingRetroEnd("w1")).toBeNull();
  });

  it("слот переживає перезапуск вкладки (sessionStorage очищено)", () => {
    setPendingRetroEnd("w1", END);

    sessionStorage.clear(); // імітація вивантаження вкладки/PWA

    expect(peekPendingRetroEnd("w1")).toBe(END);
    expect(takePendingRetroEnd("w1")).toBe(END);
  });

  it("take споживає слот: повторне читання дає null", () => {
    setPendingRetroEnd("w1", END);
    expect(takePendingRetroEnd("w1")).toBe(END);
    expect(takePendingRetroEnd("w1")).toBeNull();
  });

  it("чужий id слот не читає і не гасить", () => {
    setPendingRetroEnd("w1", END);
    expect(takePendingRetroEnd("w2")).toBeNull();
    clearPendingRetroEnd("w2");
    expect(peekPendingRetroEnd("w1")).toBe(END);
  });

  it("clear гасить слот свого id", () => {
    setPendingRetroEnd("w1", END);
    clearPendingRetroEnd("w1");
    expect(peekPendingRetroEnd("w1")).toBeNull();
  });

  it("пошкоджений запис читається як відсутність, без кидка", () => {
    localStorage.setItem("fizruk_pending_retro_end_v1", "{not json");
    expect(peekPendingRetroEnd("w1")).toBeNull();
    expect(takePendingRetroEnd("w1")).toBeNull();
  });
});
