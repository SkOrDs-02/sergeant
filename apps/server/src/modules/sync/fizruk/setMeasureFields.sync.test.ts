import { describe, expect, it } from "vitest";

import { applyFizrukItems, applyFizrukSets } from "./applySync.js";
import {
  asClient,
  FakeClient,
  lastQuery,
  syncOp,
} from "./__tests__/testHelpers.js";

// Міграція 172 (спека fizruk-exercise-measure-type): секунди й метри
// підходу, тип виміру вправи. Старий клієнт без ключів не затирає записане.

const clientTs = new Date("2026-11-18T08:00:00.000Z");
const setBase = {
  id: "set-1",
  user_id: "user-1",
  workout_item_id: "item-1",
  weight_kg: 0,
  reps: 0,
};

async function insertSet(row: Record<string, unknown>) {
  const fake = new FakeClient();
  fake.queueRows([]); // ownership lookup за id підходу
  fake.queueRows([{ "?column?": 1 }]); // батьківська позиція — власна
  const result = await applyFizrukSets(
    asClient(fake),
    syncOp("fizruk_workout_sets", "insert", row),
    "user-1",
    clientTs,
  );
  return { result, fake };
}

describe("applyFizrukSets — секунди й метри підходу", () => {
  it("пише секунди й метри одного підходу", async () => {
    const { result, fake } = await insertSet({
      ...setBase,
      duration_sec: 30,
      distance_m: 400,
    });
    expect(result).toEqual({ status: "applied" });
    const insert = lastQuery(fake);
    expect(insert.sql).toContain("duration_sec, distance_m");
    expect(insert.params.slice(-2)).toEqual([30, 400]);
  });

  it("рядок старого клієнта без ключів вставляє NULL-и", async () => {
    const { fake } = await insertSet(setBase);
    expect(lastQuery(fake).params.slice(-2)).toEqual([null, null]);
  });

  it.each([
    ["відʼємні секунди", { duration_sec: -1 }, "invalid_duration_sec"],
    ["понад добу", { duration_sec: 86_401 }, "invalid_duration_sec"],
    ["секунди рядком", { duration_sec: "abc" }, "invalid_duration_sec"],
    ["відʼємні метри", { distance_m: -5 }, "invalid_distance_m"],
    ["понад 1000 км", { distance_m: 1_000_001 }, "invalid_distance_m"],
  ])("відхиляє %s", async (_l, extra, reason) => {
    const { result } = await insertSet({ ...setBase, ...extra });
    expect(result).toEqual({ status: "rejected", reason });
  });

  it("UPDATE без ключів лишає колонки як є, з ключами — пише", async () => {
    const fake = new FakeClient();
    fake.queueRows([
      { user_id: "user-1", updated_at: new Date("2026-11-18T07:30:00.000Z") },
    ]);
    fake.queueRows([{ "?column?": 1 }]);
    await applyFizrukSets(
      asClient(fake),
      syncOp("fizruk_workout_sets", "update", setBase),
      "user-1",
      clientTs,
    );
    const update = lastQuery(fake);
    expect(update.sql).toMatch(
      /duration_sec\s*=\s*CASE WHEN \$\d+::boolean THEN \$\d+::integer ELSE duration_sec END/,
    );
    expect(update.sql).toMatch(
      /distance_m\s*=\s*CASE WHEN \$\d+::boolean THEN \$\d+::integer ELSE distance_m END/,
    );
    expect(update.params).toContain(false);
    expect(update.params).not.toContain(true);
  });
});

describe("applyFizrukItems — тип виміру", () => {
  const itemBase = {
    id: "item-1",
    user_id: "user-1",
    workout_id: "workout-1",
    exercise_id: "plank",
    name_uk: "Планка",
    type: "time",
  };

  async function insertItem(row: Record<string, unknown>) {
    const fake = new FakeClient();
    fake.queueRows([]);
    fake.queueRows([{ "?column?": 1 }]);
    const result = await applyFizrukItems(
      asClient(fake),
      syncOp("fizruk_workout_items", "insert", row),
      "user-1",
      clientTs,
    );
    return { result, fake };
  }

  it("пише тип із переліку", async () => {
    const { result, fake } = await insertItem({ ...itemBase, measure: "time" });
    expect(result).toEqual({ status: "applied" });
    expect(lastQuery(fake).sql).toContain("measure");
    expect(lastQuery(fake).params).toContain("time");
  });

  it.each([["WEIGHT"], ["assisted_reps"], [42]])(
    "відхиляє тип поза переліком: %s",
    async (measure) => {
      const { result } = await insertItem({ ...itemBase, measure });
      expect(result).toEqual({ status: "rejected", reason: "invalid_measure" });
    },
  );

  it("UPDATE старого клієнта не затирає тип", async () => {
    const fake = new FakeClient();
    fake.queueRows([
      { user_id: "user-1", updated_at: new Date("2026-11-18T07:30:00.000Z") },
    ]);
    fake.queueRows([{ "?column?": 1 }]);
    await applyFizrukItems(
      asClient(fake),
      syncOp("fizruk_workout_items", "update", itemBase),
      "user-1",
      clientTs,
    );
    expect(lastQuery(fake).sql).toMatch(
      /measure\s*=\s*CASE WHEN \$\d+::boolean THEN \$\d+::text ELSE measure END/,
    );
  });
});
