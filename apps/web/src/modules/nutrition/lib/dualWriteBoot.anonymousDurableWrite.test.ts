/**
 * Last validated: 2026-09-19
 * Status: Active
 *
 * DoD-приймання спеки `docs/work/specs/anonymous-local-first-persistence.md`
 * (§ Definition of done, пункт 2) — nutrition-гілка. Розбір і причина, чому
 * саме такий барʼєр, а не мокати `sqliteWriter/index.js`, — див.
 * `../../finyk/lib/dualWriteBoot.anonymousDurableWrite.test.ts` (той самий
 * шаблон, тут не дублюється).
 */
// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { LOCAL_ANON_USER_ID } from "../../../core/auth/localIdentity.js";

const migrateNutrition = vi.fn(async (..._a: unknown[]) => undefined);
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
  migrateNutrition: (...a: unknown[]) => migrateNutrition(...a),
}));

import {
  bootNutritionDualWrite,
  __resetNutritionDualWriteBootForTests,
} from "./dualWriteBoot";
import {
  EMPTY_NUTRITION_DUAL_WRITE_STATE,
  type NutritionDualWriteState,
} from "./sqliteWriter/diff.js";
import {
  __clearNutritionDualWriteContextForTests,
  triggerNutritionDualWrite,
} from "./sqliteWriter/index.js";

beforeEach(() => {
  vi.clearAllMocks();
  __clearNutritionDualWriteContextForTests();
  __resetNutritionDualWriteBootForTests();
});

afterEach(() => {
  __clearNutritionDualWriteContextForTests();
  __resetNutritionDualWriteBootForTests();
});

async function waitForWrite(): Promise<void> {
  for (let i = 0; i < 50; i++) {
    if (fakeClient.run.mock.calls.length > 0) return;
    await new Promise((resolve) => globalThis.setTimeout(resolve, 5));
  }
}

describe("anonymous durable write — nutrition", () => {
  it("a water-log entry written under local-anon reaches SQLite via client.run", async () => {
    bootNutritionDualWrite({ getUserId: () => LOCAL_ANON_USER_ID });

    const next: NutritionDualWriteState = {
      ...EMPTY_NUTRITION_DUAL_WRITE_STATE,
      waterLog: { "2026-09-19": 500 },
    };
    triggerNutritionDualWrite(EMPTY_NUTRITION_DUAL_WRITE_STATE, next);

    await waitForWrite();

    expect(migrateNutrition).toHaveBeenCalledWith(fakeClient);
    expect(fakeClient.run).toHaveBeenCalled();
    const wroteAnonId = fakeClient.run.mock.calls.some((call) =>
      (call[1] as unknown[] | undefined)?.includes(LOCAL_ANON_USER_ID),
    );
    expect(wroteAnonId).toBe(true);
  });
});
