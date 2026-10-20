// @vitest-environment jsdom
/**
 * data-39: одноразовий дрен LS `fizruk_active_program_id_v1` -> SQLite
 * `fizruk_programs`. Справжній in-memory SQLite, outbox замокано.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../../core/syncEngine/enqueueOutboxUpsert.js", () => ({
  enqueueOutboxUpsert: vi.fn().mockResolvedValue({ id: 1, inserted: true }),
}));
import { enqueueOutboxUpsert } from "../../../core/syncEngine/enqueueOutboxUpsert.js";

import { drainLegacyActiveProgram } from "./legacyActiveProgramDrain";
import {
  clearFizrukSqliteCache,
  getCachedFizrukSqliteState,
  refreshFizrukSqliteState,
} from "./sqliteReader";
import {
  createTestSqlite,
  type TestSqliteHandle,
} from "./sqliteWriter/__tests__/testSqlite";

const KEY = "fizruk_active_program_id_v1";
const UID = "user-1";

let handle: TestSqliteHandle;
beforeEach(async () => {
  localStorage.clear();
  handle = await createTestSqlite();
  vi.mocked(enqueueOutboxUpsert).mockClear();
  vi.mocked(enqueueOutboxUpsert).mockResolvedValue({
    id: 1,
    inserted: true,
    skipped: null,
  });
  clearFizrukSqliteCache();
  await refreshFizrukSqliteState(handle.client, UID);
});
afterEach(() => {
  handle.close();
  clearFizrukSqliteCache();
});

function programRows() {
  return handle.client.all<{ active_program_id: string | null }>(
    `SELECT active_program_id FROM fizruk_programs WHERE user_id = ?`,
    [UID],
  );
}

describe("drainLegacyActiveProgram", () => {
  it("moves the LS value into fizruk_programs (+ outbox), removes the key and warms the cache", async () => {
    localStorage.setItem(KEY, "ppl");

    expect(await drainLegacyActiveProgram(handle.client, UID)).toBe(true);

    expect(programRows()).toEqual([{ active_program_id: "ppl" }]);
    expect(enqueueOutboxUpsert).toHaveBeenCalledTimes(1);
    expect(vi.mocked(enqueueOutboxUpsert).mock.calls[0]![1]).toMatchObject({
      table: "fizruk_programs",
      row: { user_id: UID, active_program_id: "ppl" },
    });
    expect(localStorage.getItem(KEY)).toBeNull();
    expect(getCachedFizrukSqliteState().programs).toEqual({
      activeProgramId: "ppl",
    });
  });

  it("is a no-op without an LS key", async () => {
    expect(await drainLegacyActiveProgram(handle.client, UID)).toBe(false);
    expect(programRows()).toEqual([]);
    expect(enqueueOutboxUpsert).not.toHaveBeenCalled();
  });

  it("does not overwrite an existing SQLite row (pulled / newer) and drops the stale LS key", async () => {
    await handle.client.run(
      `INSERT INTO fizruk_programs (user_id, active_program_id, updated_at) VALUES (?, ?, ?)`,
      [UID, "upper_lower", "2026-10-02T08:00:00.000Z"],
    );
    await refreshFizrukSqliteState(handle.client, UID);
    localStorage.setItem(KEY, "ppl");

    expect(await drainLegacyActiveProgram(handle.client, UID)).toBe(false);

    expect(programRows()).toEqual([{ active_program_id: "upper_lower" }]);
    expect(enqueueOutboxUpsert).not.toHaveBeenCalled();
    expect(localStorage.getItem(KEY)).toBeNull();
  });

  it("keeps the LS key when the write fails, so the next boot retries", async () => {
    localStorage.setItem(KEY, "ppl");
    vi.mocked(enqueueOutboxUpsert).mockRejectedValueOnce(new Error("disk"));

    expect(await drainLegacyActiveProgram(handle.client, UID)).toBe(false);

    expect(localStorage.getItem(KEY)).toBe("ppl");
  });

  it("drops an empty LS value without writing a row", async () => {
    localStorage.setItem(KEY, "  ");
    expect(await drainLegacyActiveProgram(handle.client, UID)).toBe(false);
    expect(programRows()).toEqual([]);
    expect(localStorage.getItem(KEY)).toBeNull();
  });
});
