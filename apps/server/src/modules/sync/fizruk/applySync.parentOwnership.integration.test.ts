/**
 * Integration (реальний Postgres) для `data-01`, крок 1: батьківський рядок
 * `fizruk_workout_items` / `fizruk_workout_sets` мусить належати тому самому
 * користувачу. Юніт-пара — `applySync.parentOwnership.test.ts` (фейк-клієнт);
 * тут перевіряємо те, чого фейк не покаже: що `guardParentOwned` справді
 * бачить глобальний PK + одноколонковий FK і що чужий рядок не лишає слід у
 * таблицях.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { PoolClient } from "pg";

import {
  bootIntegrationHarness,
  seedIntegrationUser,
  shutdownIntegrationHarness,
  truncateIntegrationTables,
  INTEGRATION_TIMEOUT_MS,
  type IntegrationHarness,
} from "../../../test/createIntegrationApp.js";
import { syncOp } from "./__tests__/testHelpers.js";
import {
  applyFizrukItems,
  applyFizrukSets,
  applyFizrukWorkouts,
} from "./applySync.js";

let harness: IntegrationHarness;
let dockerAvailable = false;

const USER_A = "u_fz_parent_a";
const USER_B = "u_fz_parent_b";
const TS = new Date("2026-10-01T10:00:00.000Z");

beforeAll(async () => {
  try {
    harness = await bootIntegrationHarness({ app: false });
    dockerAvailable = true;
  } catch (e) {
    // У CI Docker обов'язковий: тихий skip позеленив би джобу без жодного
    // виконаного тесту.
    if (process.env["CI"]) throw e;
    console.warn(
      "[fizruk parent ownership integration] Skipping:",
      e instanceof Error ? e.message : String(e),
    );
  }
}, INTEGRATION_TIMEOUT_MS);

afterAll(async () => {
  if (dockerAvailable) await shutdownIntegrationHarness();
}, INTEGRATION_TIMEOUT_MS);

beforeEach(async () => {
  if (!dockerAvailable) return;
  await truncateIntegrationTables(harness.pool);
  await seedIntegrationUser(harness.pool, USER_A);
  await seedIntegrationUser(harness.pool, USER_B);
});

async function withClient<T>(fn: (c: PoolClient) => Promise<T>): Promise<T> {
  const client = await harness.pool.connect();
  try {
    return await fn(client);
  } finally {
    client.release();
  }
}

const workout = (id: string, user: string) =>
  syncOp("fizruk_workouts", "insert", {
    id,
    user_id: user,
    started_at: TS.toISOString(),
  });
const item = (id: string, user: string, workoutId: string) =>
  syncOp("fizruk_workout_items", "insert", {
    id,
    user_id: user,
    workout_id: workoutId,
    exercise_id: "ex-1",
    name_uk: "Присідання",
  });
const set = (id: string, user: string, itemId: string) =>
  syncOp("fizruk_workout_sets", "insert", {
    id,
    user_id: user,
    workout_item_id: itemId,
    reps: 5,
  });

describe("fizruk sync: власник батька на реальній БД (data-01)", () => {
  it(
    "B не може додати item у тренування A і set у позицію A; свої рядки B застосовуються",
    async (ctx) => {
      if (!dockerAvailable) return ctx.skip();

      await withClient(async (c) => {
        expect(
          await applyFizrukWorkouts(c, workout("w-A", USER_A), USER_A, TS),
        ).toEqual({ status: "applied" });
        expect(
          await applyFizrukItems(c, item("i-A", USER_A, "w-A"), USER_A, TS),
        ).toEqual({ status: "applied" });

        // Атака: власний рядок B під чужим батьком.
        expect(
          await applyFizrukItems(c, item("i-B-bad", USER_B, "w-A"), USER_B, TS),
        ).toEqual({ status: "rejected", reason: "fk_violation" });
        expect(
          await applyFizrukSets(c, set("s-B-bad", USER_B, "i-A"), USER_B, TS),
        ).toEqual({ status: "rejected", reason: "fk_violation" });

        // Той самий B зі своїми рядками — як раніше.
        expect(
          await applyFizrukWorkouts(c, workout("w-B", USER_B), USER_B, TS),
        ).toEqual({ status: "applied" });
        expect(
          await applyFizrukItems(c, item("i-B", USER_B, "w-B"), USER_B, TS),
        ).toEqual({ status: "applied" });
        expect(
          await applyFizrukSets(c, set("s-B", USER_B, "i-B"), USER_B, TS),
        ).toEqual({ status: "applied" });
      });

      const items = await harness.pool.query<{ id: string; user_id: string }>(
        `SELECT id, user_id FROM fizruk_workout_items ORDER BY id`,
      );
      expect(items.rows).toEqual([
        { id: "i-A", user_id: USER_A },
        { id: "i-B", user_id: USER_B },
      ]);
      const sets = await harness.pool.query<{ id: string; user_id: string }>(
        `SELECT id, user_id FROM fizruk_workout_sets ORDER BY id`,
      );
      expect(sets.rows).toEqual([{ id: "s-B", user_id: USER_B }]);
    },
    INTEGRATION_TIMEOUT_MS,
  );
});
