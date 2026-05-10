/**
 * Mobile mirror of `apps/web/src/modules/fizruk/lib/dualWrite/__tests__/parity.test.ts`.
 *
 * Stage 12 / PR #070f-mobile-dualwrite — validates that
 * `probeFizrukParity` reports `match` when MMKV-derived state and
 * SQLite agree across all six entity classes, and `mismatch` (with
 * class-level details) when they disagree.
 */
import Database from "better-sqlite3";
import type { SqliteMigrationClient } from "@sergeant/db-schema/migrate/sqlite";

import { migrateFizruk } from "../../clientMigrate";
import { applyFizrukDualWriteOps } from "../adapter";
import type { FizrukDualWriteState } from "../diff";
import { probeFizrukParity } from "../parity";

function syncClient(db: ReturnType<typeof Database>): SqliteMigrationClient {
  return {
    exec(sql) {
      db.exec(sql);
    },
    run(sql, params) {
      db.prepare(sql).run(...((params ?? []) as unknown[]));
    },
    all<R extends Record<string, unknown>>(
      sql: string,
      params?: readonly unknown[],
    ): R[] {
      const stmt = db.prepare(sql);
      const result = params ? stmt.all(...(params as unknown[])) : stmt.all();
      return result as R[];
    },
  };
}

const UID = "user-1";
const TS1 = "2026-05-01T10:00:00.000Z";

const EMPTY: FizrukDualWriteState = {
  workouts: [],
  customExercises: [],
  measurements: [],
  dailyLog: [],
  monthlyPlan: null,
  workoutTemplates: [],
  programs: null,
  planTemplate: null,
  wellbeing: [],
};

describe("probeFizrukParity (mobile)", () => {
  let db: ReturnType<typeof Database>;
  let client: SqliteMigrationClient;

  beforeEach(async () => {
    db = new Database(":memory:");
    client = syncClient(db);
    await migrateFizruk(client);
  });

  afterEach(() => {
    db.close();
  });

  it("reports match when both LS and SQLite are empty", async () => {
    const outcome = await probeFizrukParity(client, UID, EMPTY);
    expect(outcome.result).toBe("match");
  });

  it("reports match after a full Stage 12 dual-write apply", async () => {
    const state: FizrukDualWriteState = {
      ...EMPTY,
      dailyLog: [
        {
          id: "d1",
          at: "2026-05-01T07:00:00Z",
          weightKg: 80,
          sleepHours: 7,
          energyLevel: 6,
          mood: 5,
          note: "",
        },
      ],
      monthlyPlan: { dataJson: '{"days":{}}' },
      workoutTemplates: [
        {
          id: "t1",
          name: "Push",
          exerciseIds: ["bench-press"],
          groups: [],
          updatedAt: TS1,
        },
      ],
    };

    await applyFizrukDualWriteOps(
      client,
      [
        {
          kind: "daily-log-upsert",
          entry: state.dailyLog![0]!,
        },
        { kind: "monthly-plan-set", monthlyPlan: state.monthlyPlan! },
        {
          kind: "workout-template-upsert",
          template: state.workoutTemplates![0]!,
        },
      ],
      { userId: UID, clientTs: TS1 },
    );

    const outcome = await probeFizrukParity(client, UID, state);
    expect(outcome.result).toBe("match");
  });

  it("reports mismatch when SQLite is missing a daily-log present in LS", async () => {
    const state: FizrukDualWriteState = {
      ...EMPTY,
      dailyLog: [
        {
          id: "d1",
          at: "2026-05-01T07:00:00Z",
          weightKg: null,
          sleepHours: null,
          energyLevel: null,
          mood: null,
          note: "",
        },
      ],
    };
    const outcome = await probeFizrukParity(client, UID, state);
    expect(outcome.result).toBe("mismatch");
    expect(outcome.details).toMatchObject({
      dailyLog: { ls: 1, sqlite: 0, lsOnly: 1, sqliteOnly: 0 },
    });
  });

  it("reports mismatch when SQLite has a stale monthly-plan blob", async () => {
    await applyFizrukDualWriteOps(
      client,
      [
        {
          kind: "monthly-plan-set",
          monthlyPlan: { dataJson: '{"v":"sqlite"}' },
        },
      ],
      { userId: UID, clientTs: TS1 },
    );
    const state: FizrukDualWriteState = {
      ...EMPTY,
      monthlyPlan: { dataJson: '{"v":"ls"}' },
    };
    const outcome = await probeFizrukParity(client, UID, state);
    expect(outcome.result).toBe("mismatch");
  });

  it("reports mismatch when workout-template id-sets diverge", async () => {
    await applyFizrukDualWriteOps(
      client,
      [
        {
          kind: "workout-template-upsert",
          template: {
            id: "t1",
            name: "A",
            exerciseIds: [],
            groups: [],
            updatedAt: TS1,
          },
        },
      ],
      { userId: UID, clientTs: TS1 },
    );

    const state: FizrukDualWriteState = {
      ...EMPTY,
      workoutTemplates: [
        {
          id: "t2",
          name: "B",
          exerciseIds: [],
          groups: [],
          updatedAt: TS1,
        },
      ],
    };
    const outcome = await probeFizrukParity(client, UID, state);
    expect(outcome.result).toBe("mismatch");
    expect(outcome.details).toMatchObject({
      workoutTemplates: { ls: 1, sqlite: 1, lsOnly: 1, sqliteOnly: 1 },
    });
  });

  it("does not include user-data ids in the mismatch details", async () => {
    const state: FizrukDualWriteState = {
      ...EMPTY,
      dailyLog: [
        {
          id: "secret-id-leak",
          at: "2026-05-01T07:00:00Z",
          weightKg: null,
          sleepHours: null,
          energyLevel: null,
          mood: null,
          note: "",
        },
      ],
    };
    const outcome = await probeFizrukParity(client, UID, state);
    const json = JSON.stringify(outcome);
    expect(json).not.toContain("secret-id-leak");
  });

  // --- Stage 12.5 — programs / plan-template / wellbeing -------------

  it("reports match after a full Stage 12.5 dual-write apply", async () => {
    const state: FizrukDualWriteState = {
      ...EMPTY,
      programs: { activeProgramId: "prog-1" },
      planTemplate: { dataJson: '{"id":"t1"}' },
      wellbeing: [
        {
          dateKey: "2026-05-01",
          mood: 4,
          energy: 4,
          sleepQuality: 4,
          sleepHours: 7.5,
          notes: "",
          updatedAt: TS1,
        },
      ],
    };

    await applyFizrukDualWriteOps(
      client,
      [
        { kind: "programs-set", programs: state.programs! },
        { kind: "plan-template-set", planTemplate: state.planTemplate! },
        { kind: "wellbeing-upsert", entry: state.wellbeing![0]! },
      ],
      { userId: UID, clientTs: TS1 },
    );

    const outcome = await probeFizrukParity(client, UID, state);
    expect(outcome.result).toBe("match");
  });

  it("reports mismatch when programs row is missing in SQLite but set in LS", async () => {
    const state: FizrukDualWriteState = {
      ...EMPTY,
      programs: { activeProgramId: "prog-1" },
    };
    const outcome = await probeFizrukParity(client, UID, state);
    expect(outcome.result).toBe("mismatch");
    expect(outcome.details).toMatchObject({
      programs: { ls: true, sqlite: false },
    });
  });

  it("reports mismatch when programs active id differs", async () => {
    await applyFizrukDualWriteOps(
      client,
      [{ kind: "programs-set", programs: { activeProgramId: "prog-A" } }],
      { userId: UID, clientTs: TS1 },
    );
    const state: FizrukDualWriteState = {
      ...EMPTY,
      programs: { activeProgramId: "prog-B" },
    };
    const outcome = await probeFizrukParity(client, UID, state);
    expect(outcome.result).toBe("mismatch");
  });

  it("does not include programs id values in mismatch details", async () => {
    await applyFizrukDualWriteOps(
      client,
      [
        {
          kind: "programs-set",
          programs: { activeProgramId: "sqlite-secret" },
        },
      ],
      { userId: UID, clientTs: TS1 },
    );
    const state: FizrukDualWriteState = {
      ...EMPTY,
      programs: { activeProgramId: "ls-secret" },
    };
    const outcome = await probeFizrukParity(client, UID, state);
    const json = JSON.stringify(outcome);
    expect(json).not.toContain("sqlite-secret");
    expect(json).not.toContain("ls-secret");
  });

  it("reports mismatch when SQLite has a stale plan-template blob", async () => {
    await applyFizrukDualWriteOps(
      client,
      [
        {
          kind: "plan-template-set",
          planTemplate: { dataJson: '{"v":"sqlite"}' },
        },
      ],
      { userId: UID, clientTs: TS1 },
    );
    const state: FizrukDualWriteState = {
      ...EMPTY,
      planTemplate: { dataJson: '{"v":"ls"}' },
    };
    const outcome = await probeFizrukParity(client, UID, state);
    expect(outcome.result).toBe("mismatch");
  });

  it("does not include plan-template blob bodies in mismatch details", async () => {
    await applyFizrukDualWriteOps(
      client,
      [
        {
          kind: "plan-template-set",
          planTemplate: { dataJson: '{"sqlite":"secret-blob-1"}' },
        },
      ],
      { userId: UID, clientTs: TS1 },
    );
    const state: FizrukDualWriteState = {
      ...EMPTY,
      planTemplate: { dataJson: '{"ls":"secret-blob-2"}' },
    };
    const outcome = await probeFizrukParity(client, UID, state);
    const json = JSON.stringify(outcome);
    expect(json).not.toContain("secret-blob-1");
    expect(json).not.toContain("secret-blob-2");
  });

  it("reports mismatch when wellbeing date_key sets diverge", async () => {
    await applyFizrukDualWriteOps(
      client,
      [
        {
          kind: "wellbeing-upsert",
          entry: {
            dateKey: "2026-05-01",
            mood: 4,
            energy: 4,
            sleepQuality: 4,
            sleepHours: 8,
            notes: "",
            updatedAt: TS1,
          },
        },
      ],
      { userId: UID, clientTs: TS1 },
    );
    const state: FizrukDualWriteState = {
      ...EMPTY,
      wellbeing: [
        {
          dateKey: "2026-05-02",
          mood: 4,
          energy: 4,
          sleepQuality: 4,
          sleepHours: 8,
          notes: "",
          updatedAt: TS1,
        },
      ],
    };
    const outcome = await probeFizrukParity(client, UID, state);
    expect(outcome.result).toBe("mismatch");
    expect(outcome.details).toMatchObject({
      wellbeing: { ls: 1, sqlite: 1, lsOnly: 1, sqliteOnly: 1 },
    });
  });
});
