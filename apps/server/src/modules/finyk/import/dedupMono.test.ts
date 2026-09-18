import { describe, expect, it, vi } from "vitest";
import type { PoolClient } from "pg";
import { findMonoMatch } from "./dedupMono.js";

function makeClient(rows: Array<{ mono_tx_id: string }>) {
  const query = vi.fn().mockResolvedValue({ rows });
  return { query } as unknown as PoolClient;
}

describe("findMonoMatch", () => {
  it("повертає monoTxId, коли знайдено рядок", async () => {
    const client = makeClient([{ mono_tx_id: "tx-1" }]);
    const result = await findMonoMatch(client, {
      userId: "u1",
      date: "2026-01-15",
      amountKopiykas: 10000,
      direction: "expense",
    });
    expect(result).toEqual({ monoTxId: "tx-1" });
  });

  it("повертає null, коли нічого не знайдено", async () => {
    const client = makeClient([]);
    const result = await findMonoMatch(client, {
      userId: "u1",
      date: "2026-01-15",
      amountKopiykas: 10000,
      direction: "expense",
    });
    expect(result).toBeNull();
  });

  it("передає direction і суму як SQL-параметри (не інтерполює в текст запиту)", async () => {
    const client = makeClient([]);
    await findMonoMatch(client, {
      userId: "u1",
      date: "2026-01-20",
      amountKopiykas: 55500,
      direction: "income",
    });
    const query = client.query as unknown as ReturnType<typeof vi.fn>;
    const [sql, params] = query.mock.calls[0] as [string, unknown[]];
    expect(sql).toContain("t.user_id = $1");
    expect(sql).toContain("$3::text = 'expense'");
    expect(sql).toContain("$3::text = 'income'");
    expect(params).toEqual(["u1", 55500, "income", "2026-01-20"]);
  });

  it("SQL фільтрує за знаком amount відповідно до direction (обидва напрями в запиті)", async () => {
    const client = makeClient([]);
    await findMonoMatch(client, {
      userId: "u1",
      date: "2026-01-15",
      amountKopiykas: 10000,
      direction: "expense",
    });
    const query = client.query as unknown as ReturnType<typeof vi.fn>;
    const [sql] = query.mock.calls[0] as [string, unknown[]];
    expect(sql).toContain("t.amount < 0");
    expect(sql).toContain("t.amount > 0");
  });

  it("SQL фільтрує deleted_at IS NULL (soft-delete, міграція 024)", async () => {
    const client = makeClient([]);
    await findMonoMatch(client, {
      userId: "u1",
      date: "2026-01-15",
      amountKopiykas: 10000,
      direction: "expense",
    });
    const query = client.query as unknown as ReturnType<typeof vi.fn>;
    const [sql] = query.mock.calls[0] as [string, unknown[]];
    expect(sql).toContain("t.deleted_at IS NULL");
  });

  it("SQL використовує Kyiv-day-diff (timezone('Europe/Kyiv', ...)), не raw interval", async () => {
    const client = makeClient([]);
    await findMonoMatch(client, {
      userId: "u1",
      date: "2026-01-15",
      amountKopiykas: 10000,
      direction: "expense",
    });
    const query = client.query as unknown as ReturnType<typeof vi.fn>;
    const [sql] = query.mock.calls[0] as [string, unknown[]];
    expect(sql).toContain("timezone('Europe/Kyiv', t.time)");
    expect(sql).toContain("<= 1");
  });
});
