import { describe, expect, it, beforeEach, afterEach } from "vitest";
import Database from "better-sqlite3";
import type { Database as BetterSqliteDatabase } from "better-sqlite3";
import { getTableConfig } from "drizzle-orm/sqlite-core";
import { kvStore } from "../sqlite/kvStore.js";
import {
  KV_STORE_CLIENT_MIGRATIONS,
  KV_STORE_MIGRATIONS_TABLE,
} from "../sqlite/migrations/index.js";
import { runMigrations } from "../migrate/runner.js";
import {
  createSqliteAdapter,
  type SqliteMigrationClient,
} from "../migrate/adapters/sqlite.js";

/**
 * Snapshot tests for the per-device `kv_store` SQLite schema and the
 * single bundled migration that creates it. Stage 9 / PR #060 of
 * `docs/planning/storage-roadmap.md`.
 *
 * Coverage:
 *   - column ordering, names, dataType + nullability + hasDefault on
 *     the Drizzle schema in `sqlite/kvStore.ts`;
 *   - the bundled migration manifest entry name + DDL anchors;
 *   - end-to-end migrate-on-`:memory:` smoke + insert/select
 *     round-trip + idempotent re-run.
 *
 * Why no Postgres counterpart: per the storage-roadmap §3 Stage 9
 * decision note, `kv_store` is purely a per-device key-value table —
 * its contents never round-trip through op-log push/pull, so there is
 * no `apps/server/src/migrations/` companion. The corresponding
 * snapshot test file under `pg-*-snapshot.test.ts` is intentionally
 * absent.
 */

function syncClient(db: BetterSqliteDatabase): SqliteMigrationClient {
  return {
    exec(sql) {
      db.exec(sql);
    },
    run(sql, params) {
      db.prepare(sql).run(...(params as unknown[]));
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

describe("sqlite/kvStore schema snapshot", () => {
  const config = getTableConfig(kvStore);

  it("has the canonical table name", () => {
    expect(config.name).toBe("kv_store");
  });

  it("declares all expected columns in migration order", () => {
    const columnNames = config.columns.map((c) => c.name);
    expect(columnNames).toEqual(["key", "value", "updated_at"]);
  });

  it("declares column types matching `001_kv_store.sql`", () => {
    const columnMap = Object.fromEntries(
      config.columns.map((c) => [c.name, c]),
    );

    // key TEXT PRIMARY KEY
    expect(columnMap["key"]!.dataType).toBe("string");
    expect(columnMap["key"]!.columnType).toBe("SQLiteText");
    expect(columnMap["key"]!.primary).toBe(true);
    expect(columnMap["key"]!.notNull).toBe(true);

    // value TEXT NOT NULL — JSON-encoded payload, but storage layer
    // is opaque to the schema (the warm-cache passes strings through).
    expect(columnMap["value"]!.dataType).toBe("string");
    expect(columnMap["value"]!.columnType).toBe("SQLiteText");
    expect(columnMap["value"]!.notNull).toBe(true);

    // updated_at INTEGER (timestamp_ms) NOT NULL — Date round-trip
    // via Drizzle's `mode: "timestamp_ms"`. Numeric-sortable so the
    // PR #061 warm-cache eviction heuristic can ORDER BY updated_at.
    expect(columnMap["updated_at"]!.dataType).toBe("date");
    expect(columnMap["updated_at"]!.columnType).toBe("SQLiteTimestamp");
    expect(columnMap["updated_at"]!.notNull).toBe(true);
    expect(columnMap["updated_at"]!.hasDefault).toBe(true);
  });

  it("has no extra indexes (PRIMARY KEY on `key` is the only access path)", () => {
    expect(config.indexes).toHaveLength(0);
  });
});

describe("sqlite/kv_store migrations exports", () => {
  it("exports a single 001_kv_store.sql migration", () => {
    expect(KV_STORE_CLIENT_MIGRATIONS).toHaveLength(1);
    expect(KV_STORE_CLIENT_MIGRATIONS[0]!.name).toBe("001_kv_store.sql");
  });

  it("DDL creates the kv_store table with the expected column shape", () => {
    const sql = KV_STORE_CLIENT_MIGRATIONS[0]!.sql;
    expect(sql).toMatch(/CREATE TABLE IF NOT EXISTS kv_store/);
    expect(sql).toMatch(/key\s+TEXT PRIMARY KEY/);
    expect(sql).toMatch(/value\s+TEXT NOT NULL/);
    expect(sql).toMatch(/updated_at\s+INTEGER NOT NULL/);
    // Numeric SQL default so raw-SQL inserts (tests, future migrations)
    // don't have to specify updated_at — Drizzle's $defaultFn covers
    // ORM-driven inserts but the SQL fallback keeps the table usable
    // from outside Drizzle too.
    expect(sql).toMatch(
      /DEFAULT \(CAST\(\(unixepoch\(\) \* 1000\) AS INTEGER\)\)/,
    );
  });

  it("uses a separate `__kv_store_migrations` ledger table", () => {
    expect(KV_STORE_MIGRATIONS_TABLE).toBe("__kv_store_migrations");
  });
});

describe("KV_STORE_CLIENT_MIGRATIONS apply roundtrip", () => {
  let db: BetterSqliteDatabase;
  let client: SqliteMigrationClient;

  beforeEach(() => {
    db = new Database(":memory:");
    client = syncClient(db);
  });

  afterEach(() => {
    db.close();
  });

  it("applies the bundled migration end-to-end and creates the kv_store table", async () => {
    const result = await runMigrations({
      adapter: createSqliteAdapter(client),
      files: KV_STORE_CLIENT_MIGRATIONS,
      tableName: KV_STORE_MIGRATIONS_TABLE,
    });
    expect(result.applied).toEqual(["001_kv_store.sql"]);
    expect(result.skipped).toEqual([]);

    const tables = db
      .prepare(
        `SELECT name FROM sqlite_master
         WHERE type='table' AND name NOT LIKE 'sqlite_%'
         ORDER BY name`,
      )
      .all() as { name: string }[];
    expect(tables.map((r) => r.name)).toEqual([
      "__kv_store_migrations",
      "kv_store",
    ]);

    const cols = db
      .prepare("SELECT name FROM pragma_table_info('kv_store')")
      .all() as { name: string }[];
    expect(cols.map((c) => c.name)).toEqual(["key", "value", "updated_at"]);

    const pk = db
      .prepare("SELECT name FROM pragma_table_info('kv_store') WHERE pk != 0")
      .all() as { name: string }[];
    expect(pk.map((r) => r.name)).toEqual(["key"]);
  });

  it("re-running is a no-op (idempotent migrations ledger)", async () => {
    const adapter = createSqliteAdapter(client);
    await runMigrations({
      adapter,
      files: KV_STORE_CLIENT_MIGRATIONS,
      tableName: KV_STORE_MIGRATIONS_TABLE,
    });
    const second = await runMigrations({
      adapter,
      files: KV_STORE_CLIENT_MIGRATIONS,
      tableName: KV_STORE_MIGRATIONS_TABLE,
    });
    expect(second.applied).toEqual([]);
    expect(second.skipped).toEqual(["001_kv_store.sql"]);
  });

  it("supports insert + select roundtrips and SQL default for updated_at", async () => {
    await runMigrations({
      adapter: createSqliteAdapter(client),
      files: KV_STORE_CLIENT_MIGRATIONS,
      tableName: KV_STORE_MIGRATIONS_TABLE,
    });

    const before = Date.now();
    db.prepare(`INSERT INTO kv_store (key, value) VALUES (?, ?)`).run(
      "hub_flags_v1",
      JSON.stringify({ hub_command_palette: true }),
    );
    const after = Date.now();

    const row = db
      .prepare(
        "SELECT key, value, updated_at FROM kv_store WHERE key = 'hub_flags_v1'",
      )
      .get() as { key: string; value: string; updated_at: number };
    expect(row.key).toBe("hub_flags_v1");
    expect(JSON.parse(row.value)).toEqual({ hub_command_palette: true });
    expect(typeof row.updated_at).toBe("number");
    // SQL default `(unixepoch() * 1000)` fires when the caller omits
    // `updated_at`; should land within the wall-clock window of the
    // INSERT statement (some leeway for clock granularity).
    expect(row.updated_at).toBeGreaterThanOrEqual(before - 1000);
    expect(row.updated_at).toBeLessThanOrEqual(after + 1000);
  });

  it("PRIMARY KEY on `key` rejects duplicate inserts", async () => {
    await runMigrations({
      adapter: createSqliteAdapter(client),
      files: KV_STORE_CLIENT_MIGRATIONS,
      tableName: KV_STORE_MIGRATIONS_TABLE,
    });

    db.prepare(`INSERT INTO kv_store (key, value) VALUES (?, ?)`).run(
      "shared_key",
      "first",
    );
    expect(() =>
      db
        .prepare(`INSERT INTO kv_store (key, value) VALUES (?, ?)`)
        .run("shared_key", "second"),
    ).toThrow();
  });

  it("INSERT ON CONFLICT(key) DO UPDATE upserts value + bumps updated_at", async () => {
    await runMigrations({
      adapter: createSqliteAdapter(client),
      files: KV_STORE_CLIENT_MIGRATIONS,
      tableName: KV_STORE_MIGRATIONS_TABLE,
    });

    // The PR #061 warm-cache will use ON CONFLICT upserts as its
    // sole write path — pin that the SQL surface the schema exposes
    // supports them with the column shape we declared.
    db.prepare(
      `INSERT INTO kv_store (key, value, updated_at)
       VALUES (?, ?, ?)
       ON CONFLICT(key) DO UPDATE SET
         value = excluded.value,
         updated_at = excluded.updated_at`,
    ).run("session_seen_at", "0", 1_700_000_000_000);

    db.prepare(
      `INSERT INTO kv_store (key, value, updated_at)
       VALUES (?, ?, ?)
       ON CONFLICT(key) DO UPDATE SET
         value = excluded.value,
         updated_at = excluded.updated_at`,
    ).run("session_seen_at", "1", 1_700_000_000_500);

    const row = db
      .prepare(
        "SELECT value, updated_at FROM kv_store WHERE key = 'session_seen_at'",
      )
      .get() as { value: string; updated_at: number };
    expect(row).toEqual({ value: "1", updated_at: 1_700_000_000_500 });
  });
});
