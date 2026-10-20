import { describe, expect, it, vi } from "vitest";
import type { PoolClient } from "pg";
import { findMonoMatchedRows } from "./dedupMono.js";

interface Pair {
  ord: string;
  mono_tx_id: string;
  day_diff: number;
}

/** Запит віддає пари «рядок - кандидат» уже в порядку `day_diff, ord, час, id`. */
function makeClient(pairs: Pair[]) {
  const query = vi.fn().mockResolvedValue({ rows: pairs });
  return { query } as unknown as PoolClient;
}

const pair = (ord: number, tx: string, dayDiff = 0): Pair => ({
  ord: String(ord),
  mono_tx_id: tx,
  day_diff: dayDiff,
});

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
    const client = makeClient([pair(1, "tx-a"), pair(3, "tx-b")]);
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

  it("data-30: кандидат лише з гривневого рахунку без банок (mono_account)", async () => {
    const client = makeClient([]);
    await findMonoMatchedRows(client, "u1", [EXPENSE]);
    const [sql] = sqlOf(client);
    expect(sql).toContain("JOIN mono_account a");
    expect(sql).toContain("a.mono_account_id = t.mono_account_id");
    expect(sql).toContain("a.currency_code = 980");
    expect(sql).toContain("a.is_jar = FALSE");
  });

  describe("споживання (data-30): одна mono-операція на один рядок", () => {
    it("два однакові рядки й одна mono-операція: збіг лише у першого", async () => {
      const client = makeClient([pair(1, "tx-a"), pair(2, "tx-a")]);
      expect(
        await findMonoMatchedRows(client, "u1", [EXPENSE, EXPENSE]),
      ).toEqual([true, false]);
    });

    it("два однакові рядки й дві mono-операції: збіг в обох", async () => {
      const client = makeClient([
        pair(1, "tx-a"),
        pair(1, "tx-b"),
        pair(2, "tx-a"),
        pair(2, "tx-b"),
      ]);
      expect(
        await findMonoMatchedRows(client, "u1", [EXPENSE, EXPENSE]),
      ).toEqual([true, true]);
    });

    it("один рядок з двома кандидатами споживає лише одного, інший лишається вільним", async () => {
      // Рядок 1 бачить tx-a і tx-b; рядок 2 бачить лише tx-a. Без споживання
      // рядка (рядок 1 забрав би обидві) рядок 2 лишився б без пари.
      const client = makeClient([
        pair(1, "tx-a"),
        pair(1, "tx-b"),
        pair(2, "tx-a"),
      ]);
      const result = await findMonoMatchedRows(client, "u1", [
        EXPENSE,
        EXPENSE,
      ]);
      // Жадібний прохід: рядок 1 бере tx-a першим (порядок із SQL), рядок 2
      // лишається без пари. Головне – tx-a не оплачує двох рядків одразу.
      expect(result).toEqual([true, false]);
    });

    it("точний день не програє сусідньому: пари впорядковано за day_diff", async () => {
      // Рядок 1 (15.01) бачить tx-a лише через ±1 добу; рядок 2 (16.01) –
      // у той самий день. SQL віддає пару з day_diff 0 першою, тож tx-a
      // дістається рядку 2, а рядок 1 лишається створюватись.
      const client = makeClient([pair(2, "tx-a", 0), pair(1, "tx-a", 1)]);
      expect(
        await findMonoMatchedRows(client, "u1", [
          EXPENSE,
          { ...EXPENSE, date: "2026-01-16" },
        ]),
      ).toEqual([false, true]);
    });

    it("SQL впорядковує пари: спершу точний день, потім номер рядка", async () => {
      const client = makeClient([]);
      await findMonoMatchedRows(client, "u1", [EXPENSE]);
      const [sql] = sqlOf(client);
      expect(sql).toMatch(/ORDER BY day_diff ASC, r\.ord ASC/);
    });
  });
});
