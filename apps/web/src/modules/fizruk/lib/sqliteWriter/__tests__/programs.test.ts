/**
 * data-39: `fizruk_programs` (активна тренувальна програма) у dual-write.
 *
 * Справжній in-memory SQLite з клієнтськими міграціями fizruk. Перевіряємо
 * весь шлях, який раніше не існував у вебі: diff -> adapter (рядок + op у
 * sync_op_outbox) -> reader (кеш) -> pull-оп з іншого пристрою -> reader.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../../../../core/syncEngine/enqueueOutboxUpsert.js", () => ({
  enqueueOutboxUpsert: vi.fn().mockResolvedValue({ id: 1, inserted: true }),
}));
import { enqueueOutboxUpsert } from "../../../../../core/syncEngine/enqueueOutboxUpsert.js";

import { applyPullOp } from "../../../../../core/syncEngine/applyPullOp.js";
import {
  clearFizrukSqliteCache,
  getCachedFizrukSqliteState,
  refreshFizrukSqliteState,
} from "../../sqliteReader.js";
import { applyFizrukDualWriteOps } from "../adapter.js";
import {
  diffFizrukDualWriteOps,
  type FizrukDualWriteState,
} from "../diff/index.js";
import { diffProgramsOps } from "../diff/programs.js";
import { createTestSqlite, type TestSqliteHandle } from "./testSqlite.js";

const UID = "user-1";
const TS = "2026-10-01T10:00:00.000Z";
const EMPTY: FizrukDualWriteState = {
  workouts: [],
  customExercises: [],
  measurements: [],
  dailyLog: [],
  monthlyPlan: null,
  workoutTemplates: [],
  injuries: [],
};

let handle: TestSqliteHandle;
beforeEach(async () => {
  handle = await createTestSqlite();
  vi.mocked(enqueueOutboxUpsert).mockClear();
  clearFizrukSqliteCache();
});
afterEach(() => {
  handle.close();
  clearFizrukSqliteCache();
});

describe("diffProgramsOps", () => {
  it("emits programs-set when the active id changes", () => {
    expect(
      diffProgramsOps({ activeProgramId: null }, { activeProgramId: "ppl" }),
    ).toEqual([{ kind: "programs-set", programs: { activeProgramId: "ppl" } }]);
    expect(
      diffProgramsOps({ activeProgramId: "ppl" }, { activeProgramId: null }),
    ).toHaveLength(1);
  });

  it("first activation with no row yet emits an op", () => {
    expect(diffProgramsOps(null, { activeProgramId: "ppl" })).toHaveLength(1);
  });

  it("is a no-op for an unchanged id, a cold cache and 'no row + nothing chosen'", () => {
    expect(
      diffProgramsOps({ activeProgramId: "ppl" }, { activeProgramId: "ppl" }),
    ).toEqual([]);
    expect(diffProgramsOps({ activeProgramId: "ppl" }, null)).toEqual([]);
    expect(diffProgramsOps(undefined, undefined)).toEqual([]);
    expect(diffProgramsOps(null, { activeProgramId: null })).toEqual([]);
  });

  it("is wired into the orchestrator", () => {
    const ops = diffFizrukDualWriteOps(EMPTY, {
      ...EMPTY,
      programs: { activeProgramId: "ppl" },
    });
    expect(ops).toEqual([
      { kind: "programs-set", programs: { activeProgramId: "ppl" } },
    ]);
  });
});

describe("fizruk_programs dual-write + read + pull", () => {
  it("writes the singleton row, enqueues an outbox op and the reader sees it", async () => {
    const result = await applyFizrukDualWriteOps(
      handle.client,
      [{ kind: "programs-set", programs: { activeProgramId: "ppl" } }],
      { userId: UID, clientTs: TS },
    );
    expect(result).toMatchObject({ applied: 1, errored: 0 });

    const rows = handle.client.all<{
      user_id: string;
      active_program_id: string | null;
    }>(`SELECT user_id, active_program_id FROM fizruk_programs`);
    expect(rows).toEqual([{ user_id: UID, active_program_id: "ppl" }]);

    expect(enqueueOutboxUpsert).toHaveBeenCalledTimes(1);
    const [, input] = vi.mocked(enqueueOutboxUpsert).mock.calls[0]!;
    expect(input).toMatchObject({
      userId: UID,
      table: "fizruk_programs",
      op: "insert",
      row: { user_id: UID, active_program_id: "ppl" },
      clientTs: TS,
    });

    await refreshFizrukSqliteState(handle.client, UID);
    expect(getCachedFizrukSqliteState().programs).toEqual({
      activeProgramId: "ppl",
    });
  });

  it("deactivation keeps the row with a null id (and the reader reports null id, not 'no row')", async () => {
    await applyFizrukDualWriteOps(
      handle.client,
      [{ kind: "programs-set", programs: { activeProgramId: "ppl" } }],
      { userId: UID, clientTs: TS },
    );
    await applyFizrukDualWriteOps(
      handle.client,
      [{ kind: "programs-set", programs: { activeProgramId: null } }],
      { userId: UID, clientTs: "2026-10-01T11:00:00.000Z" },
    );
    await refreshFizrukSqliteState(handle.client, UID);
    expect(getCachedFizrukSqliteState().programs).toEqual({
      activeProgramId: null,
    });
  });

  it("an empty table reads as programs === null", async () => {
    await refreshFizrukSqliteState(handle.client, UID);
    expect(getCachedFizrukSqliteState().programs).toBeNull();
  });

  it("a pull op for fizruk_programs from another device changes the cached active program", async () => {
    const outcome = await applyPullOp(
      handle.client,
      {
        server_seq: 1,
        table: "fizruk_programs",
        op: "insert",
        client_ts: "2026-10-02T08:00:00.000Z",
        server_ts: "2026-10-02T08:00:01.000Z",
        origin_device_id: "other-device",
        row: {
          user_id: UID,
          active_program_id: "upper_lower",
          updated_at: "2026-10-02T08:00:00.000Z",
        },
      } as never,
      UID,
      "this-device",
    );
    expect(outcome).toBe("applied");

    await refreshFizrukSqliteState(handle.client, UID);
    expect(getCachedFizrukSqliteState().programs).toEqual({
      activeProgramId: "upper_lower",
    });
  });
});
