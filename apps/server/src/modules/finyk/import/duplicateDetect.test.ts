import { describe, expect, it, vi } from "vitest";
import { markDuplicateLikely } from "./duplicateDetect.js";

type DbRow = {
  date: string | null;
  amount: string | null;
  kind: string;
  count: string;
};

function makeDb(rows: DbRow[]) {
  return { query: vi.fn().mockResolvedValue({ rows }) };
}

const SILPO = {
  date: "2026-08-17",
  amountKopiykas: 84750,
  direction: "expense" as const,
  description: "Сільпо",
};

describe("markDuplicateLikely — «сітка 2» дедуп-превʼю", () => {
  it("маркує рядок зі збігом дата+сума+напрям, опис ігнорується", async () => {
    const db = makeDb([
      { date: "2026-08-17", amount: "847.5", kind: "expense", count: "1" },
    ]);
    const out = await markDuplicateLikely(db, "u1", [
      // Опис навмисно ІНШИЙ, ніж у збереженого запису, — vision-варіація,
      // яку тір-2 хеш не ловить, а трійка ловить.
      { ...SILPO, description: "SILPO Kyiv 20" },
    ]);
    expect(out[0]).toMatchObject({ duplicateLikely: true });
  });

  it("count-обмеження: 1 збережена + 2 однакові в превʼю → маркується лише перша", async () => {
    const db = makeDb([
      { date: "2026-08-17", amount: "95", kind: "expense", count: "1" },
    ]);
    const coffee = {
      date: "2026-08-17",
      amountKopiykas: 9500,
      direction: "expense" as const,
    };
    const out = await markDuplicateLikely(db, "u1", [
      { ...coffee },
      { ...coffee },
    ]);
    expect(out[0]).toMatchObject({ duplicateLikely: true });
    expect(
      (out[1] as { duplicateLikely?: boolean }).duplicateLikely,
    ).toBeUndefined();
  });

  it("інший напрям — не збіг; kind=null у legacy-blob падає в expense", async () => {
    const db = makeDb([
      // COALESCE у SQL віддає 'expense' для legacy-записів без kind —
      // тут симулюємо вже COALESCE-нутий результат.
      { date: "2026-08-17", amount: "150", kind: "expense", count: "1" },
    ]);
    const out = await markDuplicateLikely(db, "u1", [
      {
        date: "2026-08-17",
        amountKopiykas: 15000,
        direction: "income" as const,
      },
      {
        date: "2026-08-17",
        amountKopiykas: 15000,
        direction: "expense" as const,
      },
    ]);
    expect(
      (out[0] as { duplicateLikely?: boolean }).duplicateLikely,
    ).toBeUndefined();
    expect(out[1]).toMatchObject({ duplicateLikely: true });
  });

  it("порожній вхід не ходить у БД; биті blob-суми не валять маркування", async () => {
    const db = makeDb([
      {
        date: "2026-08-17",
        amount: "not-a-number",
        kind: "expense",
        count: "1",
      },
      { date: null, amount: "10", kind: "expense", count: "1" },
    ]);
    expect(await markDuplicateLikely(db, "u1", [])).toEqual([]);
    expect(db.query).not.toHaveBeenCalled();

    const out = await markDuplicateLikely(db, "u1", [SILPO]);
    expect(
      (out[0] as { duplicateLikely?: boolean }).duplicateLikely,
    ).toBeUndefined();
  });

  it("шле один user-скоуплений запит з масивом унікальних дат", async () => {
    const db = makeDb([]);
    await markDuplicateLikely(db, "u42", [
      SILPO,
      { ...SILPO, date: "2026-08-18" },
      { ...SILPO },
    ]);
    expect(db.query).toHaveBeenCalledTimes(1);
    const [sql, params] = db.query.mock.calls[0] as [string, unknown[]];
    expect(sql).toContain("deleted_at IS NULL");
    expect(params[0]).toBe("u42");
    expect(params[1]).toEqual(["2026-08-17", "2026-08-18"]);
  });
});
