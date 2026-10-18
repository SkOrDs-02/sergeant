import type { PoolClient } from "pg";
import { describe, expect, it } from "vitest";

import type { SyncV2Op } from "../../../http/schemas.js";
import { applyFinykTxNotes } from "./applyTxNotes.js";

interface RecordedQuery {
  sql: string;
  params: unknown[];
}

/**
 * Мінімальний фейк `PoolClient`: SELECT повертає поставлені в чергу рядки,
 * решта запитів віддає `rowCount` (0 імітує LWW-відсів у самому SQL).
 */
class FakeClient {
  readonly queries: RecordedQuery[] = [];
  private readonly queuedRows: unknown[][] = [];
  writeRowCount = 1;

  queueRows(rows: unknown[]): void {
    this.queuedRows.push(rows);
  }

  async query<T = Record<string, unknown>>(
    sql: string,
    params: unknown[] = [],
  ): Promise<{ rows: T[]; rowCount: number }> {
    this.queries.push({ sql, params });
    if (/^\s*SELECT\b/i.test(sql)) {
      const rows = (this.queuedRows.shift() ?? []) as T[];
      return { rows, rowCount: rows.length };
    }
    return { rows: [], rowCount: this.writeRowCount };
  }
}

const asClient = (fake: FakeClient): PoolClient =>
  fake as unknown as PoolClient;

const op = (kind: SyncV2Op["op"], row: Record<string, unknown>): SyncV2Op =>
  ({ op: kind, table: "finyk_tx_notes", row }) as SyncV2Op;

const TS = new Date("2026-10-10T10:00:00.000Z");
const OLDER = new Date("2026-10-10T09:00:00.000Z");
const NEWER = new Date("2026-10-10T11:00:00.000Z");

const lastQuery = (fake: FakeClient): RecordedQuery => {
  const q = fake.queries[fake.queries.length - 1];
  if (!q) throw new Error("expected a recorded query");
  return q;
};

describe("applyFinykTxNotes", () => {
  it("вставляє нову нотатку з LWW-предикатом у самому SQL", async () => {
    const fake = new FakeClient();
    await expect(
      applyFinykTxNotes(
        asClient(fake),
        op("insert", {
          user_id: "u1",
          transaction_id: "tx-1",
          note: "  оренда  ",
        }),
        "u1",
        TS,
      ),
    ).resolves.toEqual({ status: "applied" });

    const write = lastQuery(fake);
    expect(write.sql).toContain("INSERT INTO finyk_tx_notes");
    expect(write.sql).toContain("ON CONFLICT (user_id, transaction_id)");
    // Воскресіння tombstone і строгий LWW - в одному операторі.
    expect(write.sql).toContain("deleted_at = NULL");
    expect(write.sql).toContain(
      "WHERE finyk_tx_notes.updated_at < EXCLUDED.updated_at",
    );
    expect(write.params).toEqual(["u1", "tx-1", "оренда", TS, TS]);
  });

  it("відхиляє старіший оп як lww_conflict ще до запису", async () => {
    const fake = new FakeClient();
    fake.queueRows([{ updated_at: TS, deleted_at: null }]);
    await expect(
      applyFinykTxNotes(
        asClient(fake),
        op("update", { user_id: "u1", transaction_id: "tx-1", note: "a" }),
        "u1",
        OLDER,
      ),
    ).resolves.toEqual({ status: "rejected", reason: "lww_conflict" });
    expect(fake.queries).toHaveLength(1);
  });

  it("гонка: SQL-предикат відсікає запис, що встиг оновитись (0 рядків)", async () => {
    const fake = new FakeClient();
    fake.queueRows([{ updated_at: OLDER, deleted_at: null }]);
    fake.writeRowCount = 0;
    await expect(
      applyFinykTxNotes(
        asClient(fake),
        op("update", { user_id: "u1", transaction_id: "tx-1", note: "a" }),
        "u1",
        NEWER,
      ),
    ).resolves.toEqual({ status: "rejected", reason: "lww_conflict" });
  });

  it("delete - soft-delete з updated_at як мітка видалення", async () => {
    const fake = new FakeClient();
    fake.queueRows([{ updated_at: OLDER, deleted_at: null }]);
    await expect(
      applyFinykTxNotes(
        asClient(fake),
        op("delete", { user_id: "u1", transaction_id: "tx-1" }),
        "u1",
        NEWER,
      ),
    ).resolves.toEqual({ status: "applied" });
    const write = lastQuery(fake);
    expect(write.sql).toContain("UPDATE finyk_tx_notes");
    expect(write.sql).toContain(
      "SET note = '', deleted_at = $1, updated_at = $1",
    );
    expect(write.sql).not.toMatch(/DELETE FROM/);
    expect(write.params).toEqual([NEWER, "u1", "tx-1"]);
  });

  it("delete неіснуючої нотатки - tombstone з порожнім note, не not_found", async () => {
    const fake = new FakeClient();
    await expect(
      applyFinykTxNotes(
        asClient(fake),
        op("delete", { user_id: "u1", transaction_id: "tx-1" }),
        "u1",
        TS,
      ),
    ).resolves.toEqual({ status: "applied" });
    const write = lastQuery(fake);
    expect(write.sql).toContain("INSERT INTO finyk_tx_notes");
    expect(write.sql).toContain("VALUES ($1, $2, '', $3, $3, $3)");
    expect(write.sql).toContain(
      "WHERE finyk_tx_notes.updated_at < EXCLUDED.updated_at",
    );
    expect(write.params).toEqual(["u1", "tx-1", TS]);
  });

  it("порожня нотатка на update = soft-delete, а не помилка", async () => {
    const fake = new FakeClient();
    fake.queueRows([{ updated_at: OLDER, deleted_at: null }]);
    await expect(
      applyFinykTxNotes(
        asClient(fake),
        op("update", { user_id: "u1", transaction_id: "tx-1", note: "   " }),
        "u1",
        NEWER,
      ),
    ).resolves.toEqual({ status: "applied" });
    expect(lastQuery(fake).sql).toContain("SET deleted_at = $1");
  });

  it("порожня нотатка на insert без рядка - no-op, нічого не пишемо", async () => {
    const fake = new FakeClient();
    await expect(
      applyFinykTxNotes(
        asClient(fake),
        op("insert", { user_id: "u1", transaction_id: "tx-1", note: "" }),
        "u1",
        TS,
      ),
    ).resolves.toEqual({ status: "applied" });
    expect(fake.queries).toHaveLength(1);
  });

  it("межа довжини: нотатка понад NOTE_MAX_LEN і задовгий transaction_id", async () => {
    const fake = new FakeClient();
    await expect(
      applyFinykTxNotes(
        asClient(fake),
        op("insert", {
          user_id: "u1",
          transaction_id: "tx-1",
          note: "x".repeat(1001),
        }),
        "u1",
        TS,
      ),
    ).resolves.toEqual({ status: "rejected", reason: "text_too_long" });
    await expect(
      applyFinykTxNotes(
        asClient(fake),
        op("insert", {
          user_id: "u1",
          transaction_id: "t".repeat(201),
          note: "ok",
        }),
        "u1",
        TS,
      ),
    ).resolves.toEqual({ status: "rejected", reason: "text_too_long" });
    expect(fake.queries).toHaveLength(0);
  });

  it("нотатка рівно NOTE_MAX_LEN проходить", async () => {
    const fake = new FakeClient();
    await expect(
      applyFinykTxNotes(
        asClient(fake),
        op("insert", {
          user_id: "u1",
          transaction_id: "tx-1",
          note: "x".repeat(1000),
        }),
        "u1",
        TS,
      ),
    ).resolves.toEqual({ status: "applied" });
  });

  it("відхиляє без transaction_id і чужий/відсутній user_id до запитів", async () => {
    const fake = new FakeClient();
    await expect(
      applyFinykTxNotes(
        asClient(fake),
        op("insert", { user_id: "u1", note: "a" }),
        "u1",
        TS,
      ),
    ).resolves.toEqual({ status: "rejected", reason: "missing_tx_id" });
    await expect(
      applyFinykTxNotes(
        asClient(fake),
        op("insert", { transaction_id: "tx-1", note: "a" }),
        "u1",
        TS,
      ),
    ).resolves.toEqual({ status: "rejected", reason: "missing_user_id" });
    await expect(
      applyFinykTxNotes(
        asClient(fake),
        op("insert", { user_id: "u2", transaction_id: "tx-1", note: "a" }),
        "u1",
        TS,
      ),
    ).resolves.toEqual({ status: "rejected", reason: "user_id_mismatch" });
    expect(fake.queries).toHaveLength(0);
  });
});
