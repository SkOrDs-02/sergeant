/**
 * Last validated: 2026-09-19
 * Status: Active
 *
 * DoD-приймання спеки `docs/work/specs/anonymous-local-first-persistence.md`
 * (§ Definition of done, пункт 2): анонімний write-шлях резолвить id через
 * `useLocalUserId` (`LOCAL_ANON_USER_ID` = `"local-anon"`) і РЕАЛЬНО
 * потрапляє в durable-сховище — не гине мовчки на `if (!userId) return`.
 *
 * На відміну від `dualWriteBoot.test.ts` (мокає `./sqliteWriter/index.js`
 * цілком і перевіряє лише реєстрацію контексту) і від хук-тестів
 * (`useFinykDualWriteBoot.test.tsx`, мокають `./lib/dualWriteBoot.js`
 * цілком і перевіряють лише, що `getUserId()` резолвиться в `local-anon`),
 * цей тест лишає РЕАЛЬНИМ увесь ланцюжок від `bootFinykDualWrite` до
 * `client.run(...)` включно: `sqliteWriter/index.ts` (оркестратор),
 * `sqliteWriter/adapter.ts` (SQL) і `sqliteWriter/diff.ts` (diff) не
 * замоковані. Єдине, що підмінено, — вихід у справжній SQLite-WASM
 * (`getSqliteDb` і `migrateFinyk`), бо той шар власного тестового
 * контракту не потребує: тут доводиться, що виклик РЕАЛЬНО доходить до
 * `client.run` із `"local-anon"` серед параметрів, а не що WASM-сховище
 * саме по собі працює (це вже покрито `adapter.test.ts` /
 * `adapter.snapshot.test.ts`).
 */
// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { LOCAL_ANON_USER_ID } from "../../../core/auth/localIdentity.js";

const migrateFinyk = vi.fn(async (..._a: unknown[]) => undefined);
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
  migrateFinyk: (...a: unknown[]) => migrateFinyk(...a),
}));

import {
  bootFinykDualWrite,
  __resetFinykDualWriteBootForTests,
} from "./dualWriteBoot";
import {
  EMPTY_FINYK_STATE,
  type FinykDualWriteState,
} from "./sqliteWriter/diff.js";
import {
  __clearFinykDualWriteContextForTests,
  triggerFinykDualWrite,
} from "./sqliteWriter/index.js";

beforeEach(() => {
  vi.clearAllMocks();
  __clearFinykDualWriteContextForTests();
  __resetFinykDualWriteBootForTests();
});

afterEach(() => {
  __clearFinykDualWriteContextForTests();
  __resetFinykDualWriteBootForTests();
});

/** Чекає, поки `run` захопить хоча б один виклик — черга йде через
 * `setTimeout(0)` + кілька мікрозадач (`dualWriteQueue` у
 * `sqliteWriter/index.ts`). */
async function waitForWrite(): Promise<void> {
  for (let i = 0; i < 50; i++) {
    if (fakeClient.run.mock.calls.length > 0) return;
    await new Promise((resolve) => globalThis.setTimeout(resolve, 5));
  }
}

describe("anonymous durable write — finyk", () => {
  it("an expense written under local-anon reaches SQLite via client.run", async () => {
    bootFinykDualWrite({ getUserId: () => LOCAL_ANON_USER_ID });

    const next: FinykDualWriteState = {
      ...EMPTY_FINYK_STATE,
      hiddenAccounts: [{ id: "acc1" }],
    };
    triggerFinykDualWrite(EMPTY_FINYK_STATE, next);

    await waitForWrite();

    expect(migrateFinyk).toHaveBeenCalledWith(fakeClient);
    expect(fakeClient.run).toHaveBeenCalled();
    const wroteAnonId = fakeClient.run.mock.calls.some((call) =>
      (call[1] as unknown[] | undefined)?.includes(LOCAL_ANON_USER_ID),
    );
    expect(wroteAnonId).toBe(true);
  });
});
