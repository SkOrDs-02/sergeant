import { describe, it, expect, beforeEach, afterEach } from "vitest";

import { applyFizrukDualWriteOps } from "../adapter.js";
import type { FizrukDualWriteOp } from "../diff/index.js";
import { createTestSqlite, type TestSqliteHandle } from "./testSqlite.js";

/**
 * FULL-20261126-FIZRUK-1: видалений підхід / вилучена з тренування вправа
 * мусять дійти до сервера tombstone-ом через outbox, а не лише локальним
 * UPDATE. Id підходів позиційні, тож перевіряємо перший/середній/останній.
 */

let handle: TestSqliteHandle;
const UID = "user-1";
const TS1 = "2026-05-01T10:00:00.000Z";
const TS2 = "2026-05-01T11:00:00.000Z";
const silent = () => {};

const workout = (
  setWeights: number[],
  itemIds: string[] = ["i1"],
  endedAt: string | null = null,
): FizrukDualWriteOp => ({
  kind: "workout-upsert",
  workout: {
    id: "w1",
    startedAt: "2026-05-01T10:00:00Z",
    endedAt,
    items: itemIds.map((id) => ({
      id,
      exerciseId: "bench",
      nameUk: "Жим",
      primaryGroup: "chest",
      musclesPrimary: ["chest"],
      musclesSecondary: [],
      type: "strength",
      sets: setWeights.map((w) => ({ weightKg: w, reps: 5 })),
    })),
    groups: [],
    warmup: null,
    cooldown: null,
    note: "",
  },
});

async function deletesFor(table: string): Promise<string[]> {
  const rows = await handle.client.all<{ row: string }>(
    `SELECT row FROM sync_op_outbox
      WHERE table_name = ? AND op = 'delete' AND user_id = ? ORDER BY id`,
    [table, UID],
  );
  return rows.map((r) => (JSON.parse(r.row) as { id: string }).id);
}

beforeEach(async () => {
  handle = await createTestSqlite();
});
afterEach(() => handle.close());

describe("видалення підходів і вправ іде в outbox", () => {
  const cases: Array<[string, number[], string]> = [
    ["останнього", [50, 40], "i1:s2"],
    ["середнього", [50, 30], "i1:s2"],
    ["першого", [40, 30], "i1:s2"],
  ];
  for (const [label, remaining, tombstone] of cases) {
    it(`підхід ${label}: tombstone хвоста ${tombstone} + upsert-и зсунутих значень`, async () => {
      await applyFizrukDualWriteOps(handle.client, [workout([50, 40, 30])], {
        userId: UID,
        clientTs: TS1,
        logger: silent,
      });
      await applyFizrukDualWriteOps(handle.client, [workout(remaining)], {
        userId: UID,
        clientTs: TS2,
        logger: silent,
      });

      expect(await deletesFor("fizruk_workout_sets")).toEqual([tombstone]);

      // Остаточний стан сервера за outbox: останній op для кожного id.
      const ops = await handle.client.all<{ op: string; row: string }>(
        `SELECT op, row FROM sync_op_outbox
          WHERE table_name = 'fizruk_workout_sets' ORDER BY id`,
      );
      const last = new Map<
        string,
        { op: string; weight: number | undefined }
      >();
      for (const o of ops) {
        const r = JSON.parse(o.row) as { id: string; weight_kg?: number };
        last.set(r.id, { op: o.op, weight: r.weight_kg });
      }
      const live = [...last.entries()]
        .filter(([, v]) => v.op !== "delete")
        .map(([, v]) => v.weight);
      expect(live).toEqual(remaining);
    });
  }

  it("вправа, вилучена з тренування: delete-оп для вправи", async () => {
    await applyFizrukDualWriteOps(
      handle.client,
      [workout([50], ["i1", "i2"])],
      { userId: UID, clientTs: TS1, logger: silent },
    );
    await applyFizrukDualWriteOps(handle.client, [workout([50], ["i1"])], {
      userId: UID,
      clientTs: TS2,
      logger: silent,
    });
    expect(await deletesFor("fizruk_workout_items")).toEqual(["i2"]);
  });

  it("завершене тренування: видалена вправа тягне delete для себе і своїх підходів", async () => {
    const ENDED = "2026-05-01T11:00:00Z";
    await applyFizrukDualWriteOps(
      handle.client,
      [workout([50, 40], ["i1", "i2"], ENDED)],
      { userId: UID, clientTs: TS1, logger: silent },
    );
    await applyFizrukDualWriteOps(
      handle.client,
      [workout([50, 40], ["i1"], ENDED)],
      { userId: UID, clientTs: TS2, logger: silent },
    );
    expect(await deletesFor("fizruk_workout_items")).toEqual(["i2"]);
    expect((await deletesFor("fizruk_workout_sets")).sort()).toEqual([
      "i2:s0",
      "i2:s1",
    ]);
  });

  it("реплей старішого знімка не штовхає tombstone-ів", async () => {
    await applyFizrukDualWriteOps(handle.client, [workout([50, 40, 30])], {
      userId: UID,
      clientTs: TS2,
      logger: silent,
    });
    await applyFizrukDualWriteOps(handle.client, [workout([50, 40])], {
      userId: UID,
      clientTs: TS1,
      logger: silent,
    });
    expect(await deletesFor("fizruk_workout_sets")).toEqual([]);
  });
});
