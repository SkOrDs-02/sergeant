/**
 * `data-46`, варіант «б» (рішення власника 2026-10-23): вихід акаунта A з
 * незавершеним переносом рахує анонімні рядки й стирає їх разом із claim A.
 *
 * Справжній SQLite (better-sqlite3), справжні міграції модулів і справжній
 * перенос, який падає на потрібному кроці; підмінено лише менеджер партицій
 * і мережевий runtime синку, як у `anonymousDataMigration.sqlite.test.ts`.
 */
import { createRequire } from "node:module";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { SqliteMigrationClient } from "@sergeant/db-schema/migrate/sqlite";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { migrateRoutine } from "../../modules/routine/lib/clientMigrate.js";
import { migrateFizruk } from "../../modules/fizruk/lib/clientMigrate.js";
import { migrateNutrition } from "../../modules/nutrition/lib/clientMigrate.js";
import { migrateFinyk } from "../../modules/finyk/lib/clientMigrate.js";
import { migrateAnonymousDataToProfile } from "./anonymousDataMigration.js";
import {
  __resetAnonymousLeftoversForTests,
  countLogoutLoss,
  discardAnonymousLeftoversOnLogout,
  inspectAnonymousLeftoversOnLogout,
  trackAnonymousHandoff,
} from "./anonymousLeftoversOnLogout";

const boundary = vi.hoisted(() => ({
  current: null as string | null,
  switches: [] as (string | null)[],
  client: null as (() => SqliteMigrationClient) | null,
  reader: { pullOnce: vi.fn<() => Promise<void>>() },
  events: [] as string[],
  writer: { flushNow: vi.fn<() => Promise<void>>() },
}));
vi.mock("../db/sqlite.js", () => ({
  switchSqliteUser: async (user: string | null) => {
    boundary.switches.push(user);
    boundary.events.push(`switch:${user ?? "anon"}`);
    boundary.current = user;
  },
  readActiveSqliteUserId: () => boundary.current,
  getSqliteDb: async () => ({ migrationClient: () => boundary.client!() }),
  readActiveSqliteVfs: () => "native-test-sqlite",
  readSqliteStorageDiagnostics: () => null,
}));
vi.mock("../syncEngine/singleton.js", () => ({
  BENIGN_REJECT_REASONS: new Set(["lww_conflict"]),
  bootSyncEngineReader: async () => boundary.reader,
  getSyncEngineReader: () => ({
    pause: async () => {
      boundary.events.push("pause");
      return () => boundary.events.push("resume");
    },
  }),
  bootSyncEngineWriter: async () => boundary.writer,
}));

interface NativeDatabase {
  exec(sql: string): unknown;
  prepare(sql: string): {
    run(...params: unknown[]): unknown;
    all(...params: unknown[]): unknown[];
  };
  close(): void;
}
const require = createRequire(import.meta.url);
const Database = require("better-sqlite3") as new (
  file: string,
) => NativeDatabase;
const ANON = "local-anon";
const USER = "leftovers-user-a";
const OTHER = "leftovers-user-b";
const TS = "2026-10-23T10:00:00.000Z";

let directory: string;
let partitions: Map<
  string,
  { db: NativeDatabase; client: SqliteMigrationClient }
>;

function open(file: string) {
  const db = new Database(file);
  const client: SqliteMigrationClient = {
    exec: (sql) => {
      db.exec(sql);
    },
    run: (sql, params = []) => {
      db.prepare(sql).run(...params);
    },
    all: <R extends Record<string, unknown>>(
      sql: string,
      params: readonly unknown[] = [],
    ) => db.prepare(sql).all(...params) as R[],
  };
  return { db, client };
}
function rows(sql: string, user = ANON): Record<string, unknown>[] {
  return partitions.get(user)!.db.prepare(sql).all() as Record<
    string,
    unknown
  >[];
}
const claims = () => rows("SELECT * FROM anonymous_profile_migrations");
const anonHabits = () => rows("SELECT id, user_id FROM routine_habits");
function seed(id: string, user = ANON) {
  partitions
    .get(ANON)!
    .db.prepare(
      "INSERT INTO routine_habits (id, user_id, name, updated_at) VALUES (?, ?, ?, ?)",
    )
    .run(id, user, `name-${id}`, TS);
}

/** Перенос для A падає на `step`, після чого активна партиція A (як у сесії). */
async function failMigrationFor(user: string, step: "pull-before" | "push") {
  if (step === "pull-before")
    boundary.reader.pullOnce.mockRejectedValueOnce(new Error("down"));
  else boundary.writer.flushNow.mockRejectedValueOnce(new Error("offline"));
  await expect(migrateAnonymousDataToProfile(user)).rejects.toMatchObject({
    step,
  });
  boundary.current = user;
  boundary.switches = [];
}

beforeEach(async () => {
  directory = mkdtempSync(join(tmpdir(), "sergeant-anon-leftovers-"));
  partitions = new Map();
  for (const [index, user] of [ANON, USER, OTHER].entries()) {
    const partition = open(join(directory, `${index}.sqlite`));
    partitions.set(user, partition);
    await migrateRoutine(partition.client);
    await migrateFizruk(partition.client);
    await migrateNutrition(partition.client);
    await migrateFinyk(partition.client);
  }
  boundary.current = null;
  boundary.switches = [];
  boundary.client = () => partitions.get(boundary.current ?? ANON)!.client;
  boundary.reader.pullOnce.mockReset().mockResolvedValue(undefined);
  boundary.writer.flushNow.mockReset().mockResolvedValue(undefined);
  __resetAnonymousLeftoversForTests();
});
afterEach(() => {
  for (const partition of partitions?.values() ?? []) partition.db.close();
  if (directory) rmSync(directory, { recursive: true, force: true });
});

describe("анонімні рядки незавершеного переносу при виході (data-46)", () => {
  it("перенос упав до постановки в чергу: рядки рахуються, а після стирання наступний акаунт входить чистим", async () => {
    seed("habit-1");
    seed("habit-2");
    seed("foreign-row", OTHER);
    await failMigrationFor(USER, "pull-before");
    expect(rows("SELECT * FROM sync_op_outbox", USER)).toEqual([]);

    boundary.events.length = 0;
    const leftovers = await inspectAnonymousLeftoversOnLogout();
    expect(leftovers).toEqual({ userId: USER, rows: 2, queuedCopies: 0 });
    // Діалог «Залишитись» продовжує сесію в партиції A.
    expect(boundary.current).toBe(USER);
    // Reader синку стоїть на паузі все вікно, поки активна анонімна партиція:
    // pull у цьому вікні записав би рядки A в анонімний файл.
    expect(boundary.events).toEqual([
      "pause",
      "switch:anon",
      `switch:${USER}`,
      "resume",
    ]);
    expect(countLogoutLoss(0, leftovers)).toBe(2);

    // Вихід: партицію A стерто, активна анонімна.
    boundary.current = null;
    await expect(discardAnonymousLeftoversOnLogout(leftovers!)).resolves.toBe(
      true,
    );
    expect(anonHabits()).toEqual([{ id: "foreign-row", user_id: OTHER }]);
    expect(claims()).toEqual([]);

    // Наступний акаунт: переносити нічого, жодного чужого claim.
    await expect(migrateAnonymousDataToProfile(OTHER)).resolves.toEqual({
      migratedRows: 0,
    });
    expect(rows("SELECT * FROM routine_habits", OTHER)).toEqual([]);
  });

  it("перенос упав на push: копії в черзі A не рахуються двічі", async () => {
    seed("habit-1");
    seed("habit-2");
    await failMigrationFor(USER, "push");
    // Власний недоставлений запис A поруч із копіями переносу.
    partitions
      .get(USER)!
      .db.prepare(
        `INSERT INTO sync_op_outbox (user_id, table_name, op, row, client_ts, idempotency_key, status)
         VALUES (?, 'routine_habits', 'insert', '{}', ?, 'own-op', 'pending')`,
      )
      .run(USER, TS);

    const leftovers = await inspectAnonymousLeftoversOnLogout();
    expect(leftovers).toEqual({ userId: USER, rows: 2, queuedCopies: 2 });
    // Черга A: 2 копії + 1 власний = 3; анонімних 2, з них 2 вже в черзі.
    expect(countLogoutLoss(3, leftovers)).toBe(3);
  });

  it("чужий незавершений claim вихід A не чіпає", async () => {
    seed("habit-1");
    await failMigrationFor(OTHER, "pull-before");
    boundary.current = USER;

    await expect(inspectAnonymousLeftoversOnLogout()).resolves.toBeNull();
    expect(boundary.current).toBe(USER);
    expect(claims()).toMatchObject([
      { target_user_id: OTHER, status: "pending" },
    ]);
    expect(anonHabits()).toHaveLength(1);
  });

  it("після успішного прогону в цій сесії анонімну партицію не відкриває", async () => {
    seed("habit-1");
    await failMigrationFor(USER, "pull-before");
    trackAnonymousHandoff(USER, Promise.resolve());
    await Promise.resolve();

    await expect(inspectAnonymousLeftoversOnLogout()).resolves.toBeNull();
    expect(boundary.switches).toEqual([]);
  });

  it("стирання звіряє claim ще раз: якщо перенос тим часом завершився, нічого не чіпає", async () => {
    seed("habit-1");
    await failMigrationFor(USER, "pull-before");
    const leftovers = await inspectAnonymousLeftoversOnLogout();
    partitions
      .get(ANON)!
      .db.prepare(
        "UPDATE anonymous_profile_migrations SET status = 'completed'",
      )
      .run();

    boundary.current = null;
    await expect(discardAnonymousLeftoversOnLogout(leftovers!)).resolves.toBe(
      false,
    );
    expect(anonHabits()).toHaveLength(1);
  });
});
