/**
 * Last validated: 2026-09-19
 * Status: Active
 *
 * DoD-приймання спеки `docs/work/specs/anonymous-local-first-persistence.md`
 * (§ Definition of done, пункт 2) — routine-гілка. Розбір і причина, чому
 * саме такий барʼєр, а не мокати `sqliteWriter/index.js`, — див.
 * `../../finyk/lib/dualWriteBoot.anonymousDurableWrite.test.ts` (той самий
 * шаблон, тут не дублюється).
 *
 * Чому саме тут, а не через E2E: `anonymous-persistence.spec.ts` навмисно
 * НЕ бере рутину — лічильник `__sergeantSqliteRefreshCounts`, який дає
 * детермінований барʼєр «запис долетів», рутина не публікує, тож рестарт
 * сторінки після її запису був би гонкою (розбір — сама спека,
 * § E2E-приймання). Юніт-барʼєр тут інший і детермінований без гонки:
 * очікування на конкретний виклик `fakeClient.run`, а не на UI-рефреш.
 */
// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { RoutineState } from "@sergeant/routine-domain";

import { LOCAL_ANON_USER_ID } from "../../../core/auth/localIdentity.js";

const migrateRoutine = vi.fn(async (..._a: unknown[]) => undefined);
const fakeClient = {
  run: vi.fn(async (..._a: unknown[]) => undefined),
  all: vi.fn(async (..._a: unknown[]) => []),
};
const getSqliteDb = vi.fn(async () => ({
  migrationClient: () => fakeClient,
}));

vi.mock("../../../core/db/sqlite.js", () => ({
  getSqliteDb: () => getSqliteDb(),
}));
vi.mock("./clientMigrate.js", () => ({
  migrateRoutine: (...a: unknown[]) => migrateRoutine(...a),
}));

import {
  bootRoutineDualWrite,
  __resetRoutineDualWriteBootForTests,
} from "./dualWriteBoot";
import {
  __clearRoutineDualWriteContextForTests,
  triggerRoutineDualWrite,
} from "./sqliteWriter/index.js";

function makeState(partial: Partial<RoutineState> = {}): RoutineState {
  return {
    schemaVersion: 1,
    prefs: {},
    tags: [],
    categories: [],
    habits: [],
    completions: {},
    habitOrder: [],
    completionNotes: {},
    ...partial,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  __clearRoutineDualWriteContextForTests();
  __resetRoutineDualWriteBootForTests();
});

afterEach(() => {
  __clearRoutineDualWriteContextForTests();
  __resetRoutineDualWriteBootForTests();
});

async function waitForWrite(): Promise<void> {
  for (let i = 0; i < 50; i++) {
    if (fakeClient.run.mock.calls.length > 0) return;
    await new Promise((resolve) => globalThis.setTimeout(resolve, 5));
  }
}

describe("anonymous durable write — routine", () => {
  it("a habit completion written under local-anon reaches SQLite via client.run", async () => {
    bootRoutineDualWrite({ getUserId: () => LOCAL_ANON_USER_ID });

    const prev = makeState({
      habits: [{ id: "h1", name: "Run" }],
      completions: {},
    });
    const next = makeState({
      habits: [{ id: "h1", name: "Run" }],
      completions: { h1: ["2026-09-19"] },
    });
    triggerRoutineDualWrite(prev, next);

    await waitForWrite();

    expect(migrateRoutine).toHaveBeenCalledWith(fakeClient);
    expect(fakeClient.run).toHaveBeenCalled();
    const wroteAnonId = fakeClient.run.mock.calls.some((call) =>
      (call[1] as unknown[] | undefined)?.includes(LOCAL_ANON_USER_ID),
    );
    expect(wroteAnonId).toBe(true);
  });
});
