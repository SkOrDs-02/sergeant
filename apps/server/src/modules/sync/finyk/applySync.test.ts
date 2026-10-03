import type { PoolClient } from "pg";
import { describe, expect, it } from "vitest";

import type { SyncV2Op } from "../../../http/schemas.js";
import {
  applyFinykHiddenTransactions,
  applyFinykPrefs,
  applyFinykTxCategories,
} from "./applySync.js";

interface RecordedQuery {
  sql: string;
  params: unknown[];
}

class FakeClient {
  readonly queries: RecordedQuery[] = [];
  private readonly queuedRows: unknown[][] = [];

  queueRows(rows: unknown[]): void {
    this.queuedRows.push(rows);
  }

  async query<T = Record<string, unknown>>(
    sql: string,
    params: unknown[] = [],
  ): Promise<{ rows: T[] }> {
    this.queries.push({ sql, params });
    if (/^\s*SELECT\b/i.test(sql)) {
      return { rows: (this.queuedRows.shift() ?? []) as T[] };
    }
    return { rows: [] };
  }
}

function asClient(fake: FakeClient): PoolClient {
  return fake as unknown as PoolClient;
}

function syncOp(
  table: string,
  kind: SyncV2Op["op"],
  row: Record<string, unknown>,
): SyncV2Op {
  return { op: kind, table, row } as SyncV2Op;
}

function lastQuery(fake: FakeClient): RecordedQuery {
  const query = fake.queries[fake.queries.length - 1];
  if (!query) throw new Error("expected a recorded query");
  return query;
}

describe("applyFinykHiddenTransactions", () => {
  it("inserts transaction tombstones using transaction_id as the external key", async () => {
    const fake = new FakeClient();
    const clientTs = new Date("2026-07-21T08:00:00.000Z");

    await expect(
      applyFinykHiddenTransactions(
        asClient(fake),
        syncOp("finyk_hidden_transactions", "insert", {
          user_id: "user-1",
          transaction_id: "tx-1",
          created_at: "2026-07-21T07:00:00.000Z",
        }),
        "user-1",
        clientTs,
      ),
    ).resolves.toEqual({ status: "applied" });

    const insert = lastQuery(fake);
    expect(insert.sql).toContain("INSERT INTO finyk_hidden_transactions");
    expect(insert.sql).toContain("transaction_id");
    expect(insert.params).toEqual([
      "user-1",
      "tx-1",
      new Date("2026-07-21T07:00:00.000Z"),
      clientTs,
      null,
    ]);
  });

  it("rejects missing external ids before querying", async () => {
    const fake = new FakeClient();

    await expect(
      applyFinykHiddenTransactions(
        asClient(fake),
        syncOp("finyk_hidden_transactions", "insert", { user_id: "user-1" }),
        "user-1",
        new Date("2026-07-21T08:00:00.000Z"),
      ),
    ).resolves.toEqual({ status: "rejected", reason: "missing_ext_id" });
    expect(fake.queries).toHaveLength(0);
  });
});

describe("applyFinykTxCategories", () => {
  it("requires category_id for upserts", async () => {
    const fake = new FakeClient();

    await expect(
      applyFinykTxCategories(
        asClient(fake),
        syncOp("finyk_tx_categories", "update", {
          user_id: "user-1",
          transaction_id: "tx-1",
        }),
        "user-1",
        new Date("2026-07-21T08:00:00.000Z"),
      ),
    ).resolves.toEqual({ status: "rejected", reason: "missing_category_id" });
    expect(fake.queries).toHaveLength(1);
  });

  it("deletes transaction categories without requiring category_id", async () => {
    const fake = new FakeClient();
    const clientTs = new Date("2026-07-21T08:00:00.000Z");

    await expect(
      applyFinykTxCategories(
        asClient(fake),
        syncOp("finyk_tx_categories", "delete", {
          user_id: "user-1",
          transaction_id: "tx-1",
        }),
        "user-1",
        clientTs,
      ),
    ).resolves.toEqual({ status: "applied" });

    const deletion = lastQuery(fake);
    expect(deletion.sql).toContain("DELETE FROM finyk_tx_categories");
    expect(deletion.sql).toContain("AND updated_at < $3");
    expect(deletion.params).toEqual(["user-1", "tx-1", clientTs]);
  });
});

describe("applyFinykPrefs", () => {
  it("coerces numeric show_balance false and defaults JSON arrays", async () => {
    const fake = new FakeClient();
    const clientTs = new Date("2026-07-21T08:00:00.000Z");

    await expect(
      applyFinykPrefs(
        asClient(fake),
        syncOp("finyk_prefs", "insert", {
          user_id: "user-1",
          show_balance: 0,
          prefs_json: { currency: "UAH" },
        }),
        "user-1",
        clientTs,
      ),
    ).resolves.toEqual({ status: "applied" });

    const insert = lastQuery(fake);
    expect(insert.sql).toContain("INSERT INTO finyk_prefs");
    expect(insert.params).toEqual([
      "user-1",
      '{"currency":"UAH"}',
      "{}",
      false,
      "[]",
      "[]",
      clientTs,
      clientTs,
    ]);
  });

  it("rejects stale prefs writes with LWW conflict", async () => {
    const fake = new FakeClient();
    fake.queueRows([{ updated_at: new Date("2026-07-21T08:00:00.000Z") }]);

    await expect(
      applyFinykPrefs(
        asClient(fake),
        syncOp("finyk_prefs", "update", { user_id: "user-1" }),
        "user-1",
        new Date("2026-07-21T07:59:00.000Z"),
      ),
    ).resolves.toEqual({ status: "rejected", reason: "lww_conflict" });
    expect(fake.queries).toHaveLength(1);
  });

  // Правила «Завжди так для цього магазину» (рішення власника 2026-10-01)
  // живуть у `finyk_prefs.prefs_json.merchantRules`: окремої таблиці й
  // міграції немає, тож сервер мусить віддати JSON як є — і при створенні
  // рядка, і при оновленні (whole-row LWW).
  describe("prefs_json.merchantRules", () => {
    const rules = {
      merchantRules: [
        {
          id: "mr_1",
          kind: "expense",
          merchantKey: "сільпо",
          categoryId: "transport",
          label: "Сільпо №5",
          createdAt: "2026-10-01T10:00:00.000Z",
          updatedAt: "2026-10-01T10:00:00.000Z",
        },
      ],
    };

    it("зберігає правила в prefs_json без змін при створенні рядка", async () => {
      const fake = new FakeClient();
      const clientTs = new Date("2026-10-01T10:00:00.000Z");

      await expect(
        applyFinykPrefs(
          asClient(fake),
          syncOp("finyk_prefs", "insert", {
            user_id: "user-1",
            prefs_json: rules,
          }),
          "user-1",
          clientTs,
        ),
      ).resolves.toEqual({ status: "applied" });

      const insert = lastQuery(fake);
      expect(insert.sql).toContain("INSERT INTO finyk_prefs");
      expect(JSON.parse(insert.params[1] as string)).toEqual(rules);
    });

    it("перезаписує prefs_json цілком при новішому оновленні (видалення правила доходить)", async () => {
      const fake = new FakeClient();
      fake.queueRows([{ updated_at: new Date("2026-10-01T09:00:00.000Z") }]);
      const clientTs = new Date("2026-10-01T10:00:00.000Z");

      await expect(
        applyFinykPrefs(
          asClient(fake),
          syncOp("finyk_prefs", "update", {
            user_id: "user-1",
            prefs_json: { merchantRules: [] },
          }),
          "user-1",
          clientTs,
        ),
      ).resolves.toEqual({ status: "applied" });

      const update = lastQuery(fake);
      expect(update.sql).toContain("UPDATE finyk_prefs");
      expect(update.sql).toContain("prefs_json           = $1::jsonb");
      expect(JSON.parse(update.params[0] as string)).toEqual({
        merchantRules: [],
      });
    });

    it("старіше за серверне оновлення правило не затирає (LWW)", async () => {
      const fake = new FakeClient();
      fake.queueRows([{ updated_at: new Date("2026-10-01T10:00:00.000Z") }]);

      await expect(
        applyFinykPrefs(
          asClient(fake),
          syncOp("finyk_prefs", "update", {
            user_id: "user-1",
            prefs_json: { merchantRules: [] },
          }),
          "user-1",
          new Date("2026-10-01T09:59:00.000Z"),
        ),
      ).resolves.toEqual({ status: "rejected", reason: "lww_conflict" });
    });
  });
});
