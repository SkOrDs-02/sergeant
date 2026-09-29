/**
 * Last validated: 2026-09-22
 * Status: Active
 *
 * Замкнене коло бекапу Фізрука: внести тренування, замір, щоденник і
 * шаблон → експорт → очистити пристрій → імпорт → усе на місці.
 *
 * Сестра `hubBackup.roundtrip.test.ts` (Фінік). Той самий дефект і той
 * самий спосіб його не побачити: `hubBackup.apply.test.ts` мокає всі
 * чотири модульні адаптери, тож бачить лише «яку функцію покликали».
 * Функцію кликали — а експорт читав шість `fizruk_*` ключів
 * localStorage, у які від Stage 8 не пише ніхто, і імпорт писав туди ж,
 * тоді як усі хуки Фізрука читають `getCachedFizrukSqliteState()`.
 *
 * Тут реальні: `fizrukStorage.ts`, `fizrukDualWriteState`, увесь
 * `sqliteWriter/*`, `sqliteReader` і справжній in-memory SQLite
 * (better-sqlite3) з накатаними міграціями Фізрука. Замокані лише три
 * інші модулі (мають власні сьюти) і `enqueueOutboxUpsert` — таблиці
 * `sync_op_outbox` у тестовій БД немає.
 */
/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../syncEngine/enqueueOutboxUpsert.js", () => ({
  enqueueOutboxUpsert: vi.fn().mockResolvedValue({ id: 1, inserted: true }),
}));

vi.mock("../../modules/finyk/lib/finykBackup", () => ({
  normalizeFinykBackup: (v: unknown) => v,
  readFinykBackupFromStorage: () => ({}),
  persistFinykNormalizedToStorage: vi.fn(),
  persistFinykNormalizedToSqlite: vi.fn(async () => {}),
}));

vi.mock("../../modules/routine/lib/routineStorage", () => ({
  buildRoutineBackupPayload: () => ({ routine: true }),
  applyRoutineBackupPayload: vi.fn(),
}));

vi.mock("../../modules/nutrition/domain/nutritionBackup", () => ({
  buildNutritionBackupPayload: () => ({ nutrition: true }),
  applyNutritionBackupPayload: vi.fn(),
}));

import {
  createTestSqlite,
  type TestSqliteHandle,
} from "../../modules/fizruk/lib/sqliteWriter/__tests__/testSqlite.js";
import {
  __clearFizrukDualWriteContextForTests,
  dualWriteFizrukState,
  registerFizrukDualWriteContext,
} from "../../modules/fizruk/lib/sqliteWriter/index.js";
import type { FizrukDualWriteState } from "../../modules/fizruk/lib/sqliteWriter/diff/index.js";
import {
  clearFizrukSqliteCache,
  getCachedFizrukSqliteState,
  refreshFizrukSqliteState,
} from "../../modules/fizruk/lib/sqliteReader.js";
import { applyHubBackupPayload, buildHubBackupPayload } from "./hubBackup";

const USER_ID = "u-fizruk-roundtrip";

const WORKOUT = {
  id: "w-1",
  startedAt: "2026-09-01T07:00:00.000Z",
  endedAt: "2026-09-01T08:05:00.000Z",
  note: "Груди й спина",
  kcalBurned: 420,
  items: [
    {
      id: "wi-1",
      exerciseId: "bench-press",
      nameUk: "Жим лежачи",
      sets: [
        { id: "ws-1", weightKg: 60, reps: 10 },
        { id: "ws-2", weightKg: 70, reps: 8 },
      ],
    },
  ],
};

const MEASUREMENT = {
  id: "m-1",
  at: "2026-09-01T06:30:00.000Z",
  weightKg: 82.4,
  waistCm: 88,
};

const DAILY_LOG = {
  id: "dl-1",
  at: "2026-09-01T06:00:00.000Z",
  weightKg: 82.4,
  sleepHours: 7.5,
  energyLevel: 4,
  moodScore: 4,
  note: "Виспався",
};

const TEMPLATE = {
  id: "tpl-1",
  name: "Верх тіла",
  exerciseIds: ["bench-press", "row"],
  groups: [],
  updatedAt: "2026-08-30T10:00:00.000Z",
  lastUsedAt: null,
};

const CUSTOM_EXERCISE = { id: "ce-1", nameUk: "Тяга гумки" };
const INJURY = {
  id: "inj-1",
  site: "shoulder",
  startedAt: "2026-08-20T00:00:00.000Z",
  clearedAt: null,
  note: "Не тиснути над головою",
};

const SEED: FizrukDualWriteState = {
  workouts: [
    {
      id: WORKOUT.id,
      startedAt: WORKOUT.startedAt,
      endedAt: WORKOUT.endedAt,
      note: WORKOUT.note,
      kcalBurned: WORKOUT.kcalBurned,
      groups: [],
      warmup: null,
      cooldown: null,
      wellbeing: null,
      items: [
        {
          id: "wi-1",
          exerciseId: "bench-press",
          nameUk: "Жим лежачи",
          primaryGroup: "chest",
          musclesPrimary: ["chest"],
          musclesSecondary: ["triceps"],
          type: "strength",
          sets: [
            { id: "ws-1", weightKg: 60, reps: 10 },
            { id: "ws-2", weightKg: 70, reps: 8 },
          ],
        },
      ],
    },
  ],
  customExercises: [CUSTOM_EXERCISE],
  customActivities: [],
  measurements: [MEASUREMENT],
  dailyLog: [
    {
      id: DAILY_LOG.id,
      at: DAILY_LOG.at,
      weightKg: DAILY_LOG.weightKg,
      sleepHours: DAILY_LOG.sleepHours,
      energyLevel: DAILY_LOG.energyLevel,
      mood: DAILY_LOG.moodScore,
      note: DAILY_LOG.note,
    },
  ],
  monthlyPlan: {
    dataJson: JSON.stringify({
      reminderEnabled: true,
      reminderHour: 19,
      reminderMinute: 30,
      days: { "2026-09-03": { templateId: TEMPLATE.id } },
    }),
  },
  workoutTemplates: [TEMPLATE],
  injuries: [INJURY],
};

const EMPTY: FizrukDualWriteState = {
  workouts: [],
  customExercises: [],
  customActivities: [],
  measurements: [],
  dailyLog: [],
  monthlyPlan: null,
  workoutTemplates: [],
  injuries: [],
};

const FIZRUK_TABLES = [
  "fizruk_workout_sets",
  "fizruk_workout_items",
  "fizruk_workouts",
  "fizruk_custom_exercises",
  "fizruk_custom_activities",
  "fizruk_measurements",
  "fizruk_daily_log",
  "fizruk_workout_templates",
  "fizruk_injuries",
  "fizruk_monthly_plan",
];

let handle: TestSqliteHandle;
let clock = Date.parse("2026-09-22T10:00:00.000Z");

beforeEach(async () => {
  localStorage.clear();
  clearFizrukSqliteCache();
  __clearFizrukDualWriteContextForTests();
  handle = await createTestSqlite();
  registerFizrukDualWriteContext({
    getUserId: () => USER_ID,
    getMigrationClient: async () => handle.client,
    // Монотонний годинник: LWW-гард адаптера строго `>`, а імпорт
    // перезаписує ті самі рядки, що й сід.
    getNow: () => new Date((clock += 1000)).toISOString(),
    logger: () => {},
  });
});

afterEach(() => {
  handle.close();
  __clearFizrukDualWriteContextForTests();
  clearFizrukSqliteCache();
  vi.clearAllMocks();
});

/** Імітує сесію користувача: вносить дані через справжній writer. */
async function seedFizruk(): Promise<void> {
  const outcome = await dualWriteFizrukState(EMPTY, SEED);
  expect(outcome.status).toBe("applied");
  await refreshFizrukSqliteState(handle.client, USER_ID);
}

/** Новий пристрій: жодного рядка Фізрука й холодний кеш. */
async function wipeDevice(): Promise<void> {
  for (const table of FIZRUK_TABLES) {
    await handle.client.run(`DELETE FROM ${table}`, []);
  }
  localStorage.clear();
  clearFizrukSqliteCache();
  await refreshFizrukSqliteState(handle.client, USER_ID);
}

describe("Hub backup — коло експорт → очистка → імпорт (Фізрук, справжній SQLite)", () => {
  it("повертає тренування, замір, щоденник, шаблон і травму після імпорту", async () => {
    await seedFizruk();
    expect(getCachedFizrukSqliteState().workouts).toHaveLength(1);

    const payload = buildHubBackupPayload();
    // Експорт бере дані з теплого кеша, а не з мертвих LS-ключів.
    const data = (payload.fizruk as { data: Record<string, string | null> })
      .data;
    expect(JSON.parse(data["fizruk_workouts_v1"] as string)).toMatchObject({
      workouts: [{ id: WORKOUT.id }],
    });
    expect(JSON.parse(data["fizruk_measurements_v1"] as string)).toHaveLength(
      1,
    );
    expect(JSON.parse(data["fizruk_daily_log_v1"] as string)).toHaveLength(1);
    expect(
      JSON.parse(data["fizruk_workout_templates_v1"] as string),
    ).toHaveLength(1);
    expect(JSON.parse(data["fizruk_injuries_v1"] as string)).toHaveLength(1);

    await wipeDevice();
    expect(getCachedFizrukSqliteState().workouts).toEqual([]);
    expect(getCachedFizrukSqliteState().measurements).toEqual([]);

    await applyHubBackupPayload(JSON.parse(JSON.stringify(payload)));
    await refreshFizrukSqliteState(handle.client, USER_ID);

    const cache = getCachedFizrukSqliteState();
    expect(cache.workouts).toHaveLength(1);
    expect(cache.workouts[0]).toMatchObject({
      id: WORKOUT.id,
      startedAt: WORKOUT.startedAt,
      note: WORKOUT.note,
      kcalBurned: WORKOUT.kcalBurned,
    });
    // Вкладені підходи їдуть окремими таблицями — перевіряємо, що дерево
    // відновилось цілим, а не самою шапкою тренування.
    expect(cache.workouts[0]?.items?.[0]?.sets).toEqual([
      expect.objectContaining({ weightKg: 60, reps: 10 }),
      expect.objectContaining({ weightKg: 70, reps: 8 }),
    ]);
    expect(cache.measurements).toMatchObject([
      { id: MEASUREMENT.id, weightKg: 82.4, waistCm: 88 },
    ]);
    expect(cache.dailyLog).toMatchObject([
      { id: DAILY_LOG.id, sleepHours: 7.5, note: "Виспався" },
    ]);
    expect(cache.workoutTemplates).toMatchObject([
      { id: TEMPLATE.id, name: "Верх тіла" },
    ]);
    expect(cache.customExercises).toMatchObject([{ id: CUSTOM_EXERCISE.id }]);
    expect(cache.injuries).toMatchObject([
      { id: INJURY.id, site: "shoulder", clearedAt: null },
    ]);
    expect(cache.monthlyPlan).toMatchObject({
      reminderHour: 19,
      reminderMinute: 30,
    });
  });

  it("пише саме в SQLite-таблиці, а не лише в localStorage", async () => {
    await seedFizruk();
    const payload = buildHubBackupPayload();
    await wipeDevice();

    await applyHubBackupPayload(JSON.parse(JSON.stringify(payload)));

    const rows = await handle.client.all<{ id: string }>(
      `SELECT id FROM fizruk_workouts
        WHERE user_id = ? AND deleted_at IS NULL`,
      [USER_ID],
    );
    expect(rows.map((r) => r.id)).toEqual([WORKOUT.id]);
    const sets = await handle.client.all<{ id: string }>(
      `SELECT id FROM fizruk_workout_sets
        WHERE user_id = ? AND deleted_at IS NULL ORDER BY id ASC`,
      [USER_ID],
    );
    // Id підходу синтезує writer із id вправи та порядкового номера —
    // власний `ws-*` з payload-а сюди не доїжджає, і це не регресія.
    expect(sets.map((r) => r.id)).toEqual(["wi-1:s0", "wi-1:s1"]);
  });

  it("замінює дані пристрою, а не зливає їх із бекапом", async () => {
    await seedFizruk();
    const payload = buildHubBackupPayload();

    // Після експорту користувач записав ще одне тренування — діалог
    // імпорту обіцяє «повністю замінить ці дані», тож його має не стати.
    const later: FizrukDualWriteState = {
      ...SEED,
      workouts: [
        ...SEED.workouts,
        {
          id: "w-later",
          startedAt: "2026-09-20T07:00:00.000Z",
          endedAt: null,
          note: "",
          kcalBurned: null,
          groups: [],
          warmup: null,
          cooldown: null,
          wellbeing: null,
          items: [],
        },
      ],
    };
    await dualWriteFizrukState(SEED, later);
    await refreshFizrukSqliteState(handle.client, USER_ID);
    expect(getCachedFizrukSqliteState().workouts).toHaveLength(2);

    await applyHubBackupPayload(JSON.parse(JSON.stringify(payload)));
    await refreshFizrukSqliteState(handle.client, USER_ID);

    expect(getCachedFizrukSqliteState().workouts.map((w) => w.id)).toEqual([
      WORKOUT.id,
    ]);
  });

  it("читає файли, експортовані до переїзду на SQLite (ті самі ключі, ті самі рядки)", async () => {
    await applyHubBackupPayload({
      kind: "hub-backup",
      schemaVersion: 1,
      exportedAt: "2026-09-22T10:00:00.000Z",
      finyk: null,
      routine: null,
      nutrition: null,
      fizruk: {
        kind: "fizruk-full-backup",
        schemaVersion: 1,
        exportedAt: "2026-05-01T00:00:00.000Z",
        data: {
          // Легасі-формат: масив без версійного конверта.
          fizruk_workouts_v1: JSON.stringify([
            {
              id: "w-legacy",
              startedAt: "2026-05-01T07:00:00.000Z",
              items: [],
            },
          ]),
          fizruk_selected_template_id_v1: "tpl-legacy",
        },
      },
    });
    await refreshFizrukSqliteState(handle.client, USER_ID);

    expect(getCachedFizrukSqliteState().workouts.map((w) => w.id)).toEqual([
      "w-legacy",
    ]);
  });
});
