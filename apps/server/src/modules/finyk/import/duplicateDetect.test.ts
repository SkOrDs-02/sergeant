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

/**
 * Мок бази, що приймає СИРЕ значення `data_json->>'date'` і сам
 * застосовує до нього ту саму проєкцію, що й SQL — `left(…, 10)`.
 *
 * Навіщо: `markDuplicateLikely` сирого `data_json` не бачить взагалі,
 * зріз до дня робить Postgres. Тест, який одразу подає нормалізовану
 * дату, тому нічого про ISO-форму не доводить. Тут фікстура тримає
 * саме те, що лежить у базі (`2026-08-17T12:00:00.000Z`), а
 * проєкція виражена явно й ОДНИМ рядком — і вона зобовʼязана
 * збігатися з SQL, що пінить тест «порівнює дату за днем з ОБОХ боків».
 * Семантику самого `left(…, 10)` на реальному PostgreSQL 16 звірено
 * окремо (див. докстрінг `duplicateDetect.ts`).
 */
function storedRows(
  rows: Array<{
    storedDate: string;
    amount: string;
    kind: string;
    count: string;
  }>,
) {
  return makeDb(
    rows.map(({ storedDate, ...rest }) => ({
      date: storedDate.slice(0, 10),
      ...rest,
    })),
  );
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

/**
 * Регресія 2026-08-28. `ManualExpense.date` існує у двох формах:
 * день-ключ `YYYY-MM-DD` (серверні писарі) та ISO-інстант о 12:00 UTC
 * (`ManualExpenseSheet` через `toExpenseInstant`). Точне порівняння
 * рядків робило сітку сліпою до ДРУГОЇ форми, тобто до всіх ручних
 * витрат — і саме через це рядок виписки, який уже існував, не отримав
 * бейджа, поїхав на commit і став там `duplicate`.
 */
describe("markDuplicateLikely — дві форми дати в data_json", () => {
  it("порівнює дату за днем з ОБОХ боків (SELECT і WHERE), а не точним рядком", async () => {
    const db = makeDb([]);
    await markDuplicateLikely(db, "u1", [SILPO]);

    const [sql] = db.query.mock.calls[0] as [string, unknown[]];
    const normalized = sql.match(/left\(data_json->>'date', 10\)/g) ?? [];
    // Двічі: у проєкції (щоб бакет-ключ був днем) і в фільтрі (щоб
    // ISO-рядок узагалі потрапив у вибірку).
    expect(normalized).toHaveLength(2);
    expect(sql).not.toMatch(/data_json->>'date' = ANY/);
  });

  it("витрата, збережена аркушем (ISO-інстант), теж маркує рядок превʼю", async () => {
    // Фікстура тримає СИРУ збережену форму, а проєкцію робить
    // `storedRows` — інакше тест подавав би вже нормалізоване значення і
    // перевіряв би сам себе (ревʼю CodeRabbit на a131a50).
    const db = storedRows([
      {
        storedDate: "2026-08-17T12:00:00.000Z",
        amount: "847.5",
        kind: "expense",
        count: "1",
      },
    ]);
    const out = await markDuplicateLikely(db, "u1", [SILPO]);
    expect(out[0]).toMatchObject({ duplicateLikely: true });
  });

  it("обидві форми в одній вибірці зливаються в ОДИН бакет (лічильник додається)", async () => {
    // Реальний стан прода: той самий платіж приїхав скріном (день-ключ),
    // потім рядок відредагували аркушем (ISO). Обидва мають рахуватись
    // разом, інакше count-обмеження змарнує один із них.
    const db = storedRows([
      {
        storedDate: "2026-08-17",
        amount: "847.5",
        kind: "expense",
        count: "1",
      },
      {
        storedDate: "2026-08-17T12:00:00.000Z",
        amount: "847.5",
        kind: "expense",
        count: "1",
      },
    ]);
    const out = await markDuplicateLikely(db, "u1", [SILPO, { ...SILPO }]);
    expect(out[0]).toMatchObject({ duplicateLikely: true });
    expect(out[1]).toMatchObject({ duplicateLikely: true });
  });
});
