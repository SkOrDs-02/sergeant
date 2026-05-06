// @vitest-environment jsdom
/**
 * `safeWriteSyncedLS` / `safeRemoveSyncedLS` — explicit replacement
 * for the dropped `localStorage.setItem` monkey-patch (PR #008).
 *
 * Pre-PR-#052b ці хелпери жили в одній парі з v1 cloud-sync engine-ом:
 * write через `syncedKV` фірив `enqueueChange(key)`, який позначав
 * модуль dirty в LS-карті, і scheduler потім дебаунсив push. Цей
 * dirty-tracking зник разом з v1 engine (PR #052b). `enqueueChange`
 * залишився як no-op (див. `apps/web/src/core/cloudSync/enqueue.ts`)
 * виключно щоб decouple від `createSyncedKVStore` контракту до PR #053
 * (`chore: deprecate KVStore`).
 *
 * Тут перевіряємо тільки те, що залишилось мати сенс:
 *   1. `safeWriteSyncedLS` пише значення у LS і повертає `true`.
 *   2. Підтримує і об'єкти (JSON-encode), і сирі рядки (без
 *      double-encode), без різниці між tracked/untracked ключами.
 *   3. `safeRemoveSyncedLS` дійсно прибирає ключ з LS.
 *   4. Низький рівень `syncedKV` делегує в `webKVStore`.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { STORAGE_KEYS } from "@sergeant/shared";

import { safeReadLS, safeReadStringLS } from "./storage";
import { safeRemoveSyncedLS, safeWriteSyncedLS, syncedKV } from "./syncedKV";

beforeEach(() => {
  localStorage.clear();
});
afterEach(() => {
  localStorage.clear();
});

describe("safeWriteSyncedLS", () => {
  it("writes a tracked key value into localStorage", () => {
    const ok = safeWriteSyncedLS(STORAGE_KEYS.USER_PROFILE, [{ fact: "v" }]);

    expect(ok).toBe(true);
    expect(safeReadLS(STORAGE_KEYS.USER_PROFILE)).toEqual([{ fact: "v" }]);
  });

  it("writes legacy nutrition / finyk LS keys without erroring", () => {
    // PR #034 retired `nutrition` and PR #039 retired `finyk` from
    // SYNC_MODULES. Записи в ці legacy ключі повинні і далі
    // безпечно проходити крізь хелпер — модулі вже cut-over-нуті
    // на SQLite v2, але старі LS shapes ще читаються в migration
    // path-ах.
    expect(
      safeWriteSyncedLS(STORAGE_KEYS.NUTRITION_LOG, { "2025-05-03": {} }),
    ).toBe(true);
    expect(safeWriteSyncedLS(STORAGE_KEYS.FINYK_BUDGETS, [{ id: "b1" }])).toBe(
      true,
    );
    expect(safeWriteSyncedLS(STORAGE_KEYS.FINYK_SUBS, [])).toBe(true);
    expect(safeWriteSyncedLS(STORAGE_KEYS.FINYK_TX_CACHE, {})).toBe(true);
  });

  it("stores raw strings without double JSON-encoding", () => {
    // Same shape contract as `safeWriteLS` — passing a string keeps
    // the value as-is so callers can read back through
    // `safeReadStringLS` without hitting JSON.parse.
    safeWriteSyncedLS(STORAGE_KEYS.USER_PROFILE, "raw-string-payload");
    expect(safeReadStringLS(STORAGE_KEYS.USER_PROFILE)).toBe(
      "raw-string-payload",
    );
  });

  it("does not error on untracked keys", () => {
    expect(safeWriteSyncedLS("__random_unknown_key__", "x")).toBe(true);
    expect(safeReadStringLS("__random_unknown_key__")).toBe("x");
  });

  it("__hubSyncPatched global is gone", () => {
    // Sanity check that the historical monkey-patch is truly gone — as
    // of PR #008 nothing should set this flag, and PR #052b removed
    // the last code path that even referenced it.
    expect(
      (window as unknown as { __hubSyncPatched?: boolean }).__hubSyncPatched,
    ).toBeUndefined();
  });
});

describe("safeRemoveSyncedLS", () => {
  it("removes a previously-written tracked key", () => {
    safeWriteSyncedLS(STORAGE_KEYS.USER_PROFILE, { d: 1 });

    const ok = safeRemoveSyncedLS(STORAGE_KEYS.USER_PROFILE);

    expect(ok).toBe(true);
    expect(safeReadLS(STORAGE_KEYS.USER_PROFILE)).toBeNull();
  });

  it("removes an untracked key without erroring", () => {
    localStorage.setItem("scratch", "1");
    expect(safeRemoveSyncedLS("scratch")).toBe(true);
    expect(localStorage.getItem("scratch")).toBeNull();
  });
});

describe("syncedKV (low-level)", () => {
  it("getString delegates to webKVStore (reads from localStorage)", () => {
    localStorage.setItem("k", "v");
    expect(syncedKV.getString("k")).toBe("v");
    expect(syncedKV.getString("missing")).toBeNull();
  });

  it("setString writes through to localStorage", () => {
    syncedKV.setString(STORAGE_KEYS.USER_PROFILE, "{}");
    expect(localStorage.getItem(STORAGE_KEYS.USER_PROFILE)).toBe("{}");
  });
});
