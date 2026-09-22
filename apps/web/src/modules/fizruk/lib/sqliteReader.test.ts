/**
 * Unit tests for the fizruk SQLite read path (PR #029).
 *
 * Uses the same `createTestSqlite` helper as the fizruk dual-write
 * adapter tests (in-memory `better-sqlite3` with the fizruk client
 * migrations applied), then exercises `refreshFizrukSqliteState` /
 * `getCachedFizrukSqliteState` end-to-end against realistic row shapes.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";

import { applyFizrukDualWriteOps } from "./sqliteWriter/adapter";
import type { FizrukDualWriteOp } from "./sqliteWriter/diff";
import {
  clearFizrukSqliteCache,
  getCachedFizrukSqliteState,
  refreshFizrukSqliteState,
} from "./sqliteReader";
import {
  createTestSqlite,
  type TestSqliteHandle,
} from "./sqliteWriter/__tests__/testSqlite";

const UID = "user-1";
const TS = "2026-05-01T10:00:00.000Z";

let handle: TestSqliteHandle;

beforeEach(async () => {
  handle = await createTestSqlite();
  clearFizrukSqliteCache();
});
afterEach(() => handle.close());

const silentLogger = () => {};

describe("refreshFizrukSqliteState", () => {
  it("returns empty cache for a fresh DB and stamps refreshedAt", async () => {
    const cache = await refreshFizrukSqliteState(handle.client, UID);
    expect(cache.workouts).toEqual([]);
    expect(cache.customExercises).toEqual([]);
    expect(cache.measurements).toEqual([]);
    expect(cache.injuries).toEqual([]);
    expect(cache.refreshedAt).not.toBeNull();
  });

  it("hydrates workouts with items and sets in deterministic order", async () => {
    const ops: FizrukDualWriteOp[] = [
      {
        kind: "workout-upsert",
        workout: {
          id: "w1",
          startedAt: "2026-05-01T10:00:00Z",
          endedAt: null,
          items: [
            {
              id: "i1",
              exerciseId: "bench-press",
              nameUk: "Жим лежачи",
              primaryGroup: "chest",
              musclesPrimary: ["chest"],
              musclesSecondary: ["triceps"],
              type: "strength",
              sets: [
                { weightKg: 80, reps: 8 },
                { weightKg: 85, reps: 6, rpe: 8 },
              ],
            },
          ],
          groups: [],
          warmup: null,
          cooldown: null,
          note: "morning session",
        },
      },
    ];
    await applyFizrukDualWriteOps(handle.client, ops, {
      userId: UID,
      clientTs: TS,
      logger: silentLogger,
    });

    const cache = await refreshFizrukSqliteState(handle.client, UID);
    expect(cache.workouts).toHaveLength(1);
    const w = cache.workouts[0];
    expect(w!.id!).toBe("w1");
    expect(w!.note!).toBe("morning session");
    expect(w!.items!).toHaveLength(1);
    const item = w!.items[0]!;
    expect(item.id!).toBe("i1");
    expect(item.exerciseId!).toBe("bench-press");
    expect(item.nameUk!).toBe("Жим лежачи");
    expect(item.musclesPrimary!).toEqual(["chest"]);
    expect(item.sets!).toEqual([
      { weightKg: 80, reps: 8 },
      { weightKg: 85, reps: 6, rpe: 8 },
    ]);
  });

  // Браузерне QA 2026-08-23: «енергія / настрій» з аркуша фінішу
  // зберігались у `fizruk_workouts.wellbeing_json`, але читач їх не мапив,
  // тож на збереженому тренуванні саммарі не показувало самопочуття взагалі.
  it("hydrates the post-workout wellbeing snapshot", async () => {
    const ops: FizrukDualWriteOp[] = [
      {
        kind: "workout-upsert",
        workout: {
          id: "w-wb",
          startedAt: "2026-05-01T10:00:00Z",
          endedAt: "2026-05-01T11:00:00Z",
          items: [],
          groups: [],
          warmup: null,
          cooldown: null,
          note: "",
          wellbeing: { energy: 4, mood: 3 },
        },
      },
    ];
    await applyFizrukDualWriteOps(handle.client, ops, {
      userId: UID,
      clientTs: TS,
      logger: silentLogger,
    });

    const cache = await refreshFizrukSqliteState(handle.client, UID);
    expect(cache.workouts[0]?.wellbeing).toEqual({ energy: 4, mood: 3 });
  });

  // Спека fizruk-readiness-check § Верифікація: обовʼязковий тест на
  // мовчазну втрату. Готовність і вибір варіанта проходять ЧОТИРИ ланки
  // (снапшот → колонка → адаптер → читач); пропуск будь-якої не ламає ані
  // типи, ані решту тестів, а фіча просто перестає працювати.
  it("готовність і вибір варіанта переживають перезавантаження", async () => {
    const ops: FizrukDualWriteOp[] = [
      {
        kind: "workout-upsert",
        workout: {
          id: "w-readiness",
          startedAt: "2026-09-02T10:00:00Z",
          endedAt: "2026-09-02T11:00:00Z",
          items: [
            {
              id: "i-readiness",
              exerciseId: "squat",
              nameUk: "Присідання",
              primaryGroup: "legs",
              musclesPrimary: [],
              musclesSecondary: [],
              type: "strength",
              chosenVariant: "easier",
            },
          ],
          groups: [],
          warmup: null,
          cooldown: null,
          note: "",
          wellbeing: { sleep: 2, soreness: 1 },
        },
      },
    ];
    await applyFizrukDualWriteOps(handle.client, ops, {
      userId: UID,
      clientTs: TS,
      logger: silentLogger,
    });

    const cache = await refreshFizrukSqliteState(handle.client, UID);
    const workout = cache.workouts.find((w) => w.id === "w-readiness");
    expect(workout?.wellbeing).toEqual({ sleep: 2, soreness: 1 });
    expect(workout?.items[0]?.chosenVariant).toBe("easier");
  });

  it("leaves wellbeing null when the workout has none", async () => {
    const ops: FizrukDualWriteOp[] = [
      {
        kind: "workout-upsert",
        workout: {
          id: "w-no-wb",
          startedAt: "2026-05-01T10:00:00Z",
          endedAt: null,
          items: [],
          groups: [],
          warmup: null,
          cooldown: null,
          note: "",
        },
      },
    ];
    await applyFizrukDualWriteOps(handle.client, ops, {
      userId: UID,
      clientTs: TS,
      logger: silentLogger,
    });

    const cache = await refreshFizrukSqliteState(handle.client, UID);
    expect(cache.workouts[0]?.wellbeing ?? null).toBeNull();
  });

  it("filters out other users' rows", async () => {
    const otherOps: FizrukDualWriteOp[] = [
      {
        kind: "workout-upsert",
        workout: {
          id: "w-other",
          startedAt: "2026-05-01T10:00:00Z",
          endedAt: null,
          items: [],
          groups: [],
          warmup: null,
          cooldown: null,
          note: "",
        },
      },
    ];
    await applyFizrukDualWriteOps(handle.client, otherOps, {
      userId: "user-2",
      clientTs: TS,
      logger: silentLogger,
    });

    const cache = await refreshFizrukSqliteState(handle.client, UID);
    expect(cache.workouts).toEqual([]);
  });

  it("excludes soft-deleted workouts and items", async () => {
    const ops: FizrukDualWriteOp[] = [
      {
        kind: "workout-upsert",
        workout: {
          id: "w-keep",
          startedAt: "2026-05-01T10:00:00Z",
          endedAt: null,
          items: [],
          groups: [],
          warmup: null,
          cooldown: null,
          note: "keep",
        },
      },
      {
        kind: "workout-upsert",
        workout: {
          id: "w-del",
          startedAt: "2026-05-01T11:00:00Z",
          endedAt: null,
          items: [],
          groups: [],
          warmup: null,
          cooldown: null,
          note: "delete me",
        },
      },
    ];
    await applyFizrukDualWriteOps(handle.client, ops, {
      userId: UID,
      clientTs: TS,
      logger: silentLogger,
    });
    await applyFizrukDualWriteOps(
      handle.client,
      [{ kind: "workout-delete", workoutId: "w-del" }],
      {
        userId: UID,
        clientTs: "2026-05-01T12:00:00.000Z",
        logger: silentLogger,
      },
    );

    const cache = await refreshFizrukSqliteState(handle.client, UID);
    expect(cache.workouts.map((w) => w.id)).toEqual(["w-keep"]);
  });

  it("hydrates custom exercises and measurements", async () => {
    const ops: FizrukDualWriteOp[] = [
      {
        kind: "custom-exercise-upsert",
        exercise: {
          id: "ex-custom-1",
          nameUk: "Своя вправа",
          primaryGroup: "back",
          musclesPrimary: ["back"],
          musclesSecondary: [],
          type: "strength",
        },
      },
      {
        kind: "measurement-upsert",
        measurement: {
          id: "m-1",
          at: "2026-05-01T08:00:00.000Z",
          weightKg: 80.4,
          waistCm: 82,
        },
      },
    ];
    await applyFizrukDualWriteOps(handle.client, ops, {
      userId: UID,
      clientTs: TS,
      logger: silentLogger,
    });

    const cache = await refreshFizrukSqliteState(handle.client, UID);
    expect(cache.customExercises).toHaveLength(1);
    expect(cache.customExercises[0]!.id).toBe("ex-custom-1");
    expect(cache.measurements).toHaveLength(1);
    expect(cache.measurements[0]!.id).toBe("m-1");
  });

  it("доносить УСІ чотирнадцять полів заміру, а не вісім", async () => {
    // Регресія (знайдено 2026-09-22): таблиця несла вісім числових колонок
    // — рівно ті, що доменний реєстр звузив для мобільного, — а веб-форма
    // (`MEASURE_FIELDS`) збирає чотирнадцять. Жир, шия, передпліччя,
    // стегно, литка і РІЗНІ ліва/права сторони не мали куди писатись, тож
    // користувач їх вводив, а після перезавантаження вони зникали.
    // Міграція 008 / серверна 146 додала колонки.
    const full = {
      id: "m-full",
      at: "2026-05-01T08:00:00.000Z",
      weightKg: 81.4,
      bodyFatPct: 18.5,
      neckCm: 39.5,
      chestCm: 104.5,
      waistCm: 82.5,
      hipsCm: 98.5,
      bicepLCm: 36.5,
      bicepRCm: 37.5,
      forearmLCm: 29.5,
      forearmRCm: 30.5,
      thighLCm: 58.5,
      thighRCm: 59.5,
      calfLCm: 38.5,
      calfRCm: 39.5,
    };
    await applyFizrukDualWriteOps(
      handle.client,
      [{ kind: "measurement-upsert", measurement: full }],
      { userId: UID, clientTs: TS, logger: silentLogger },
    );

    const cache = await refreshFizrukSqliteState(handle.client, UID);
    expect(cache.measurements).toEqual([full]);
    // Дробові значення не округлюються — колонки REAL, а сторони
    // лишаються різними (раніше єдиний `bicep_cm` зводив їх в одне).
    expect(cache.measurements[0]!["bicepLCm"]).toBe(36.5);
    expect(cache.measurements[0]!["bicepRCm"]).toBe(37.5);
  });

  it("для рядка, записаного до міграції 008, зводить біцепс із bicep_cm", async () => {
    // Історія на пристрої, який щойно оновився: нові колонки в старих
    // рядках NULL, і без фолбеку біцепс показувався б порожнім.
    await handle.client.run(
      `INSERT INTO fizruk_measurements
         (id, user_id, measured_at, bicep_cm, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
      ["m-legacy", UID, "2026-04-01T08:00:00.000Z", 35.5, TS, TS],
    );

    const cache = await refreshFizrukSqliteState(handle.client, UID);
    expect(cache.measurements).toEqual([
      {
        id: "m-legacy",
        at: "2026-04-01T08:00:00.000Z",
        bicepLCm: 35.5,
        bicepRCm: 35.5,
      },
    ]);
  });

  it("hydrates daily-log entries with their timestamp intact", async () => {
    // Regression: the table column is `entry_at` while the cached shape is
    // `at` — without the SQL alias the timestamp silently became undefined.
    const ops: FizrukDualWriteOp[] = [
      {
        kind: "daily-log-upsert",
        entry: {
          id: "dl-1",
          at: "2026-05-01T07:00:00Z",
          weightKg: 81.2,
          sleepHours: 7.5,
          energyLevel: 4,
          mood: 3,
          note: "ранковий запис",
        },
      },
    ];
    await applyFizrukDualWriteOps(handle.client, ops, {
      userId: UID,
      clientTs: TS,
      logger: silentLogger,
    });

    const cache = await refreshFizrukSqliteState(handle.client, UID);
    expect(cache.dailyLog).toHaveLength(1);
    expect(cache.dailyLog[0]!.at).toBe("2026-05-01T07:00:00Z");
    expect(cache.dailyLog[0]!.weightKg).toBe(81.2);
  });

  it("hydrates open and cleared injury marks newest-first", async () => {
    await handle.client.run(
      `INSERT INTO fizruk_injuries
         (id, user_id, site, started_at, cleared_at, note)
       VALUES (?, ?, ?, ?, ?, ?), (?, ?, ?, ?, ?, ?)`,
      [
        "inj-old",
        UID,
        "chest",
        "2026-05-01T07:00:00.000Z",
        "2026-05-02T07:00:00.000Z",
        "",
        "inj-new",
        UID,
        "knee",
        "2026-05-03T07:00:00.000Z",
        null,
        "",
      ],
    );

    const cache = await refreshFizrukSqliteState(handle.client, UID);
    // `knee` is a joint, not an atlas muscle — the reader must carry the
    // wider ADR-0083 keyspace through untouched.
    expect(cache.injuries).toEqual([
      {
        id: "inj-new",
        site: "knee",
        startedAt: "2026-05-03T07:00:00.000Z",
        clearedAt: null,
        note: "",
      },
      {
        id: "inj-old",
        site: "chest",
        startedAt: "2026-05-01T07:00:00.000Z",
        clearedAt: "2026-05-02T07:00:00.000Z",
        note: "",
      },
    ]);
  });
  it("returns the empty cache before any refresh", () => {
    const cache = getCachedFizrukSqliteState();
    expect(cache.refreshedAt).toBeNull();
    expect(cache.workouts).toEqual([]);
  });

  it("returns the most recent refreshed cache after refresh", async () => {
    const ops: FizrukDualWriteOp[] = [
      {
        kind: "workout-upsert",
        workout: {
          id: "w1",
          startedAt: "2026-05-01T10:00:00Z",
          endedAt: null,
          items: [],
          groups: [],
          warmup: null,
          cooldown: null,
          note: "",
        },
      },
    ];
    await applyFizrukDualWriteOps(handle.client, ops, {
      userId: UID,
      clientTs: TS,
      logger: silentLogger,
    });
    await refreshFizrukSqliteState(handle.client, UID);

    const cache = getCachedFizrukSqliteState();
    expect(cache.refreshedAt).not.toBeNull();
    expect(cache.workouts).toHaveLength(1);
  });
});
