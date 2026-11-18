import { beforeEach, describe, expect, it } from "vitest";
import { STORAGE_KEYS } from "@sergeant/shared";
import type { Transaction } from "@sergeant/finyk-domain/domain/types";
import { safeWriteLS } from "@shared/lib/storage/storage";
import {
  clearMonoFirstConnectedAt,
  getFinykBankHistoryStart,
  getMonoFirstConnectedAt,
  recordMonoFirstConnectedAt,
} from "./bankHistory";
import {
  __setFinykMonoMirrorCacheForTests,
  clearFinykMonoMirrorCache,
} from "./monoMirrorReader";

const tx = (id: string, iso: string): Transaction =>
  ({ id, time: Date.parse(iso) / 1000, amount: -100 }) as Transaction;

describe("getMonoFirstConnectedAt", () => {
  beforeEach(() => clearMonoFirstConnectedAt());

  it("null, поки підключення не записано", () => {
    expect(getMonoFirstConnectedAt()).toBeNull();
  });

  it("повертає мітку після запису і не зсуває її повторним підключенням", () => {
    recordMonoFirstConnectedAt(1_700_000_000_000);
    recordMonoFirstConnectedAt(1_800_000_000_000);
    expect(getMonoFirstConnectedAt()).toBe(1_700_000_000_000);
  });

  it("після відключення знову null", () => {
    recordMonoFirstConnectedAt(1_700_000_000_000);
    clearMonoFirstConnectedAt();
    expect(getMonoFirstConnectedAt()).toBeNull();
  });

  it("зіпсований запис читається як null", () => {
    safeWriteLS(STORAGE_KEYS.FINYK_MONO_FIRST_CONNECTED_AT, "abc");
    expect(getMonoFirstConnectedAt()).toBeNull();
    safeWriteLS(STORAGE_KEYS.FINYK_MONO_FIRST_CONNECTED_AT, -5);
    expect(getMonoFirstConnectedAt()).toBeNull();
  });
});

describe("getFinykBankHistoryStart", () => {
  beforeEach(() => clearFinykMonoMirrorCache());

  it("null для порожнього дзеркала", () => {
    expect(getFinykBankHistoryStart()).toBeNull();
  });

  it("день найранішої операції, порядок не важливий (київська доба)", () => {
    const a = tx("a", "2026-09-10T12:00:00+03:00");
    const b = tx("b", "2026-08-31T23:30:00+03:00");
    const c = tx("c", "2026-10-05T09:00:00+03:00");
    __setFinykMonoMirrorCacheForTests({ transactions: [a, b, c] });
    expect(getFinykBankHistoryStart()).toBe("2026-08-31");
    __setFinykMonoMirrorCacheForTests({ transactions: [c, a, b] });
    expect(getFinykBankHistoryStart()).toBe("2026-08-31");
  });
});
