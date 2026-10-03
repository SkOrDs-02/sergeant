/**
 * Last validated: 2026-09-19
 * Status: Active
 *
 * DoD-приймання спеки `docs/work/specs/anonymous-local-first-persistence.md`
 * (§ Definition of done, пункт 2) — fizruk-гілка. Розбір і причина, чому
 * саме такий барʼєр, а не мокати `sqliteWriter/index.js`, — див.
 * `../../finyk/lib/dualWriteBoot.anonymousDurableWrite.test.ts` (той самий
 * шаблон, тут не дублюється).
 */
// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { LOCAL_ANON_USER_ID } from "../../../core/auth/localIdentity.js";

const migrateFizruk = vi.fn(async (..._a: unknown[]) => undefined);
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
  migrateFizruk: (...a: unknown[]) => migrateFizruk(...a),
}));

import {
  bootFizrukDualWrite,
  __resetFizrukDualWriteBootForTests,
} from "./dualWriteBoot";
import { EMPTY_FIZRUK_DUAL_WRITE_STATE } from "./fizrukDualWriteState.js";
import type { FizrukDualWriteState } from "./sqliteWriter/diff/index.js";
import {
  __clearFizrukDualWriteContextForTests,
  triggerFizrukDualWrite,
} from "./sqliteWriter/index.js";

beforeEach(() => {
  vi.clearAllMocks();
  __clearFizrukDualWriteContextForTests();
  __resetFizrukDualWriteBootForTests();
});

afterEach(() => {
  __clearFizrukDualWriteContextForTests();
  __resetFizrukDualWriteBootForTests();
});

async function waitForWrite(): Promise<void> {
  for (let i = 0; i < 50; i++) {
    if (fakeClient.run.mock.calls.length > 0) return;
    await new Promise((resolve) => globalThis.setTimeout(resolve, 5));
  }
}

describe("anonymous durable write — fizruk", () => {
  it("a daily-log entry written under local-anon reaches SQLite via client.run", async () => {
    bootFizrukDualWrite({ getUserId: () => LOCAL_ANON_USER_ID });

    const next: FizrukDualWriteState = {
      ...EMPTY_FIZRUK_DUAL_WRITE_STATE,
      dailyLog: [
        {
          id: "log1",
          at: "2026-09-19T08:00:00.000Z",
          weightKg: 80,
          sleepHours: 7,
          energyLevel: 4,
          mood: 4,
          note: "",
        },
      ],
    };
    triggerFizrukDualWrite(EMPTY_FIZRUK_DUAL_WRITE_STATE, next);

    await waitForWrite();

    expect(migrateFizruk).toHaveBeenCalledWith(fakeClient);
    expect(fakeClient.run).toHaveBeenCalled();
    const wroteAnonId = fakeClient.run.mock.calls.some((call) =>
      (call[1] as unknown[] | undefined)?.includes(LOCAL_ANON_USER_ID),
    );
    expect(wroteAnonId).toBe(true);
  });
});
