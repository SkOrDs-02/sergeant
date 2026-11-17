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
import { applyPullOp } from "../syncEngine/applyPullOp.js";
import { migrateAnonymousDataToProfile } from "./anonymousDataMigration.js";
import { preflightAnonymousRows } from "./anonymousPartitionPreflight.js";
import { FIZRUK_CLIENT_MIGRATIONS } from "@sergeant/db-schema/sqlite/migrations";
import { createClientMigrator } from "@shared/lib/db/clientMigrator";

// Only the browser partition manager and network runtime are replaced.
// Migrations, row application, outbox enqueue and cleanup use real SQLite.
const boundary = vi.hoisted(() => ({
  current: null as string | null,
  client: null as (() => SqliteMigrationClient) | null,
  reader: { pullOnce: vi.fn<() => Promise<void>>() },
  writer: { flushNow: vi.fn<() => Promise<void>>() },
  bootReader: vi.fn(),
  bootWriter: vi.fn(),
}));
vi.mock("../db/sqlite.js", () => ({
  switchSqliteUser: async (user: string | null) => {
    boundary.current = user;
  },
  getSqliteDb: async () => ({ migrationClient: () => boundary.client!() }),
  readActiveSqliteVfs: () => "native-test-sqlite",
  readSqliteStorageDiagnostics: () => ({ fileCount: 3, capacity: 64 }),
}));
vi.mock("../syncEngine/singleton.js", () => ({
  bootSyncEngineReader: () => boundary.bootReader(),
  bootSyncEngineWriter: () => boundary.bootWriter(),
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
const USER = "migration-user-a";
const OTHER = "migration-user-b";
const TS = "2026-10-20T10:00:00.000Z";
interface Partition {
  db: NativeDatabase;
  client: SqliteMigrationClient;
  file: string;
}
let directory: string;
let partitions: Map<string, Partition>;
let deliveries: string[];

function open(file: string): Partition {
  const db = new Database(file);
  return {
    db,
    file,
    client: {
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
    },
  };
}
function part(user = ANON): Partition {
  return partitions.get(user)!;
}
function rows(sql: string, user = ANON): Record<string, unknown>[] {
  return part(user).db.prepare(sql).all() as Record<string, unknown>[];
}
function claim() {
  return rows("SELECT * FROM anonymous_profile_migrations")[0]!;
}
function habits(user = ANON) {
  return rows("SELECT id, user_id, name FROM routine_habits ORDER BY id", user);
}
function outbox() {
  return rows("SELECT * FROM sync_op_outbox ORDER BY id", USER);
}
function seed(id = "habit-1", user = ANON) {
  part()
    .db.prepare(
      "INSERT INTO routine_habits (id, user_id, name, updated_at) VALUES (?, ?, ?, ?)",
    )
    .run(id, user, `name-${id}`, TS);
}
function reopen() {
  for (const [user, partition] of partitions) {
    partition.db.close();
    partitions.set(user, open(partition.file));
  }
}
async function acknowledge() {
  const target = part(USER);
  for (const row of outbox()) {
    deliveries.push(row["idempotency_key"] as string);
    target.db.prepare("DELETE FROM sync_op_outbox WHERE id = ?").run(row["id"]);
  }
}

beforeEach(async () => {
  directory = mkdtempSync(join(tmpdir(), "sergeant-anon-migration-"));
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
  boundary.client = () => part(boundary.current ?? ANON).client;
  boundary.reader.pullOnce.mockReset().mockResolvedValue(undefined);
  boundary.writer.flushNow.mockReset().mockImplementation(acknowledge);
  boundary.bootReader.mockReset().mockResolvedValue(boundary.reader);
  boundary.bootWriter.mockReset().mockResolvedValue(boundary.writer);
  deliveries = [];
});
afterEach(() => {
  for (const partition of partitions?.values() ?? []) partition.db.close();
  if (directory) rmSync(directory, { recursive: true, force: true });
  vi.unstubAllGlobals();
});

describe("anonymous migration — persistent SQLite boundaries", () => {
  it("retains source and pending claim until every queued row is acknowledged", async () => {
    seed();
    seed("habit-2");
    seed("foreign-row", OTHER);
    boundary.writer.flushNow.mockImplementation(async () => {
      expect(habits()).toHaveLength(3);
      expect(claim()["status"]).toBe("pending");
      expect(habits(USER)).toHaveLength(2);
      expect(outbox()).toHaveLength(2);
      await acknowledge();
    });
    await expect(migrateAnonymousDataToProfile(USER)).resolves.toEqual({
      migratedRows: 2,
    });
    expect(habits()).toEqual([
      { id: "foreign-row", user_id: OTHER, name: "name-foreign-row" },
    ]);
    expect(claim()).toMatchObject({
      status: "completed",
      completed_at: expect.any(String),
    });
    expect(habits(USER).map((row) => row["user_id"])).toEqual([USER, USER]);
    expect(outbox()).toEqual([]);
    expect(boundary.current).toBe(USER);
  });

  it("resumes after offline push and reopening the files with the same durable key", async () => {
    seed();
    boundary.writer.flushNow.mockRejectedValueOnce(new Error("offline"));
    await expect(migrateAnonymousDataToProfile(USER)).rejects.toMatchObject({
      step: "push",
      detail: "offline",
    });
    const batch = claim()["batch_id"];
    const key = outbox()[0]!["idempotency_key"];
    expect(habits()).toHaveLength(1);
    reopen();
    await expect(migrateAnonymousDataToProfile(USER)).resolves.toEqual({
      migratedRows: 1,
    });
    expect(claim()["batch_id"]).toBe(batch);
    expect(deliveries).toEqual([key]);
    expect(habits(USER)).toHaveLength(1);
    expect(habits()).toEqual([]);
  });

  it("waits for a persisted retry deadline before acknowledging and cleaning the source", async () => {
    seed();
    let first = true;
    let dueAt = 0;
    boundary.writer.flushNow.mockImplementation(async () => {
      if (first) {
        first = false;
        dueAt = Date.now() + 1_000;
        part(USER)
          .db.prepare(
            "UPDATE sync_op_outbox SET attempts = 1, next_retry_at = ?, last_error = 'http_503'",
          )
          .run(new Date(dueAt).toISOString());
        expect(habits()).toHaveLength(1);
        expect(claim()["status"]).toBe("pending");
        return;
      }
      expect(Date.now()).toBeGreaterThanOrEqual(dueAt);
      await acknowledge();
    });
    await expect(migrateAnonymousDataToProfile(USER)).resolves.toEqual({
      migratedRows: 1,
    });
    expect(boundary.writer.flushNow).toHaveBeenCalledTimes(2);
    expect(habits()).toEqual([]);
    expect(outbox()).toEqual([]);
  });

  it.each(["pull-before", "pull-after"])(
    "preserves a retryable snapshot when %s fails",
    async (step) => {
      seed();
      if (step === "pull-after")
        boundary.reader.pullOnce.mockResolvedValueOnce(undefined);
      boundary.reader.pullOnce.mockRejectedValueOnce(
        new Error("pull unavailable"),
      );
      await expect(migrateAnonymousDataToProfile(USER)).rejects.toMatchObject({
        step,
      });
      const batch = claim()["batch_id"];
      expect(habits()).toHaveLength(1);
      expect(claim()["status"]).toBe("pending");
      expect(outbox()).toEqual([]);
      reopen();
      await expect(migrateAnonymousDataToProfile(USER)).resolves.toEqual({
        migratedRows: 1,
      });
      expect(claim()).toMatchObject({ batch_id: batch, status: "completed" });
      expect(new Set(deliveries).size).toBe(1);
      expect(habits()).toEqual([]);
    },
  );

  it("round-trips decoded JSON and rekeys a composite primary key without deleting a neighbouring row", async () => {
    part()
      .db.prepare(
        "INSERT INTO finyk_prefs (user_id, prefs_json, updated_at) VALUES (?, ?, ?)",
      )
      .run(
        ANON,
        JSON.stringify({ currency: "UAH", nested: { enabled: true } }),
        TS,
      );
    part()
      .db.prepare(
        "INSERT INTO routine_habit_skips (user_id, skip_key, note, updated_at) VALUES (?, ?, 'skip', ?)",
      )
      .run(ANON, "habit-local-anon:2026-10-20", TS);
    part()
      .db.prepare(
        "INSERT INTO routine_habit_skips (user_id, skip_key, note, updated_at) VALUES (?, ?, 'foreign', ?)",
      )
      .run(OTHER, "habit-local-anon:2026-10-20", TS);
    boundary.writer.flushNow.mockImplementation(async () => {
      const prefs = outbox().find(
        (row) => row["table_name"] === "finyk_prefs",
      )!;
      expect(JSON.parse(prefs["row"] as string)).toMatchObject({
        user_id: USER,
        prefs_json: { currency: "UAH", nested: { enabled: true } },
      });
      await acknowledge();
    });
    await expect(migrateAnonymousDataToProfile(USER)).resolves.toEqual({
      migratedRows: 2,
    });
    expect(
      rows("SELECT user_id, skip_key FROM routine_habit_skips", USER),
    ).toEqual([{ user_id: USER, skip_key: `habit-${USER}:2026-10-20` }]);
    expect(rows("SELECT user_id, note FROM routine_habit_skips")).toEqual([
      { user_id: OTHER, note: "foreign" },
    ]);
    expect(rows("SELECT * FROM finyk_prefs")).toEqual([]);
    expect(
      JSON.parse(
        rows("SELECT prefs_json FROM finyk_prefs", USER)[0]![
          "prefs_json"
        ] as string,
      ),
    ).toMatchObject({ currency: "UAH", nested: { enabled: true } });
  });

  it("sends a tombstone with its rekeyed id while removing the original source id", async () => {
    seed("habit-local-anon");
    part().db.prepare("UPDATE routine_habits SET deleted_at = ?").run(TS);
    part(USER)
      .db.prepare(
        "INSERT INTO routine_habits (id, user_id, name, updated_at) VALUES (?, ?, 'old', ?)",
      )
      .run(`habit-${USER}`, USER, "2026-10-19T10:00:00.000Z");
    boundary.writer.flushNow.mockImplementation(async () => {
      expect(outbox()[0]).toMatchObject({ op: "delete", user_id: USER });
      expect(JSON.parse(outbox()[0]!["row"] as string)).toMatchObject({
        id: `habit-${USER}`,
        deleted_at: TS,
      });
      await acknowledge();
    });
    await expect(migrateAnonymousDataToProfile(USER)).resolves.toEqual({
      migratedRows: 1,
    });
    expect(habits()).toEqual([]);
    expect(rows("SELECT id, deleted_at FROM routine_habits", USER)).toEqual([
      { id: `habit-${USER}`, deleted_at: TS },
    ]);
  });

  it.each(["local apply", "outbox append"])(
    "recovers a failure on the second %s without losing the first row",
    async (stage) => {
      seed();
      seed("habit-2");
      const onHabit = stage === "local apply";
      part(USER).db.exec(
        onHabit
          ? "CREATE TRIGGER fail_write BEFORE INSERT ON routine_habits WHEN NEW.id = 'habit-2' BEGIN SELECT RAISE(ABORT, 'disk full'); END"
          : "CREATE TRIGGER fail_write BEFORE INSERT ON sync_op_outbox WHEN json_extract(NEW.row, '$.id') = 'habit-2' BEGIN SELECT RAISE(ABORT, 'disk full'); END",
      );
      await expect(migrateAnonymousDataToProfile(USER)).rejects.toMatchObject({
        step: "apply-local",
        detail: "disk full",
      });
      const batch = claim()["batch_id"];
      const firstKey = outbox()[0]!["idempotency_key"];
      expect(habits()).toHaveLength(2);
      expect(outbox()).toHaveLength(1);
      expect(boundary.writer.flushNow).not.toHaveBeenCalled();
      part(USER).db.exec("DROP TRIGGER fail_write");
      reopen();
      await expect(migrateAnonymousDataToProfile(USER)).resolves.toEqual({
        migratedRows: 2,
      });
      expect(claim()["batch_id"]).toBe(batch);
      expect(deliveries).toHaveLength(2);
      expect(deliveries[0]).toBe(firstKey);
      expect(new Set(deliveries).size).toBe(2);
      expect(habits(USER)).toHaveLength(2);
      expect(habits()).toEqual([]);
    },
  );

  it.each(["second delete", "completion marker"])(
    "rolls back source cleanup when the %s fails, then resumes",
    async (stage) => {
      seed();
      seed("habit-2");
      part().db.exec(
        stage === "second delete"
          ? "CREATE TRIGGER fail_cleanup BEFORE DELETE ON routine_habits WHEN OLD.id = 'habit-2' BEGIN SELECT RAISE(ABORT, 'cleanup blocked'); END"
          : "CREATE TRIGGER fail_cleanup BEFORE UPDATE ON anonymous_profile_migrations WHEN NEW.status = 'completed' BEGIN SELECT RAISE(ABORT, 'cleanup blocked'); END",
      );
      await expect(migrateAnonymousDataToProfile(USER)).rejects.toMatchObject({
        step: "cleanup",
      });
      const batch = claim()["batch_id"];
      const firstDelivery = [...deliveries];
      expect(habits()).toHaveLength(2);
      expect(claim()).toMatchObject({ status: "pending", completed_at: null });
      expect(habits(USER)).toHaveLength(2);
      expect(outbox()).toEqual([]);
      part().db.exec("DROP TRIGGER fail_cleanup");
      reopen();
      await expect(migrateAnonymousDataToProfile(USER)).resolves.toEqual({
        migratedRows: 2,
      });
      expect(claim()).toMatchObject({ batch_id: batch, status: "completed" });
      expect(deliveries.slice(2)).toEqual(firstDelivery);
      expect(habits()).toEqual([]);
    },
  );

  it("isolates account B while A owns an incomplete claim, then allows A to resume", async () => {
    seed();
    boundary.writer.flushNow.mockRejectedValueOnce(new Error("offline"));
    await expect(migrateAnonymousDataToProfile(USER)).rejects.toMatchObject({
      step: "push",
    });
    const pending = claim();
    const onTransferStart = vi.fn();
    reopen();
    await expect(
      migrateAnonymousDataToProfile(OTHER, { onTransferStart }),
    ).resolves.toEqual({ migratedRows: 0 });
    expect(claim()).toEqual(pending);
    expect(habits()).toHaveLength(1);
    expect(habits(OTHER)).toEqual([]);
    expect(onTransferStart).not.toHaveBeenCalled();
    expect(boundary.current).toBe(OTHER);
    await expect(migrateAnonymousDataToProfile(USER)).resolves.toEqual({
      migratedRows: 1,
    });
    expect(habits(USER)).toHaveLength(1);
  });

  it("retains source data when the server rejects an operation", async () => {
    seed();
    boundary.writer.flushNow.mockImplementation(async () => {
      part(USER).db.exec(
        "UPDATE sync_op_outbox SET status = 'rejected', reject_reason = 'validation'",
      );
    });
    await expect(migrateAnonymousDataToProfile(USER)).rejects.toMatchObject({
      step: "confirm",
    });
    expect(habits()).toHaveLength(1);
    expect(claim()["status"]).toBe("pending");
    expect(outbox()[0]).toMatchObject({
      status: "rejected",
      reject_reason: "validation",
    });
  });

  it("accepts an authoritative LWW winner and removes only its settled receipt", async () => {
    seed();
    boundary.writer.flushNow.mockImplementation(async () => {
      part(USER).db.exec(
        "UPDATE sync_op_outbox SET status = 'rejected', reject_reason = 'lww_conflict'",
      );
    });
    boundary.reader.pullOnce
      .mockResolvedValueOnce(undefined)
      .mockImplementationOnce(async () => {
        await applyPullOp(
          part(USER).client,
          {
            id: 1,
            table: "routine_habits",
            op: "insert",
            row: { id: "habit-1", user_id: USER, name: "server winner" },
            client_ts: "2026-10-21T10:00:00.000Z",
            server_ts: TS,
            origin_device_id: null,
          },
          USER,
          "remote-device",
        );
      });
    await expect(migrateAnonymousDataToProfile(USER)).resolves.toEqual({
      migratedRows: 1,
    });
    expect(habits()).toEqual([]);
    expect(habits(USER)[0]!["name"]).toBe("server winner");
    expect(outbox()).toEqual([]);
  });

  it.each(["reader", "writer"])(
    "keeps source intact when the %s cannot boot",
    async (runtime) => {
      seed();
      (runtime === "reader"
        ? boundary.bootReader
        : boundary.bootWriter
      ).mockResolvedValueOnce(null);
      await expect(migrateAnonymousDataToProfile(USER)).rejects.toMatchObject({
        step: `boot-${runtime}`,
        detail: `no ${runtime}`,
      });
      expect(habits()).toHaveLength(1);
      expect(claim()["status"]).toBe("pending");
    },
  );

  it("preserves a malformed legacy row that the real apply path rejects", async () => {
    part()
      .db.prepare(
        "INSERT INTO routine_entries (id, user_id, name, updated_at) VALUES (NULL, ?, 'legacy', ?)",
      )
      .run(ANON, TS);
    await expect(migrateAnonymousDataToProfile(USER)).rejects.toMatchObject({
      step: "apply-rejected",
      detail: "routine_entries (insert)",
    });
    expect(rows("SELECT * FROM routine_entries")).toHaveLength(1);
    expect(outbox()).toEqual([]);
  });

  it("reports storage diagnostics without including migrated row contents", async () => {
    seed();
    vi.stubGlobal("navigator", {
      storage: {
        estimate: async () => ({ usage: 2 * 1_048_576, quota: 8 * 1_048_576 }),
      },
    });
    boundary.writer.flushNow.mockRejectedValueOnce(new Error("offline"));
    const error = await migrateAnonymousDataToProfile(USER).catch(
      (cause: unknown) => cause,
    );
    expect(error).toMatchObject({
      step: "push",
      detail: "offline",
      message:
        "anon-migration/push: offline [vfs=native-test-sqlite pool=3/64 disk=2/8MB]",
    });
    expect(String(error)).not.toContain("name-habit-1");
  });
});

// ux-01: дешевий preflight до міграцій схем і скану. Кожен кейс нижче —
// або доказ «порожньо», або доказ, що перенос НЕ пропущено.
describe("anonymous migration — preflight", () => {
  function freshAnonPartition(): Partition {
    part().db.close();
    const fresh = open(join(directory, "anon-fresh.sqlite"));
    partitions.set(ANON, fresh);
    return fresh;
  }
  function tables(user = ANON): string[] {
    return rows(
      "SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name",
      user,
    ).map((row) => row["name"] as string);
  }

  it("treats a fresh anonymous file as empty without creating module tables", async () => {
    const fresh = freshAnonPartition();
    fresh.db.exec("CREATE TABLE kv_store (k TEXT PRIMARY KEY, v TEXT)");
    await expect(preflightAnonymousRows(fresh.client)).resolves.toBe("empty");
    await expect(migrateAnonymousDataToProfile(USER)).resolves.toEqual({
      migratedRows: 0,
    });
    // Без preflight розвідка прогнала б міграції 4 модулів на цьому файлі.
    expect(tables()).toEqual(["kv_store"]);
    expect(boundary.bootReader).not.toHaveBeenCalled();
    expect(boundary.current).toBe(USER);
  });

  it("is empty for a fully migrated partition that holds only other users' rows", async () => {
    seed("foreign-row", OTHER);
    await expect(preflightAnonymousRows(part().client)).resolves.toBe("empty");
  });

  it("probes when a local-anon row exists, tombstones included", async () => {
    seed();
    part().db.exec(`UPDATE routine_habits SET deleted_at = '${TS}'`);
    await expect(preflightAnonymousRows(part().client)).resolves.toBe("probe");
  });

  it("probes an unknown table in a file without module ledgers", async () => {
    const fresh = freshAnonPartition();
    fresh.db.exec("CREATE TABLE legacy_thing (user_id TEXT)");
    await expect(preflightAnonymousRows(fresh.client)).resolves.toBe("probe");
  });

  it("does not skip rows that only a pending client migration turns into transferable rows", async () => {
    const fresh = freshAnonPartition();
    await migrateRoutine(fresh.client);
    await migrateNutrition(fresh.client);
    await migrateFinyk(fresh.client);
    // Стара анонімна партиція: Фізрук ще до `007_fizruk_pushups_to_workouts`.
    await createClientMigrator(
      FIZRUK_CLIENT_MIGRATIONS.filter((file) => file.name < "007"),
      "__fizruk_migrations",
    )(fresh.client);
    fresh.db
      .prepare(
        "INSERT INTO fizruk_pushups (user_id, date_key, reps, updated_at) VALUES (?, ?, ?, ?)",
      )
      .run(ANON, "2026-10-01", 20, TS);
    await expect(preflightAnonymousRows(fresh.client)).resolves.toBe("probe");

    const result = await migrateAnonymousDataToProfile(USER);
    expect(result.migratedRows).toBeGreaterThan(0);
    expect(
      rows("SELECT user_id FROM fizruk_workouts", USER).map(
        (row) => row["user_id"],
      ),
    ).toEqual([USER]);
    expect(claim()["status"]).toBe("completed");
  });

  it("falls back to the full probe when the preflight itself fails", async () => {
    const client: SqliteMigrationClient = {
      ...part().client,
      all: () => {
        throw new Error("SQLITE_IOERR");
      },
    };
    await expect(preflightAnonymousRows(client)).resolves.toBe("probe");
  });
});
