// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Шпигуємо за тригером dual-write і вдаємо зареєстрований контекст, щоб
// `peekFizrukDualWriteState()` читав SQLite-кеш так само, як у сесії.
// Сам запис НЕ виконується — кеш лишається «позаду» оптимістичного стану,
// рівно як між enqueue і apply → refresh у справжній черзі.
vi.mock("../lib/sqliteWriter/index", () => ({
  triggerFizrukDualWrite: vi.fn(),
  isFizrukDualWriteRegistered: () => true,
}));

import { triggerFizrukDualWrite } from "../lib/sqliteWriter/index";
import { diffDailyLogOps } from "../lib/sqliteWriter/diff/dailyLog";
import {
  __setFizrukSqliteCacheForTests,
  clearFizrukSqliteCache,
} from "../lib/sqliteReader";
import {
  __resetFizrukSqliteReadGateForTests,
  notifyFizrukSqliteCacheRefresh,
} from "../lib/sqliteReadGate";
import { useDailyLog, type DailyLogEntry } from "./useDailyLog";

const ENTRY: DailyLogEntry = {
  id: "dl_seed_1",
  at: "2026-09-16T07:00:00.000Z",
  weightKg: 81.2,
  sleepHours: 7.5,
  energyLevel: null,
  moodScore: null,
  note: "DCRUD body note",
};

const SYNCED: DailyLogEntry = {
  id: "dl_synced_2",
  at: "2026-09-15T07:00:00.000Z",
  weightKg: 80.9,
  sleepHours: 8,
  energyLevel: null,
  moodScore: null,
  note: "",
};

/** Ops, які diff-шар збере з ОСТАННЬОГО виклику тригера. */
function lastDailyLogOps() {
  const call = vi.mocked(triggerFizrukDualWrite).mock.calls.at(-1);
  if (!call) throw new Error("triggerFizrukDualWrite was not called");
  const [prev, next] = call;
  return diffDailyLogOps(prev.dailyLog, next.dailyLog);
}

beforeEach(() => {
  vi.mocked(triggerFizrukDualWrite).mockClear();
  __resetFizrukSqliteReadGateForTests();
  __setFizrukSqliteCacheForTests({ dailyLog: [ENTRY] });
});

afterEach(() => {
  clearFizrukSqliteCache();
  __resetFizrukSqliteReadGateForTests();
});

describe("useDailyLog — undo, поки delete ще в черзі dual-write", () => {
  it("«видалити → Повернути» до refresh кешу дає upsert, а не «без змін»", () => {
    const { result } = renderHook(() => useDailyLog());
    expect(result.current.entries.map((e) => e.id)).toEqual([ENTRY.id]);

    act(() => {
      result.current.deleteEntry(ENTRY.id);
    });
    expect(lastDailyLogOps()).toEqual([
      { kind: "daily-log-delete", entryId: ENTRY.id },
    ]);

    // Кеш навмисно НЕ оновлюємо: delete ще не долетів до SQLite. Саме в
    // цьому вікні undo-тост і приймає клік «Повернути» (E2E
    // deep-module-crud, 2026-09-16). Diff проти сирого кешу тут бачив
    // «[ENTRY] → [ENTRY]» і не писав нічого — а refresh після delete
    // потім стирав запис із UI.
    act(() => {
      result.current.restoreEntry(ENTRY);
    });
    expect(result.current.entries.map((e) => e.id)).toEqual([ENTRY.id]);
    expect(lastDailyLogOps()).toEqual([
      {
        kind: "daily-log-upsert",
        entry: expect.objectContaining({ id: ENTRY.id, weightKg: 81.2 }),
      },
    ]);
  });

  it("після тіка кешу prev знову береться з кешу (сторонні записи не перезаписуються)", () => {
    const { result } = renderHook(() => useDailyLog());

    act(() => {
      result.current.deleteEntry(ENTRY.id);
    });
    act(() => {
      result.current.restoreEntry(ENTRY);
    });

    // Черга затихла: restore долетів, а разом із ним sync підтягнув
    // чужий запис. Тік оверлею заміняє локальний стан кешем.
    __setFizrukSqliteCacheForTests({ dailyLog: [ENTRY, SYNCED] });
    act(() => {
      notifyFizrukSqliteCacheRefresh();
    });
    expect(result.current.entries.map((e) => e.id)).toEqual([
      ENTRY.id,
      SYNCED.id,
    ]);

    let added: DailyLogEntry | null = null;
    act(() => {
      added = result.current.addEntry({ sleepHours: 6 });
    });
    // Лише новий запис; SYNCED не має «пере-upsert-итись» зі старого
    // локального снапшота.
    expect(lastDailyLogOps()).toEqual([
      {
        kind: "daily-log-upsert",
        entry: expect.objectContaining({ id: added!.id, sleepHours: 6 }),
      },
    ]);
  });
});
