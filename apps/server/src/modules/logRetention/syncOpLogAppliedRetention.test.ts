/**
 * Юніт-тести чистки `applied`-оп-ів (`syncOpLogAppliedRetention.ts`,
 * ADR-0105 §2) на мок-пулі: вимкнення, параметри запиту, метрики, форма
 * SQL (видалення й межа журналу в одному запиті). Поведінку самого SQL на
 * справжньому Postgres тримає `syncOpLogAppliedRetention.integration.test.ts`.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Pool } from "pg";

import { register } from "../../obs/metrics.js";
import {
  SYNC_OP_LOG_APPLIED_RETENTION_BATCH,
  SYNC_OP_LOG_APPLIED_RETENTION_SQL,
  SyncOpLogAppliedRetentionPoller,
} from "./syncOpLogAppliedRetention.js";

function makePool(deleted: number, users: number, reltuples = 1234) {
  const query = vi.fn(async (sql: string) => {
    if (sql.includes("pg_class"))
      return { rows: [{ rows: String(reltuples) }] };
    return { rows: [{ deleted, users }] };
  });
  return { pool: { query } as unknown as Pool, query };
}

async function metricValue(name: string): Promise<number> {
  const metric = register.getSingleMetric(name);
  const data = await metric!.get();
  return data.values.reduce((acc, v) => acc + v.value, 0);
}

describe("SyncOpLogAppliedRetentionPoller", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("за 0 днів нічого не робить і не стартує", async () => {
    const { pool, query } = makePool(10, 1);
    const poller = new SyncOpLogAppliedRetentionPoller({
      pool,
      retentionDays: 0,
      startDelayMs: 0,
    });
    expect(poller.enabled).toBe(false);
    poller.start();
    expect(await poller.runOnce()).toEqual({ deleted: 0, users: 0 });
    expect(query).not.toHaveBeenCalled();
    await poller.stop();
  });

  it("відʼємне чи нечислове значення = вимкнено", () => {
    const { pool } = makePool(0, 0);
    for (const retentionDays of [-5, Number.NaN]) {
      expect(
        new SyncOpLogAppliedRetentionPoller({ pool, retentionDays }).enabled,
      ).toBe(false);
    }
  });

  it("тік: вікно й партія в параметрах, лічильник і розмір таблиці в метриках", async () => {
    const { pool, query } = makePool(42, 3, 9876);
    const before = await metricValue("sync_op_log_applied_deleted_total");
    const poller = new SyncOpLogAppliedRetentionPoller({
      pool,
      retentionDays: 90,
    });

    expect(await poller.runOnce()).toEqual({ deleted: 42, users: 3 });

    expect(query).toHaveBeenNthCalledWith(
      1,
      SYNC_OP_LOG_APPLIED_RETENTION_SQL,
      [90, SYNC_OP_LOG_APPLIED_RETENTION_BATCH],
    );
    expect(SYNC_OP_LOG_APPLIED_RETENTION_BATCH).toBe(5_000);
    expect(await metricValue("sync_op_log_applied_deleted_total")).toBe(
      before + 42,
    );
    expect(await metricValue("sync_op_log_rows")).toBe(9876);
  });

  it("збій метрики розміру не валить тік", async () => {
    const query = vi.fn(async (sql: string) => {
      if (sql.includes("pg_class")) throw new Error("no relation");
      return { rows: [{ deleted: 1, users: 1 }] };
    });
    const poller = new SyncOpLogAppliedRetentionPoller({
      pool: { query } as unknown as Pool,
      retentionDays: 90,
    });
    await expect(poller.runOnce()).resolves.toEqual({ deleted: 1, users: 1 });
  });

  it("тіки не накладаються", async () => {
    let release: (() => void) | undefined;
    const query = vi.fn(async (sql: string) => {
      if (sql.includes("pg_class")) return { rows: [] };
      await new Promise<void>((resolve) => {
        release = resolve;
      });
      return { rows: [{ deleted: 1, users: 1 }] };
    });
    const poller = new SyncOpLogAppliedRetentionPoller({
      pool: { query } as unknown as Pool,
      retentionDays: 90,
    });
    const first = poller.runOnce();
    expect(await poller.runOnce()).toEqual({ deleted: 0, users: 0 });
    release!();
    expect(await first).toEqual({ deleted: 1, users: 1 });
    expect(
      query.mock.calls.filter(([sql]) => !String(sql).includes("pg_class")),
    ).toHaveLength(1);
  });
});

describe("SYNC_OP_LOG_APPLIED_RETENTION_SQL — форма", () => {
  const sql = SYNC_OP_LOG_APPLIED_RETENTION_SQL;

  it("видаляє лише applied старші за вікно, найстаріші першими, партією", () => {
    expect(sql).toMatch(/now\(\) - \(\$1::int \* INTERVAL '1 day'\)/);
    expect(sql.match(/status = 'applied'/g)).toHaveLength(2);
    expect(sql).toMatch(/ORDER BY id ASC\s+LIMIT \$2::int/);
    expect(sql).not.toMatch(/rejected/);
  });

  it("межа журналу піднімається в тому ж запиті, що й DELETE, і не опускається", () => {
    const del = sql.indexOf("DELETE FROM sync_op_log");
    const floor = sql.indexOf("INSERT INTO sync_op_log_floor");
    expect(del).toBeGreaterThan(-1);
    expect(floor).toBeGreaterThan(del);
    expect(sql).toMatch(/SELECT user_id, max\(id\), now\(\) FROM deleted/);
    expect(sql).toMatch(/GREATEST\(f\.floor_id, EXCLUDED\.floor_id\)/);
  });
});
