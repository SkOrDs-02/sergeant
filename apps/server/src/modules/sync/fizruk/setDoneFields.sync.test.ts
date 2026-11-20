import { describe, expect, it } from "vitest";

import { applyFizrukSets } from "./applySync.js";
import {
  asClient,
  FakeClient,
  lastQuery,
  syncOp,
} from "./__tests__/testHelpers.js";

// Міграція 176 (спека fizruk-set-done-flag-and-set-type): явний прапорець
// «виконано» і тип підходу. Прапорець присутності, як у 172: старий клієнт
// без ключів не затирає записане новим.

const clientTs = new Date("2026-11-19T08:00:00.000Z");
const setBase = {
  id: "set-1",
  user_id: "user-1",
  workout_item_id: "item-1",
  weight_kg: 60,
  reps: 8,
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

async function updateSet(row: Record<string, unknown>) {
  const fake = new FakeClient();
  fake.queueRows([
    { user_id: "user-1", updated_at: new Date("2026-11-19T07:30:00.000Z") },
  ]);
  fake.queueRows([{ "?column?": 1 }]);
  const result = await applyFizrukSets(
    asClient(fake),
    syncOp("fizruk_workout_sets", "update", row),
    "user-1",
    clientTs,
  );
  return { result, fake };
}

describe("applyFizrukSets — done і set_type", () => {
  it("INSERT пише done і set_type", async () => {
    const { result, fake } = await insertSet({
      ...setBase,
      done: false,
      set_type: "warmup",
    });
    expect(result).toEqual({ status: "applied" });
    const insert = lastQuery(fake);
    expect(insert.sql).toContain("done, set_type");
    expect(insert.params.slice(-2)).toEqual([false, "warmup"]);
  });

  it.each([
    [true, true],
    [false, false],
    [1, true],
    [0, false],
    [null, null],
  ])("done %s → %s", async (done, stored) => {
    const { result, fake } = await insertSet({ ...setBase, done });
    expect(result).toEqual({ status: "applied" });
    expect(lastQuery(fake).params.slice(-2)).toEqual([stored, null]);
  });

  it.each([["warmup"], ["drop"], ["failure"]])(
    "приймає тип %s",
    async (setType) => {
      const { result, fake } = await insertSet({
        ...setBase,
        set_type: setType,
      });
      expect(result).toEqual({ status: "applied" });
      expect(lastQuery(fake).params.slice(-1)).toEqual([setType]);
    },
  );

  it("рядок старого клієнта без ключів вставляє NULL-и", async () => {
    const { fake } = await insertSet(setBase);
    expect(lastQuery(fake).params.slice(-2)).toEqual([null, null]);
  });

  it.each([
    ["done рядком", { done: "true" }, "invalid_done"],
    ["done числом 2", { done: 2 }, "invalid_done"],
    ["done обʼєктом", { done: {} }, "invalid_done"],
    ["тип поза переліком", { set_type: "normal" }, "invalid_set_type"],
    ["тип великими", { set_type: "WARMUP" }, "invalid_set_type"],
    ["порожній тип", { set_type: "" }, "invalid_set_type"],
    ["тип числом", { set_type: 1 }, "invalid_set_type"],
  ])("відхиляє %s", async (_l, extra, reason) => {
    const { result, fake } = await insertSet({ ...setBase, ...extra });
    expect(result).toEqual({ status: "rejected", reason });
    expect(fake.queries.some((q) => /INSERT|UPDATE/.test(q.sql))).toBe(false);
  });

  it("UPDATE без ключів лишає колонки як є", async () => {
    const { result, fake } = await updateSet(setBase);
    expect(result).toEqual({ status: "applied" });
    const update = lastQuery(fake);
    expect(update.sql).toMatch(
      /done\s*=\s*CASE WHEN \$\d+::boolean THEN \$\d+::boolean ELSE done END/,
    );
    expect(update.sql).toMatch(
      /set_type\s*=\s*CASE WHEN \$\d+::boolean THEN \$\d+::text ELSE set_type END/,
    );
    expect(update.params.slice(-4)).toEqual([false, null, false, null]);
  });

  it("UPDATE з ключем null свідомо очищає, з значенням пише", async () => {
    const { fake } = await updateSet({
      ...setBase,
      done: null,
      set_type: "drop",
    });
    expect(lastQuery(fake).params.slice(-4)).toEqual([
      true,
      null,
      true,
      "drop",
    ]);
  });
});
