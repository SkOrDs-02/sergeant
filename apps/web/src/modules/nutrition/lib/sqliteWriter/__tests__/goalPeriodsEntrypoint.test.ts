/**
 * W1-KBJU-APPEND, СТАДІЯ 3, PR-1 — доказ, що вхідна точка доходить до журналу.
 *
 * AI-CONTEXT: сусідній `goalPeriods.test.ts` перевіряє diff і адаптер, але
 * будує `NutritionDualWriteState` РУКАМИ. `nutritionStorage.test.ts`
 * перевіряє, що `persistNutritionPrefs` смикає тригер, але сам тригер там
 * замоканий. Тобто ланцюг
 *
 *   persistNutritionPrefs → triggerNutritionDualWrite → diff → INSERT
 *
 * покритий з обох кінців і РОЗІРВАНИЙ посередині: якщо `persistNutritionPrefs`
 * колись перестане ходити через дуал-райт, обидва наявні файли лишаться
 * зеленими, а журнал цілей мовчки перестане наповнюватись.
 *
 * Ціна цієї діри зростає зі стадією 3: щойно девʼять ретроспективних читачів
 * почнуть брати ціль із журналу, ненаписана сходинка означає, що дні після
 * зміни цілі судитимуться СТАРОЮ ціллю. Тому цей тест іде першим PR-ом і
 * нічого, крім себе, не змінює — спека
 * `docs/90-work/planning/specs/nutrition-goal-journal-cutover.md` § PR-1.
 *
 * Тут навмисно НЕ мокається нічого з дуал-райт-конвеєра, окрім вихідного
 * SQLite-клієнта і мережевого outbox-у: сенс тесту саме в тому, щоб проїхати
 * справжнім шляхом.
 */
vi.mock("../../../../../core/syncEngine/enqueueOutboxUpsert.js", () => ({
  enqueueOutboxUpsert: vi.fn().mockResolvedValue({ id: 1, inserted: true }),
}));
vi.mock("../../../../../core/syncEngine/fireSyncOutboxUpsert.js", () => ({
  fireSyncOutboxUpsert: vi.fn(),
}));

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SqliteMigrationClient } from "@sergeant/db-schema/migrate/sqlite";
import { defaultNutritionPrefs } from "@sergeant/nutrition-domain";

import { __setNutritionSqliteCacheForTests } from "../../sqliteReader.js";
import {
  __clearNutritionDualWriteContextForTests,
  registerNutritionDualWriteContext,
} from "../index.js";
import { persistNutritionPrefs } from "../../nutritionStorage.js";

interface RecordedCall {
  sql: string;
  params: unknown[];
}

function makeRecordingClient(): {
  client: SqliteMigrationClient;
  calls: RecordedCall[];
} {
  const calls: RecordedCall[] = [];
  const client = {
    run: vi.fn((sql: string, params: unknown[] = []) => {
      calls.push({ sql, params });
      return Promise.resolve(undefined);
    }),
    all: vi.fn(() => Promise.resolve([])),
    exec: vi.fn(() => Promise.resolve(undefined)),
    get: vi.fn(() => Promise.resolve(undefined)),
  } as unknown as SqliteMigrationClient;
  return { client, calls };
}

/**
 * `triggerNutritionDualWrite` кладе роботу в промісну чергу через
 * `setTimeout(0)`, тож між викликом `persistNutritionPrefs` і записом стоїть
 * і макро-, і мікрозадача. Один `await` тут не досить.
 */
async function flushDualWriteQueue(): Promise<void> {
  for (let i = 0; i < 5; i++) {
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
}

function goalPeriodInserts(calls: RecordedCall[]): RecordedCall[] {
  return calls.filter((c) => c.sql.includes("nutrition_goal_periods"));
}

describe("вхідна точка: persistNutritionPrefs доходить до журналу цілей", () => {
  let recorded: ReturnType<typeof makeRecordingClient>;
  let teardown: () => void;

  beforeEach(() => {
    recorded = makeRecordingClient();
    teardown = registerNutritionDualWriteContext({
      getUserId: () => "user_1",
      getMigrationClient: () => Promise.resolve(recorded.client),
      getNow: () => "2026-09-02T10:00:00.000Z",
    });
    __setNutritionSqliteCacheForTests({
      prefs: { ...defaultNutritionPrefs(), dailyTargetKcal: 2400 },
    });
  });

  afterEach(() => {
    teardown();
    __clearNutritionDualWriteContextForTests();
    __setNutritionSqliteCacheForTests({});
    vi.clearAllMocks();
  });

  it("зміна цілі породжує сходинку журналу з origin='manual'", async () => {
    persistNutritionPrefs({
      ...defaultNutritionPrefs(),
      dailyTargetKcal: 1800,
    });
    await flushDualWriteQueue();

    const inserts = goalPeriodInserts(recorded.calls);
    expect(inserts).toHaveLength(1);
    // `origin` їде параметром, не літералом у SQL — інакше цей assert
    // проходив би на будь-якому INSERT-і в таблицю.
    expect(inserts[0]!.params).toContain("manual");
    expect(inserts[0]!.params).toContain(1800);
  });

  it("зміна НЕ-цільового поля сходинки не породжує", async () => {
    // Дзеркало до попереднього: доказ, що тест вище ловить саме зміну цілі,
    // а не будь-який запис prefs. Без цього обидва assert-и були б зеленими
    // на конвеєрі, який пише сходинку на кожен чих.
    persistNutritionPrefs({
      ...defaultNutritionPrefs(),
      dailyTargetKcal: 2400,
      goal: "cut",
    });
    await flushDualWriteQueue();

    expect(goalPeriodInserts(recorded.calls)).toHaveLength(0);
  });
});
