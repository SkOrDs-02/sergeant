import { describe, expect, it, vi } from "vitest";
import type { PoolClient } from "pg";
import { findMonoMatchedRows } from "./dedupMono.js";

function makeClient(rows: Array<{ ord: string }>) {
  const query = vi.fn().mockResolvedValue({ rows });
  return { query } as unknown as PoolClient;
}

const EXPENSE = {
  date: "2026-01-15",
  amountKopiykas: 10000,
  direction: "expense" as const,
};

function sqlOf(client: PoolClient): [string, unknown[]] {
  const query = client.query as unknown as ReturnType<typeof vi.fn>;
  return query.mock.calls[0] as [string, unknown[]];
}

describe("findMonoMatchedRows", () => {
  it("мапить ord (bigint-рядок, 1-based) на прапорці 1:1 з рядками", async () => {
    const client = makeClient([{ ord: "1" }, { ord: "3" }]);
    const result = await findMonoMatchedRows(client, "u1", [
      EXPENSE,
      EXPENSE,
      EXPENSE,
    ]);
    expect(result).toEqual([true, false, true]);
  });

  it("усі false, коли нічого не знайдено", async () => {
    const client = makeClient([]);
    expect(await findMonoMatchedRows(client, "u1", [EXPENSE])).toEqual([false]);
  });

  it("порожній вхід: жодного запиту до БД", async () => {
    const client = makeClient([]);
    expect(await findMonoMatchedRows(client, "u1", [])).toEqual([]);
    expect(client.query).not.toHaveBeenCalled();
  });

  it("один запит на батч; рядки йдуть масивами-параметрами, не інтерполяцією", async () => {
    const client = makeClient([]);
    await findMonoMatchedRows(client, "u1", [
      { date: "2026-01-20", amountKopiykas: 55500, direction: "income" },
      EXPENSE,
    ]);
    expect(client.query).toHaveBeenCalledTimes(1);
    const [sql, params] = sqlOf(client);
    expect(sql).toContain("t.user_id = $1");
    expect(sql).toContain("WITH ORDINALITY");
    expect(params).toEqual([
      "u1",
      ["2026-01-20", "2026-01-15"],
      [55500, 10000],
      ["income", "expense"],
    ]);
  });

  it("SQL зберігає предикати колишнього per-row запиту", async () => {
    const client = makeClient([]);
    await findMonoMatchedRows(client, "u1", [EXPENSE]);
    const [sql] = sqlOf(client);
    expect(sql).toContain("t.deleted_at IS NULL");
    expect(sql).toContain("ABS(t.amount) = r.amount");
    expect(sql).toContain("r.direction = 'expense' AND t.amount < 0");
    expect(sql).toContain("r.direction = 'income' AND t.amount > 0");
    expect(sql).toContain("timezone('Europe/Kyiv', t.time)");
    expect(sql).toContain("<= 1");
  });
});
