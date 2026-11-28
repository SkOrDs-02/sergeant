import { describe, it, expect, beforeEach, afterEach } from "vitest";

import { applyFizrukDualWriteOps } from "../adapter.js";
import type { FizrukDualWriteOp } from "../diff/index.js";
import { createTestSqlite, type TestSqliteHandle } from "./testSqlite.js";

/**
 * B7a: збереження одного підходу не мусить штовхати в outbox upsert-и
 * незмінених підходів/вправ (інакше LWW затирає чужу зміну з іншого
 * пристрою). A2: прибрана вправа тягне свої підходи в tombstone.
 */

let handle: TestSqliteHandle;
const UID = "user-1";
const TS1 = "2026-05-01T10:00:00.000Z";
const TS2 = "2026-05-01T11:00:00.000Z";
const silent = () => {};

const item = (id: string, name: string, sets: Array<[number, number]>) => ({
  id,
  exerciseId: id,
  nameUk: name,
  primaryGroup: "chest",
  musclesPrimary: ["chest"],
  musclesSecondary: [],
  type: "strength",
  sets: sets.map(([weightKg, reps]) => ({ weightKg, reps, done: true })),
});

const workout = (
  items: ReturnType<typeof item>[],
  note = "",
): FizrukDualWriteOp => ({
  kind: "workout-upsert",
  workout: {
    id: "w1",
    startedAt: "2026-05-01T10:00:00Z",
    endedAt: "2026-05-01T11:00:00Z",
    items,
    groups: [],
    warmup: null,
    cooldown: null,
    note,
  },
});

const apply = (op: FizrukDualWriteOp, clientTs: string) =>
  applyFizrukDualWriteOps(handle.client, [op], {
    userId: UID,
    clientTs,
    logger: silent,
  });

async function outboxIds(table: string): Promise<string[]> {
  const rows = await handle.client.all<{ row: string }>(
    `SELECT row FROM sync_op_outbox WHERE table_name = ? ORDER BY id`,
    [table],
  );
  return rows.map((r) => (JSON.parse(r.row) as { id: string }).id);
}

beforeEach(async () => {
  handle = await createTestSqlite();
});
afterEach(() => handle.close());

describe("B7a: оп-и лише для реально змінених рядків", () => {
  it("зміна одного підходу дає upsert лише для нього, інші keep updated_at", async () => {
    const bench = (reps: number) => item("bench", "Жим", [[60, reps]]);
    const row = item("row", "Тяга", [[80, 5]]);
    await apply(workout([bench(15), row]), TS1);
    const before = (await outboxIds("fizruk_workout_sets")).length;
    expect(before).toBe(2);

    await apply(workout([bench(14), row]), TS2);

    const all = await outboxIds("fizruk_workout_sets");
    expect(all.slice(before)).toEqual(["bench:s0"]);
    expect((await outboxIds("fizruk_workout_items")).length).toBe(2);
    expect((await outboxIds("fizruk_workouts")).length).toBe(1);

    const rows = await handle.client.all<{ id: string; updated_at: string }>(
      `SELECT id, updated_at FROM fizruk_workout_sets ORDER BY id`,
    );
    expect(rows).toEqual([
      { id: "bench:s0", updated_at: TS2 },
      { id: "row:s0", updated_at: TS1 },
    ]);
  });

  it("ідентичний реплей не пише нічого", async () => {
    const w = workout([item("bench", "Жим", [[60, 15]])]);
    await apply(w, TS1);
    const n = (await outboxIds("fizruk_workout_sets")).length;
    await apply(w, TS2);
    expect((await outboxIds("fizruk_workout_sets")).length).toBe(n);
  });

  it("зміна нотатки тренування штовхає лише тренування", async () => {
    const items = [item("bench", "Жим", [[60, 15]])];
    await apply(workout(items), TS1);
    await apply(workout(items, "нова"), TS2);
    expect((await outboxIds("fizruk_workouts")).length).toBe(2);
    expect((await outboxIds("fizruk_workout_sets")).length).toBe(1);
    expect((await outboxIds("fizruk_workout_items")).length).toBe(1);
  });
});

describe("A2: прибрана вправа тягне свої підходи", () => {
  it("підходи вправи отримують deleted_at і delete в outbox", async () => {
    const a = item("a", "Жим", [[60, 5]]);
    const b = item("b", "Тяга", [
      [80, 5],
      [80, 6],
    ]);
    await apply(workout([a, b]), TS1);
    await apply(workout([a]), TS2);

    const rows = await handle.client.all<{
      id: string;
      deleted_at: string | null;
    }>(`SELECT id, deleted_at FROM fizruk_workout_sets ORDER BY id`);
    expect(rows).toEqual([
      { id: "a:s0", deleted_at: null },
      { id: "b:s0", deleted_at: TS2 },
      { id: "b:s1", deleted_at: TS2 },
    ]);
    const del = await handle.client.all<{ row: string }>(
      `SELECT row FROM sync_op_outbox
        WHERE table_name = 'fizruk_workout_sets' AND op = 'delete' ORDER BY id`,
    );
    expect(
      del.map((r) => (JSON.parse(r.row) as { id: string }).id).sort(),
    ).toEqual(["b:s0", "b:s1"]);
  });
});
