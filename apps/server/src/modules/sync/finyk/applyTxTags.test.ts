import type { PoolClient } from "pg";
import { describe, expect, it } from "vitest";

import type { SyncV2Op } from "../../../http/schemas.js";
import { applyFinykTxTags, TX_TAGS_MAX_COUNT } from "./applyTxTags.js";

interface RecordedQuery {
  sql: string;
  params: unknown[];
}

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
  ({ op: kind, table: "finyk_tx_tags", row }) as SyncV2Op;

const TS = new Date("2026-10-19T10:00:00.000Z");
const OLDER = new Date("2026-10-19T09:00:00.000Z");
const NEWER = new Date("2026-10-19T11:00:00.000Z");

const base = { user_id: "u1", transaction_id: "tx-1" };

describe("applyFinykTxTags", () => {
  it("вставляє теги з LWW-предикатом у самому SQL", async () => {
    const fake = new FakeClient();
    fake.queueRows([]);
    const res = await applyFinykTxTags(
      asClient(fake),
      op("insert", { ...base, tags_json: '["Відпустка","ремонт"]' }),
      "u1",
      TS,
    );
    expect(res).toEqual({ status: "applied" });
    const write = fake.queries[fake.queries.length - 1]!;
    expect(write.sql).toContain("INSERT INTO finyk_tx_tags");
    expect(write.sql).toContain(
      "WHERE finyk_tx_tags.updated_at < EXCLUDED.updated_at",
    );
    expect(write.params[2]).toBe('["Відпустка","ремонт"]');
  });

  it("delete ставить tombstone, застарілий upsert після нього відхиляється", async () => {
    const fake = new FakeClient();
    fake.queueRows([{ updated_at: TS }]);
    const del = await applyFinykTxTags(
      asClient(fake),
      op("delete", base),
      "u1",
      NEWER,
    );
    expect(del).toEqual({ status: "applied" });
    expect(fake.queries[1]!.sql).toContain("SET deleted_at = $1");

    fake.queueRows([{ updated_at: NEWER }]);
    const stale = await applyFinykTxTags(
      asClient(fake),
      op("update", { ...base, tags_json: '["а"]' }),
      "u1",
      OLDER,
    );
    expect(stale).toEqual({ status: "rejected", reason: "lww_conflict" });
  });

  it("відхиляє не-масив і не-рядкові теги до запитів", async () => {
    const fake = new FakeClient();
    for (const tags_json of ['{"a":1}', "not json", "[1,2]"]) {
      const res = await applyFinykTxTags(
        asClient(fake),
        op("insert", { ...base, tags_json }),
        "u1",
        TS,
      );
      expect(res).toEqual({ status: "rejected", reason: "missing_data_json" });
    }
    expect(fake.queries).toHaveLength(0);
  });

  it("межа: забагато тегів або задовгий тег = text_too_long", async () => {
    const fake = new FakeClient();
    const many = JSON.stringify(
      Array.from({ length: TX_TAGS_MAX_COUNT + 1 }, (_, i) => `t${i}`),
    );
    const long = JSON.stringify(["x".repeat(201)]);
    for (const tags_json of [many, long]) {
      const res = await applyFinykTxTags(
        asClient(fake),
        op("insert", { ...base, tags_json }),
        "u1",
        TS,
      );
      expect(res).toEqual({ status: "rejected", reason: "text_too_long" });
    }
    expect(fake.queries).toHaveLength(0);
  });

  it("чужий user_id відхиляється", async () => {
    const fake = new FakeClient();
    const res = await applyFinykTxTags(
      asClient(fake),
      op("insert", { ...base, user_id: "u2", tags_json: "[]" }),
      "u1",
      TS,
    );
    expect(res).toEqual({ status: "rejected", reason: "user_id_mismatch" });
  });
});
