/**
 * Last validated: 2026-10-20
 * Status: Active
 *
 * Регресія `data-46` (аудит 2026-10-01): незавершений claim переносу
 * анонімних даних за акаунтом A не мусить блокувати вхід акаунта B.
 */
import type { SqliteMigrationClient } from "@sergeant/db-schema/migrate/sqlite";
import { beforeEach, describe, expect, it, vi } from "vitest";

const switchSqliteUser = vi.fn(async (_userId: string | null) => {});
const bootReader = vi.fn(async () => null);
const bootWriter = vi.fn(async () => null);

interface FakeClaim {
  target_user_id: string;
  batch_id: string;
  status: "pending" | "completed";
}
let claim: FakeClaim | null = null;
const writes: string[] = [];
// Схеми модулів доганяються справжніми міграціями (DDL і `__migrations`),
// тож у `writes` йдуть лише DML по даних переносу: claim, анонімні рядки,
// черга синку.
const DATA_WRITE =
  /^\s*(INSERT INTO|UPDATE|DELETE FROM)\s+(anonymous_profile_migrations|finyk_prefs|sync_op_outbox)\b/i;
function recordWrite(sql: string) {
  if (DATA_WRITE.test(sql)) writes.push(sql);
}

const anonRow = {
  user_id: "local-anon",
  prefs_json: '{"currency":"UAH"}',
  updated_at: "2026-07-28T08:00:00.000Z",
};

const fakeClient = {
  all: vi.fn(async (sql: string) => {
    if (sql.includes("sqlite_master")) {
      // Лише одна таблиця «існує», щоб снапшот мав рівно один анонімний рядок.
      return [{ name: "finyk_prefs" }];
    }
    if (sql.includes("pragma_table_info")) return [{ name: "user_id", pk: 1 }];
    if (sql.includes("FROM finyk_prefs")) return [anonRow];
    if (sql.includes("FROM anonymous_profile_migrations")) {
      return claim ? [claim] : [];
    }
    return [];
  }),
  run: vi.fn(async (sql: string) => recordWrite(sql)),
  exec: vi.fn(async (sql: string) => recordWrite(sql)),
} as unknown as SqliteMigrationClient;

vi.mock("../db/sqlite.js", () => ({
  switchSqliteUser: (userId: string | null) => switchSqliteUser(userId),
  getSqliteDb: async () => ({ migrationClient: () => fakeClient }),
}));
vi.mock("../syncEngine/singleton.js", () => ({
  bootSyncEngineReader: () => bootReader(),
  bootSyncEngineWriter: () => bootWriter(),
}));
import {
  __anonymousMigrationInternals,
  migrateAnonymousDataToProfile,
} from "./anonymousDataMigration.js";

describe("незавершений claim іншого акаунта (data-46)", () => {
  beforeEach(() => {
    claim = {
      target_user_id: "user-a",
      batch_id: "batch-a",
      status: "pending",
    };
    writes.length = 0;
    switchSqliteUser.mockClear();
    bootReader.mockClear();
    bootWriter.mockClear();
  });

  it("getOrCreateClaim повертає null і нічого не пише", async () => {
    await expect(
      __anonymousMigrationInternals.getOrCreateClaim(fakeClient, "user-b"),
    ).resolves.toBeNull();
    expect(writes).toEqual([]);
  });

  it("вхід B завершується без помилки, без копіювання рядків і без зміни claim", async () => {
    const onTransferStart = vi.fn();

    await expect(
      migrateAnonymousDataToProfile("user-b", { onTransferStart }),
    ).resolves.toEqual({ migratedRows: 0 });

    // Жодного запису: ні апдейту claim, ні видалення анонімних рядків.
    expect(writes).toEqual([]);
    expect(claim).toEqual({
      target_user_id: "user-a",
      batch_id: "batch-a",
      status: "pending",
    });
    // Sync не стартував для переносу, а панель «переношу дані» не зʼявилась.
    expect(bootReader).not.toHaveBeenCalled();
    expect(bootWriter).not.toHaveBeenCalled();
    expect(onTransferStart).not.toHaveBeenCalled();
    // Активна партиція — партиція B, тож модулі B бутяться з власними даними.
    expect(switchSqliteUser).toHaveBeenLastCalledWith("user-b");
  });

  it("повернення A продовжує перенос для A з того самого claim", async () => {
    const onTransferStart = vi.fn();

    // bootSyncEngineReader поверне null: це перше, що перенос робить після
    // claim, тож кидок саме тут доводить, що для A він пішов далі.
    await expect(
      migrateAnonymousDataToProfile("user-a", { onTransferStart }),
    ).rejects.toThrow(/boot-reader/);

    expect(onTransferStart).toHaveBeenCalledTimes(1);
    expect(bootReader).toHaveBeenCalledTimes(1);
    expect(writes).toEqual([]);
  });
});
