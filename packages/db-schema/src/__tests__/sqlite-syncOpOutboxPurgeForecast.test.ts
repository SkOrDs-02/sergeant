import Database from "better-sqlite3";
import type { Database as BetterSqliteDatabase } from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  createSqliteAdapter,
  type SqliteMigrationClient,
} from "../migrate/adapters/sqlite.js";
import { runMigrations } from "../migrate/runner.js";
import {
  ROUTINE_CLIENT_MIGRATIONS,
  ROUTINE_MIGRATIONS_TABLE,
} from "../sqlite/migrations/index.js";
import {
  forecastStaleTerminalOutboxPurge,
  SYNC_OP_OUTBOX_PURGE_WARNING_DAYS,
} from "../sqlite/syncOpOutboxPurgeForecast.js";
import {
  purgeStaleTerminalOutbox,
  SYNC_OP_OUTBOX_STALE_TTL_DAYS,
} from "../sqlite/syncOpOutboxPurgeStale.js";
import type { SyncOpOutboxStatus } from "../sqlite/routine.js";

/**
 * PR-T2: прогноз TTL-чистки мусить бачити рівно ті рядки, які чистка
 * забере протягом вікна попередження, і нічого більше.
 */

function syncClient(db: BetterSqliteDatabase): SqliteMigrationClient {
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

const DAY_MS = 24 * 60 * 60 * 1000;

function daysAgoIso(days: number): string {
  return new Date(Date.now() - days * DAY_MS).toISOString();
}

let seq = 0;

function insertRow(
  db: BetterSqliteDatabase,
  opts: {
    status: SyncOpOutboxStatus;
    createdAt: string;
    userId?: string;
    rejectReason?: string;
  },
): void {
  seq += 1;
  db.prepare(
    `INSERT INTO sync_op_outbox
       (user_id, table_name, op, row, client_ts, idempotency_key, status, created_at, reject_reason)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    opts.userId ?? "u-test",
    "routine_entries",
    "insert",
    JSON.stringify({ day_key: "2020-01-01" }),
    "2020-01-01T00:00:00.000+00:00",
    `idem-forecast-${seq}`,
    opts.status,
    opts.createdAt,
    opts.rejectReason ?? null,
  );
}

describe("forecastStaleTerminalOutboxPurge", () => {
  let db: BetterSqliteDatabase;
  let client: SqliteMigrationClient;

  beforeEach(async () => {
    db = new Database(":memory:");
    client = syncClient(db);
    await runMigrations({
      adapter: createSqliteAdapter(client),
      files: ROUTINE_CLIENT_MIGRATIONS,
      tableName: ROUTINE_MIGRATIONS_TABLE,
    });
  });

  afterEach(() => {
    db.close();
  });

  it("порожня черга: нуль і без дати", async () => {
    await expect(forecastStaleTerminalOutboxPurge(client)).resolves.toEqual({
      count: 0,
      earliestPurgeAtIso: null,
    });
  });

  it("рахує лише рядки у вікні попередження, дата = найстаріший + TTL", async () => {
    const oldest = daysAgoIso(28);
    insertRow(db, { status: "dead_letter", createdAt: oldest });
    insertRow(db, { status: "rejected", createdAt: daysAgoIso(25) });
    // Молодший за вікно: чистка ще далеко.
    insertRow(db, { status: "dead_letter", createdAt: daysAgoIso(10) });

    const forecast = await forecastStaleTerminalOutboxPurge(client);

    expect(forecast.count).toBe(2);
    const expected =
      Date.parse(oldest) + SYNC_OP_OUTBOX_STALE_TTL_DAYS * DAY_MS;
    // strftime обрізає до секунди.
    expect(
      Math.abs(Date.parse(forecast.earliestPurgeAtIso ?? "") - expected),
    ).toBeLessThan(2000);
  });

  it("не бачить pending і quarantined: чистка їх не чіпає", async () => {
    insertRow(db, { status: "pending", createdAt: daysAgoIso(29) });
    insertRow(db, { status: "quarantined", createdAt: daysAgoIso(29) });

    const forecast = await forecastStaleTerminalOutboxPurge(client);
    expect(forecast.count).toBe(0);
  });

  it("виключає безпечні причини лише для rejected", async () => {
    insertRow(db, {
      status: "rejected",
      createdAt: daysAgoIso(29),
      rejectReason: "lww_conflict",
    });
    insertRow(db, {
      status: "rejected",
      createdAt: daysAgoIso(29),
      rejectReason: "fk_violation",
    });
    insertRow(db, {
      status: "dead_letter",
      createdAt: daysAgoIso(29),
      rejectReason: "lww_conflict",
    });

    const forecast = await forecastStaleTerminalOutboxPurge(client, {
      excludeRejectReasons: ["lww_conflict"],
    });
    expect(forecast.count).toBe(2);
  });

  it("скоуп власника", async () => {
    insertRow(db, {
      status: "dead_letter",
      createdAt: daysAgoIso(29),
      userId: "a",
    });
    insertRow(db, {
      status: "dead_letter",
      createdAt: daysAgoIso(29),
      userId: "b",
    });

    const forecast = await forecastStaleTerminalOutboxPurge(client, {
      userId: "a",
    });
    expect(forecast.count).toBe(1);
  });

  it("усе, що прогноз бачив поза TTL, наступна чистка справді видаляє", async () => {
    insertRow(db, { status: "dead_letter", createdAt: daysAgoIso(40) });
    insertRow(db, { status: "rejected", createdAt: daysAgoIso(40) });

    const forecast = await forecastStaleTerminalOutboxPurge(client);
    expect(forecast.count).toBe(2);
    expect(Date.parse(forecast.earliestPurgeAtIso ?? "")).toBeLessThan(
      Date.now(),
    );

    const { purged } = await purgeStaleTerminalOutbox(client, {
      olderThanDays: SYNC_OP_OUTBOX_STALE_TTL_DAYS,
    });
    expect(purged).toBe(forecast.count);
  });

  it("відкидає некоректні вікна", async () => {
    await expect(
      forecastStaleTerminalOutboxPurge(client, { warnWithinDays: 0 }),
    ).rejects.toThrow(/warnWithinDays/);
    await expect(
      forecastStaleTerminalOutboxPurge(client, {
        olderThanDays: 5,
        warnWithinDays: SYNC_OP_OUTBOX_PURGE_WARNING_DAYS,
      }),
    ).rejects.toThrow(/warnWithinDays/);
    await expect(
      forecastStaleTerminalOutboxPurge(client, { olderThanDays: 0 }),
    ).rejects.toThrow(/olderThanDays/);
    await expect(
      forecastStaleTerminalOutboxPurge(client, { userId: "" }),
    ).rejects.toThrow(/userId/);
  });
});
