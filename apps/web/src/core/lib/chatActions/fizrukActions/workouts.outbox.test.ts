// @vitest-environment jsdom
/**
 * data-11: наскрізно — чат-екзекутор → справжній `shared.ts` → справжній
 * dual-write пайплайн fizruk → SQLite → outbox. Фіксуємо те, що бачить
 * сервер: у кожному `fizruk_workout_items` є непорожній `exercise_id`, а
 * custom-вправа стає в чергу РАНІШЕ за item, що на неї посилається.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../../../core/syncEngine/enqueueOutboxUpsert.js", () => ({
  enqueueOutboxUpsert: vi.fn().mockResolvedValue({ id: 1, inserted: true }),
}));
import { enqueueOutboxUpsert } from "../../../../core/syncEngine/enqueueOutboxUpsert.js";

import {
  __clearFizrukDualWriteContextForTests,
  registerFizrukDualWriteContext,
} from "../../../../modules/fizruk/lib/sqliteWriter/index";
import {
  createTestSqlite,
  type TestSqliteHandle,
} from "../../../../modules/fizruk/lib/sqliteWriter/__tests__/testSqlite";
import {
  __setFizrukSqliteCacheForTests,
  clearFizrukSqliteCache,
} from "../../../../modules/fizruk/lib/sqliteReader";
import { __resetPendingChatExercisesForTests } from "./exerciseResolve";
import { copyWorkout, logSet, planWorkout } from "./workouts";

const enqueueMock = enqueueOutboxUpsert as unknown as ReturnType<typeof vi.fn>;
const UID = "user-1";
const TS = "2026-05-01T10:00:00.000Z";

type OutboxInput = { table: string; row: Record<string, unknown> };

let handle: TestSqliteHandle;

beforeEach(async () => {
  handle = await createTestSqlite();
  enqueueMock.mockClear();
  __resetPendingChatExercisesForTests();
  clearFizrukSqliteCache();
  // Прогрітий порожній кеш: `readFizrukWorkouts()` → [], custom → [].
  __setFizrukSqliteCacheForTests({});
  localStorage.clear();
  registerFizrukDualWriteContext({
    getUserId: () => UID,
    getMigrationClient: async () => handle.client,
    getNow: () => TS,
    logger: () => {},
  });
});

afterEach(() => {
  __clearFizrukDualWriteContextForTests();
  clearFizrukSqliteCache();
  handle.close();
  localStorage.clear();
});

function outbox(): OutboxInput[] {
  return enqueueMock.mock.calls.map(([, input]) => input as OutboxInput);
}

async function settled(expectedItems: number): Promise<OutboxInput[]> {
  await vi.waitFor(
    () => {
      const items = outbox().filter((o) => o.table === "fizruk_workout_items");
      expect(items.length).toBeGreaterThanOrEqual(expectedItems);
    },
    { timeout: 5000 },
  );
  return outbox();
}

describe("чат log_set → outbox (data-11)", () => {
  it("вправа з каталогу: op має каталожний exercise_id, не порожній", async () => {
    logSet({
      name: "log_set",
      input: {
        exercise_name: "Станова тяга",
        reps: 5,
        weight_kg: 100,
        sets: 2,
      },
    });
    const ops = await settled(1);
    const item = ops.find((o) => o.table === "fizruk_workout_items");
    expect(item?.row["exercise_id"]).toBe("deadlift");
    expect(item?.row["name_uk"]).toBe("Станова тяга");
    // Каталожній вправі custom-рядок не потрібен.
    expect(ops.some((o) => o.table === "fizruk_custom_exercises")).toBe(false);
  });

  it("невідома вправа: custom-вправа в черзі ДО item-а, id збігається", async () => {
    logSet({
      name: "log_set",
      input: {
        exercise_name: "Мій унікальний рух",
        reps: 10,
        weight_kg: 20,
        sets: 3,
      },
    });
    const ops = await settled(1);
    const customIdx = ops.findIndex(
      (o) => o.table === "fizruk_custom_exercises",
    );
    const itemIdx = ops.findIndex((o) => o.table === "fizruk_workout_items");
    expect(customIdx).toBeGreaterThanOrEqual(0);
    expect(itemIdx).toBeGreaterThan(customIdx);

    const itemExerciseId = ops[itemIdx]!.row["exercise_id"];
    expect(itemExerciseId).toMatch(/^custom_/);
    expect(ops[customIdx]!.row["id"]).toBe(itemExerciseId);
  });

  it("два log_set одного ходу з різними кириличними назвами → різні custom-id, назви не змішуються", async () => {
    // Усі tool calls ходу стартують синхронно (`executeActions`), кеш між
    // ними не оновлюється; Date.now() фіксуємо, щоб колізія була гарантована.
    vi.spyOn(Date, "now").mockReturnValue(1_777_000_000_000);
    try {
      logSet({
        name: "log_set",
        input: { exercise_name: "Мій рух А", reps: 10, weight_kg: 20 },
      });
      logSet({
        name: "log_set",
        input: { exercise_name: "Мій рух Б", reps: 12, weight_kg: 25 },
      });
    } finally {
      vi.mocked(Date.now).mockRestore();
    }
    const ops = await settled(2);
    const customs = ops.filter((o) => o.table === "fizruk_custom_exercises");
    const items = ops.filter((o) => o.table === "fizruk_workout_items");
    const byName = new Map(
      customs.map((c) => [
        (JSON.parse(String(c.row["data_json"])) as { name: { uk: string } })
          .name.uk,
        String(c.row["id"]),
      ]),
    );
    expect(byName.size).toBe(2);
    expect(new Set(byName.values()).size).toBe(2);
    const itemIdByName = new Map(
      items.map((it) => [
        String(it.row["name_uk"]),
        String(it.row["exercise_id"]),
      ]),
    );
    // Кожен item посилається на вправу СВОЄЇ назви.
    expect(itemIdByName.get("Мій рух А")).toBe(byName.get("Мій рух А"));
    expect(itemIdByName.get("Мій рух Б")).toBe(byName.get("Мій рух Б"));
  });

  it("жодна оп fizruk_workout_items не йде з порожнім exercise_id", async () => {
    planWorkout({
      name: "plan_workout",
      input: {
        exercises: [
          { name: "Присідання", sets: 3, reps: 10 },
          { name: "Дивна вправа А", sets: 2, reps: 8 },
          { name: "Дивна вправа Б", sets: 2, reps: 8 },
        ],
      },
    });
    const ops = await settled(3);
    const items = ops.filter((o) => o.table === "fizruk_workout_items");
    expect(items).toHaveLength(3);
    for (const it of items) {
      expect(String(it.row["exercise_id"])).not.toBe("");
    }
    // Дві різні невідомі вправи в одному плані мають різні id.
    const ids = items.map((it) => it.row["exercise_id"]);
    expect(new Set(ids).size).toBe(3);
  });

  it("copy_workout лагодить порожній exerciseId зі старого чат-запису", async () => {
    __setFizrukSqliteCacheForTests({
      workouts: [
        {
          id: "w_old",
          startedAt: "2026-04-20T09:00:00.000Z",
          endedAt: "2026-04-20T10:00:00.000Z",
          items: [
            {
              id: "i_old",
              exerciseId: "",
              nameUk: "Станова тяга",
              primaryGroup: "",
              type: "strength",
              musclesPrimary: [],
              musclesSecondary: [],
              sets: [{ weightKg: 100, reps: 5 }],
            },
          ],
          groups: [],
          warmup: null,
          cooldown: null,
          note: "",
        },
      ],
    });
    copyWorkout({
      name: "copy_workout",
      input: { source_workout_id: "w_old" },
    });
    const ops = await settled(1);
    const item = ops.find((o) => o.table === "fizruk_workout_items");
    expect(item?.row["exercise_id"]).toBe("deadlift");
  });
});
