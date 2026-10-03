import { describe, expect, it } from "vitest";
import type { PoolClient } from "pg";

import {
  applyFizrukItems,
  applyFizrukSets,
  applyFizrukWorkouts,
} from "./applySync.js";
import { syncOp } from "./__tests__/testHelpers.js";

/**
 * `data-01` (аудит 2026-10-01), крок 1: `fizruk_workout_items.workout_id` і
 * `fizruk_workout_sets.workout_item_id` — ОДНОКОЛОНКОВІ FK на таблиці з
 * глобальним PK. Без перевірки власника батька користувач B міг прикріпити
 * власний рядок до чужого тренування A.
 *
 * Фейк тут не чергує відповіді SELECT-ів (як `FakeClient`), а тримає стан:
 * хто чим володіє, відповідає на lookup за `(id, user_id)` і записує INSERT-и.
 * Тому тест перевіряє саме семантику «B не бачить батька A», а не порядок
 * викликів. Запити розпізнаються за текстом SQL — якщо хендлер змінить форму
 * запиту, фейк кине помилку, а не мовчки відповість «порожньо».
 */
type Table = "fizruk_workouts" | "fizruk_workout_items" | "fizruk_workout_sets";

class OwnershipClient {
  readonly owners: Record<Table, Map<string, string>> = {
    fizruk_workouts: new Map(),
    fizruk_workout_items: new Map(),
    fizruk_workout_sets: new Map(),
  };
  readonly writes: Array<{ kind: "INSERT" | "UPDATE"; table: Table }> = [];

  async query(
    sql: string,
    params: unknown[] = [],
  ): Promise<{ rows: unknown[]; rowCount: number }> {
    const table =
      /(fizruk_workout_items|fizruk_workout_sets|fizruk_workouts)/.exec(
        sql,
      )?.[1] as Table | undefined;
    if (!table) throw new Error(`unexpected SQL: ${sql}`);
    const id = String(params[0]);

    if (/^\s*SELECT\s+1\s+FROM/i.test(sql)) {
      // guardParentOwned: рядок видно лише власнику.
      const owned = this.owners[table].get(id) === params[1];
      return {
        rows: owned ? [{ "?column?": 1 }] : [],
        rowCount: owned ? 1 : 0,
      };
    }
    if (/^\s*SELECT\s+user_id,\s*updated_at/i.test(sql)) {
      // Lookup за id БЕЗ user_id: глобальний PK бачить і чужий рядок.
      const owner = this.owners[table].get(id);
      return {
        rows: owner
          ? [{ user_id: owner, updated_at: new Date(0), deleted_at: null }]
          : [],
        rowCount: owner ? 1 : 0,
      };
    }
    if (/^\s*INSERT\s+INTO/i.test(sql)) {
      // Позиція user_id в параметрах: workouts (id, user_id, …),
      // items/sets (id, <parent>, user_id, …).
      const userIdx = table === "fizruk_workouts" ? 1 : 2;
      this.owners[table].set(id, String(params[userIdx]));
      this.writes.push({ kind: "INSERT", table });
      return { rows: [], rowCount: 1 };
    }
    if (/^\s*UPDATE/i.test(sql)) {
      this.writes.push({ kind: "UPDATE", table });
      return { rows: [], rowCount: 1 };
    }
    throw new Error(`unexpected SQL: ${sql}`);
  }
}

function asPool(fake: OwnershipClient): PoolClient {
  return fake as unknown as PoolClient;
}

const TS = new Date("2026-10-01T10:00:00.000Z");
const A = "user-A";
const B = "user-B";

async function seedOwnWorkout(
  fake: OwnershipClient,
  user: string,
  workoutId: string,
): Promise<void> {
  await expect(
    applyFizrukWorkouts(
      asPool(fake),
      syncOp("fizruk_workouts", "insert", {
        id: workoutId,
        user_id: user,
        started_at: TS.toISOString(),
      }),
      user,
      TS,
    ),
  ).resolves.toEqual({ status: "applied" });
}

function itemOp(id: string, user: string, workoutId: string) {
  return syncOp("fizruk_workout_items", "insert", {
    id,
    user_id: user,
    workout_id: workoutId,
    exercise_id: "ex-1",
    name_uk: "Присідання",
  });
}

function setOp(id: string, user: string, itemId: string) {
  return syncOp("fizruk_workout_sets", "insert", {
    id,
    user_id: user,
    workout_item_id: itemId,
    reps: 5,
  });
}

describe("applyFizrukItems: власник батьківського тренування (data-01)", () => {
  it("відхиляє item користувача B під чужим тренуванням A і нічого не пише", async () => {
    const fake = new OwnershipClient();
    await seedOwnWorkout(fake, A, "w-A");
    const writesBefore = fake.writes.length;

    await expect(
      applyFizrukItems(asPool(fake), itemOp("i-B", B, "w-A"), B, TS),
    ).resolves.toEqual({ status: "rejected", reason: "fk_violation" });

    expect(fake.writes).toHaveLength(writesBefore);
    expect(fake.owners.fizruk_workout_items.has("i-B")).toBe(false);
  });

  it("відповідь для відсутнього й для чужого батька однакова (не оракул існування)", async () => {
    const fake = new OwnershipClient();
    await seedOwnWorkout(fake, A, "w-A");

    const foreign = await applyFizrukItems(
      asPool(fake),
      itemOp("i-B1", B, "w-A"),
      B,
      TS,
    );
    const missing = await applyFizrukItems(
      asPool(fake),
      itemOp("i-B2", B, "w-nobody"),
      B,
      TS,
    );
    expect(foreign).toEqual(missing);
  });

  it("власний item під власним тренуванням застосовується як раніше", async () => {
    const fake = new OwnershipClient();
    await seedOwnWorkout(fake, B, "w-B");

    await expect(
      applyFizrukItems(asPool(fake), itemOp("i-B", B, "w-B"), B, TS),
    ).resolves.toEqual({ status: "applied" });
    expect(fake.owners.fizruk_workout_items.get("i-B")).toBe(B);
  });

  it("update власного item не може перенести його під чуже тренування", async () => {
    const fake = new OwnershipClient();
    await seedOwnWorkout(fake, A, "w-A");
    await seedOwnWorkout(fake, B, "w-B");
    await applyFizrukItems(asPool(fake), itemOp("i-B", B, "w-B"), B, TS);
    const writesBefore = fake.writes.length;

    const later = new Date(TS.getTime() + 1000);
    await expect(
      applyFizrukItems(
        asPool(fake),
        syncOp("fizruk_workout_items", "update", {
          id: "i-B",
          user_id: B,
          workout_id: "w-A",
          exercise_id: "ex-1",
          name_uk: "Присідання",
        }),
        B,
        later,
      ),
    ).resolves.toEqual({ status: "rejected", reason: "fk_violation" });
    expect(fake.writes).toHaveLength(writesBefore);
  });

  it("батч: чужий item відхиляється, решта застосовується", async () => {
    const fake = new OwnershipClient();
    await seedOwnWorkout(fake, A, "w-A");
    await seedOwnWorkout(fake, B, "w-B");

    const results = [];
    for (const op of [
      itemOp("i-B-bad", B, "w-A"),
      itemOp("i-B-ok-1", B, "w-B"),
      itemOp("i-B-ok-2", B, "w-B"),
    ]) {
      results.push(await applyFizrukItems(asPool(fake), op, B, TS));
    }

    expect(results).toEqual([
      { status: "rejected", reason: "fk_violation" },
      { status: "applied" },
      { status: "applied" },
    ]);
    expect([...fake.owners.fizruk_workout_items.keys()].sort()).toEqual([
      "i-B-ok-1",
      "i-B-ok-2",
    ]);
  });

  it("delete не потребує батька (перевірка лише на шляху запису)", async () => {
    const fake = new OwnershipClient();
    await seedOwnWorkout(fake, B, "w-B");
    await applyFizrukItems(asPool(fake), itemOp("i-B", B, "w-B"), B, TS);

    const later = new Date(TS.getTime() + 1000);
    await expect(
      applyFizrukItems(
        asPool(fake),
        syncOp("fizruk_workout_items", "delete", { id: "i-B", user_id: B }),
        B,
        later,
      ),
    ).resolves.toEqual({ status: "applied" });
  });
});

describe("applyFizrukSets: власник батьківської позиції (data-01)", () => {
  async function seedItem(fake: OwnershipClient, user: string, n: string) {
    await seedOwnWorkout(fake, user, `w-${n}`);
    await applyFizrukItems(
      asPool(fake),
      itemOp(`i-${n}`, user, `w-${n}`),
      user,
      TS,
    );
  }

  it("відхиляє set користувача B під чужою позицією A і нічого не пише", async () => {
    const fake = new OwnershipClient();
    await seedItem(fake, A, "A");
    const writesBefore = fake.writes.length;

    await expect(
      applyFizrukSets(asPool(fake), setOp("s-B", B, "i-A"), B, TS),
    ).resolves.toEqual({ status: "rejected", reason: "fk_violation" });

    expect(fake.writes).toHaveLength(writesBefore);
    expect(fake.owners.fizruk_workout_sets.has("s-B")).toBe(false);
  });

  it("власний set під власною позицією застосовується як раніше", async () => {
    const fake = new OwnershipClient();
    await seedItem(fake, B, "B");

    await expect(
      applyFizrukSets(asPool(fake), setOp("s-B", B, "i-B"), B, TS),
    ).resolves.toEqual({ status: "applied" });
    expect(fake.owners.fizruk_workout_sets.get("s-B")).toBe(B);
  });

  it("батч: чужий set відхиляється, власний застосовується", async () => {
    const fake = new OwnershipClient();
    await seedItem(fake, A, "A");
    await seedItem(fake, B, "B");

    const results = [
      await applyFizrukSets(asPool(fake), setOp("s-bad", B, "i-A"), B, TS),
      await applyFizrukSets(asPool(fake), setOp("s-ok", B, "i-B"), B, TS),
    ];

    expect(results).toEqual([
      { status: "rejected", reason: "fk_violation" },
      { status: "applied" },
    ]);
    expect([...fake.owners.fizruk_workout_sets.keys()]).toEqual(["s-ok"]);
  });
});
