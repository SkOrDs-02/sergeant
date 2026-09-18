import { describe, it, expect, beforeEach } from "vitest";

import {
  __setFinykMonoMirrorCacheForTests,
  clearFinykMonoMirrorCache,
  getCachedFinykMonoMirrorState,
  getVisibleFinykMonoMirrorState,
  getVisibleFinykMonoMirrorStateWithLastGood,
} from "./monoMirrorReader";
import type { Transaction } from "@sergeant/finyk-domain/domain/types";
import { STORAGE_KEYS } from "@sergeant/shared";
import { safeWriteLS, safeRemoveLS } from "@shared/lib/storage/storage";

function tx(id: string, accountId: string | null): Transaction {
  return {
    id,
    amount: -1000,
    time: 1_750_000_000,
    description: id,
    _accountId: accountId,
    accountId,
  } as unknown as Transaction;
}

describe("getVisibleFinykMonoMirrorState", () => {
  beforeEach(() => {
    clearFinykMonoMirrorCache();
    safeRemoveLS(STORAGE_KEYS.FINYK_HIDDEN);
  });

  it("без finyk_hidden повертає той самий обʼєкт кешу (без копії)", () => {
    __setFinykMonoMirrorCacheForTests({
      transactions: [tx("a", "acc1"), tx("b", "acc2")],
    });
    expect(getVisibleFinykMonoMirrorState()).toBe(
      getCachedFinykMonoMirrorState(),
    );
  });

  it("фільтрує транзакції прихованих карток, лишаючи решту", () => {
    safeWriteLS(STORAGE_KEYS.FINYK_HIDDEN, ["acc1"]);
    __setFinykMonoMirrorCacheForTests({
      transactions: [tx("a", "acc1"), tx("b", "acc2"), tx("m", null)],
    });
    const visible = getVisibleFinykMonoMirrorState();
    expect(visible.transactions.map((t) => t.id)).toEqual(["b", "m"]);
    // Сирий кеш незмінний — ingest-шлях бачить усе.
    expect(getCachedFinykMonoMirrorState().transactions).toHaveLength(3);
  });

  it("WithLastGood-варіант теж фільтрує last-good фолбек", () => {
    safeWriteLS(STORAGE_KEYS.FINYK_HIDDEN, ["acc1"]);
    __setFinykMonoMirrorCacheForTests({
      transactions: [tx("a", "acc1"), tx("b", "acc2")],
    });
    // Порожній refresh → активується last-good фолбек.
    __setFinykMonoMirrorCacheForTests({ transactions: [] });
    const visible = getVisibleFinykMonoMirrorStateWithLastGood();
    expect(visible.transactions.map((t) => t.id)).toEqual(["b"]);
  });
});
