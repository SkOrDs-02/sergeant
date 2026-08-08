// @vitest-environment jsdom
/**
 * Last validated: 2026-08-08
 * Status: Active
 */
import { describe, it, expect, beforeEach } from "vitest";

import {
  importFizrukDemoSeed,
  readFizrukDemoStateFromLs,
} from "./demoSeedImport";

const WORKOUTS_KEY = "fizruk_workouts_v1";
const MEASUREMENTS_KEY = "fizruk_measurements_v1"; // gitleaks:allow

/** Мінімальна форма того, що реально пише `seedFizruk()`. */
function seedLikePayload() {
  return {
    schemaVersion: 1,
    workouts: [
      {
        id: "demo_wo_1",
        startedAt: "2026-08-07T18:30:00.000Z",
        endedAt: "2026-08-07T19:25:00.000Z",
        note: "",
        warmup: null,
        cooldown: null,
        groups: [],
        items: [
          {
            id: "demo_wi_1",
            exerciseId: "squat",
            nameUk: "Присідання зі штангою",
            primaryGroup: "quadriceps",
            musclesPrimary: ["quadriceps"],
            musclesSecondary: [],
            type: "strength",
            sets: [{ weightKg: 60, reps: 10 }],
          },
        ],
      },
    ],
  };
}

describe("readFizrukDemoStateFromLs", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("повертає null, коли демо-payload у LS немає", () => {
    expect(readFizrukDemoStateFromLs()).toBeNull();
  });

  it("повертає null на порожніх колекціях — лити нема чого", () => {
    localStorage.setItem(
      WORKOUTS_KEY,
      JSON.stringify({ schemaVersion: 1, workouts: [] }),
    );
    localStorage.setItem(MEASUREMENTS_KEY, JSON.stringify([]));
    expect(readFizrukDemoStateFromLs()).toBeNull();
  });

  it("збирає стан із тренувань і замірів, які пише демо-сід", () => {
    localStorage.setItem(WORKOUTS_KEY, JSON.stringify(seedLikePayload()));
    localStorage.setItem(
      MEASUREMENTS_KEY,
      JSON.stringify([
        { id: "demo_m_1", at: "2026-08-07T08:00:00.000Z", weight: 78.4 },
      ]),
    );

    const state = readFizrukDemoStateFromLs();

    expect(state?.workouts).toHaveLength(1);
    expect(state?.measurements).toHaveLength(1);
    expect(state?.workouts[0]).toMatchObject({ id: "demo_wo_1" });
  });

  it("переживає побитий JSON без винятку", () => {
    localStorage.setItem(WORKOUTS_KEY, "{не json");
    expect(() => readFizrukDemoStateFromLs()).not.toThrow();
  });
});

describe("importFizrukDemoSeed", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  /**
   * Фейк-клієнт: збирає SQL, який на нього виллють. Нам не треба
   * справжній sqlite — важливо, що demo-payload ПЕРЕТВОРЮЄТЬСЯ на
   * операції запису, бо саме цієї ланки не було (аудит L-8): сід писав
   * у LS, модуль читав із SQLite, і між ними після видалення
   * residual-дренажу не лишилось нічого.
   */
  function makeClient() {
    const sql: string[] = [];
    return {
      sql,
      client: {
        exec: (statement: string) => {
          sql.push(statement);
        },
        run: (statement: string) => {
          sql.push(statement);
        },
        all: () => [],
      },
    };
  }

  it("нічого не робить, коли демо-payload порожній", async () => {
    const { client, sql } = makeClient();

    const applied = await importFizrukDemoSeed({
      client,
      userId: "demo-local",
      nowIso: "2026-08-08T10:00:00.000Z",
    });

    expect(applied).toBe(0);
    expect(sql).toHaveLength(0);
  });

  it("перетворює засіяні тренування на записи в SQLite", async () => {
    localStorage.setItem(WORKOUTS_KEY, JSON.stringify(seedLikePayload()));
    const { client, sql } = makeClient();

    const applied = await importFizrukDemoSeed({
      client,
      userId: "demo-local",
      nowIso: "2026-08-08T10:00:00.000Z",
    });

    expect(applied).toBeGreaterThan(0);
    expect(sql.join(" ")).toMatch(/fizruk_workouts/i);
  });

  it("не кидає, коли sqlite падає — демо не має права завалити бут", async () => {
    localStorage.setItem(WORKOUTS_KEY, JSON.stringify(seedLikePayload()));
    const failing = {
      exec: () => {
        throw new Error("sqlite down");
      },
      run: () => {
        throw new Error("sqlite down");
      },
      all: () => [],
    };

    await expect(
      importFizrukDemoSeed({
        client: failing,
        userId: "demo-local",
        nowIso: "2026-08-08T10:00:00.000Z",
      }),
    ).resolves.toBe(0);
  });

  it("ідемпотентний: другий прогін дає ті самі операції, не подвоєні", async () => {
    localStorage.setItem(WORKOUTS_KEY, JSON.stringify(seedLikePayload()));
    const first = makeClient();
    const second = makeClient();

    const a = await importFizrukDemoSeed({
      client: first.client,
      userId: "demo-local",
      nowIso: "2026-08-08T10:00:00.000Z",
    });
    const b = await importFizrukDemoSeed({
      client: second.client,
      userId: "demo-local",
      nowIso: "2026-08-08T10:00:00.000Z",
    });

    expect(b).toBe(a);
  });
});
