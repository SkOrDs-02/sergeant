import { describe, it, expect, vi } from "vitest";
import type { PoolClient } from "pg";
import { matchReceiptToMono } from "./matcher.js";

function mockClient(
  impl: (sql: string, params: unknown[]) => Promise<{ rows: unknown[] }>,
): PoolClient {
  return { query: vi.fn(impl) } as unknown as PoolClient;
}

const BASE_INPUT = {
  userId: "u1",
  fiscalNum: null as string | null,
  totalKopiykas: 15000,
  purchasedAt: new Date("2026-01-15T12:00:00.000Z"),
};

describe("matchReceiptToMono", () => {
  it("сильний матч: fiscalNum === mono_transaction.receipt_id → лінк без запиту суми/дати", async () => {
    const client = mockClient(async (sql) => {
      expect(sql).toContain("t.receipt_id = $2");
      return { rows: [{ mono_tx_id: "mono-strong-1" }] };
    });

    const result = await matchReceiptToMono(client, {
      ...BASE_INPUT,
      fiscalNum: "4000123456",
    });

    expect(result).toEqual({ kind: "mono", monoTxId: "mono-strong-1" });
    expect(client.query).toHaveBeenCalledTimes(1); // слабкий запит не викликається
  });

  it("сильний матч не знайдено → падає на слабкий (сума+дата)", async () => {
    let call = 0;
    const client = mockClient(async (sql) => {
      call += 1;
      if (call === 1) {
        expect(sql).toContain("t.receipt_id = $2");
        return { rows: [] };
      }
      expect(sql).toContain("ABS(t.amount) = $2::bigint");
      expect(sql).toContain("Europe/Kyiv");
      return { rows: [{ mono_tx_id: "mono-weak-1" }] };
    });

    const result = await matchReceiptToMono(client, {
      ...BASE_INPUT,
      fiscalNum: "4000123456",
    });

    expect(result).toEqual({ kind: "mono", monoTxId: "mono-weak-1" });
    expect(call).toBe(2);
  });

  it("fiscalNum: null — одразу слабкий запит, сильний пропускається", async () => {
    const client = mockClient(async (sql) => {
      expect(sql).toContain("ABS(t.amount)");
      return { rows: [{ mono_tx_id: "mono-weak-2" }] };
    });

    const result = await matchReceiptToMono(client, BASE_INPUT);

    expect(result).toEqual({ kind: "mono", monoTxId: "mono-weak-2" });
    expect(client.query).toHaveBeenCalledTimes(1);
  });

  it("нічого не знайдено → {kind: 'none'}", async () => {
    const client = mockClient(async () => ({ rows: [] }));
    const result = await matchReceiptToMono(client, BASE_INPUT);
    expect(result).toEqual({ kind: "none" });
  });

  it("передає totalKopiykas і purchasedAt.toISOString() як SQL-параметри слабкого запиту", async () => {
    const client = mockClient(async (_sql, params) => {
      expect(params).toEqual(["u1", 15000, "2026-01-15T12:00:00.000Z"]);
      return { rows: [] };
    });
    await matchReceiptToMono(client, BASE_INPUT);
  });

  it("слабкий запит виключає mono-транзакції з amount >= 0 (перевірка тексту SQL)", async () => {
    const client = mockClient(async (sql) => {
      expect(sql).toContain("t.amount < 0");
      return { rows: [] };
    });
    await matchReceiptToMono(client, BASE_INPUT);
  });

  it("обидва запити виключають уже привʼязані mono-транзакції (NOT EXISTS finyk_tx_receipt_links)", async () => {
    let call = 0;
    const client = mockClient(async (sql) => {
      call += 1;
      expect(sql).toContain("NOT EXISTS");
      expect(sql).toContain("finyk_tx_receipt_links");
      return { rows: [] };
    });
    await matchReceiptToMono(client, { ...BASE_INPUT, fiscalNum: "fn-1" });
    expect(call).toBe(2); // і сильний, і слабкий (обидва порожні) перевірені
  });

  it("обидва запити виключають mono-транзакції, вже привʼязані до Сільпо-чека (NOT EXISTS silpo_tx_receipt_links, §1.14)", async () => {
    let call = 0;
    const client = mockClient(async (sql) => {
      call += 1;
      expect(sql).toContain("silpo_tx_receipt_links");
      return { rows: [] };
    });
    await matchReceiptToMono(client, { ...BASE_INPUT, fiscalNum: "fn-1" });
    expect(call).toBe(2);
  });

  it("обидва запити фільтрують deleted_at IS NULL (soft-delete, міграція 024)", async () => {
    const client = mockClient(async (sql) => {
      expect(sql).toContain("t.deleted_at IS NULL");
      return { rows: [] };
    });
    await matchReceiptToMono(client, BASE_INPUT);
  });
});
