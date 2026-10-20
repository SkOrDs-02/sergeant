// @vitest-environment jsdom
/**
 * Контракт CSV-експорту операцій Фініка.
 *
 * Що саме пінимо і чому:
 * - **копійки → гривні один раз** — гроші в домені живуть minor units, і
 *   подвійне (чи відсутнє) ділення дає файл, у якому суми в 100 разів не
 *   ті; це найдорожча помилка експорту, бо тиха;
 * - **категорія ефективна** — у файл їде та сама, що намальована в рядку,
 *   включно з ручним перевизначенням користувача;
 * - **знак зберігається** — витрата відʼємна, щоб формули в таблиці
 *   працювали по числу, а не по слову в колонці «тип»;
 * - **порядок рядків не переставляється** — файл читається як екран.
 */
import { describe, it, expect } from "vitest";
import type {
  Category,
  Transaction,
} from "@sergeant/finyk-domain/domain/types";
import {
  toCsvRows,
  csvFilename,
  csvRangeFilename,
  collectAllHistory,
  exportAllHistoryCsv,
} from "./exportTransactionsCsv";

function tx(partial: Partial<Transaction>): Transaction {
  return {
    id: "t1",
    amount: -12345,
    date: "2026-09-01",
    categoryId: "food",
    type: "expense",
    source: "mono",
    // Секунди, як у домені: `dayKeyFromTx` і `txTimeMs` множать на 1000.
    time: Math.floor(Date.UTC(2026, 8, 1, 9, 30) / 1000),
    description: "Сільпо",
    mcc: 5411,
    accountId: "acc-1",
    manual: false,
    _source: "mono",
    _accountId: "acc-1",
    _manual: false,
    ...partial,
  } as Transaction;
}

const cat = (label: string): Category =>
  ({ id: "x", label }) as unknown as Category;

describe("exportTransactionsCsv", () => {
  it("переводить копійки у гривні рівно один раз і лишає знак", () => {
    const rows = toCsvRows([tx({ amount: -12345 })], () => cat("Їжа"));

    expect(rows[0]?.amount).toBe("-123.45");
    expect(rows[0]?.kind).toBe("витрата");
  });

  it("позначає дохід за знаком суми", () => {
    const rows = toCsvRows([tx({ amount: 5000 })], () => cat("Дохід"));

    expect(rows[0]?.amount).toBe("50.00");
    expect(rows[0]?.kind).toBe("дохід");
  });

  it("бере ЕФЕКТИВНУ категорію, а не сирий categoryId", () => {
    // Резолвер тут повертає інше, ніж лежить у `categoryId` — саме так
    // виглядає ручне перевизначення користувача.
    const rows = toCsvRows([tx({ categoryId: "food" })], () =>
      cat("Подарунки"),
    );

    expect(rows[0]?.category).toBe("Подарунки");
  });

  it("не переставляє рядки", () => {
    const rows = toCsvRows(
      [
        tx({ id: "a", description: "Перша" }),
        tx({ id: "b", description: "Друга" }),
      ],
      () => cat("Їжа"),
    );

    expect(rows.map((r) => r.description)).toEqual(["Перша", "Друга"]);
  });

  it("переживає биту мітку часу без винятку", () => {
    const rows = toCsvRows([tx({ time: 0 })], () => cat("Їжа"));

    expect(rows).toHaveLength(1);
    expect(rows[0]?.time).toBe("");
  });

  // Р6 спеки аналітики v2. Сліпий замір бачив «20:17» у кожному рядку:
  // секунди читались як мілісекунди.
  it("стовпець «Час» — час запису за Києвом із секундної мітки", () => {
    const kyiv0412 = Math.floor(Date.parse("2026-09-24T01:12:00Z") / 1000);
    const rows = toCsvRows(
      [tx({ time: kyiv0412, manual: true }), tx({ id: "t2" })],
      () => cat("Їжа"),
    );

    expect(rows[0]?.date).toBe("2026-09-24");
    expect(rows[0]?.time).toBe("04:12");
    expect(rows[1]?.time).toBe("12:30");
  });

  it("ручний запис лише з днем (плейсхолдер полудня UTC) лишає «Час» порожнім", () => {
    const noon = Math.floor(Date.parse("2026-09-23T12:00:00.000Z") / 1000);
    const rows = toCsvRows([tx({ time: noon, manual: true })], () =>
      cat("Їжа"),
    );

    expect(rows[0]?.date).toBe("2026-09-23");
    expect(rows[0]?.time).toBe("");
  });

  it("називає файл місяцем, який експортували", () => {
    expect(csvFilename("2026-09")).toBe("finyk-2026-09.csv");
    expect(csvFilename(null)).toBe("finyk.csv");
  });

  describe("уся історія", () => {
    const sec = (iso: string) => Math.floor(Date.parse(iso) / 1000);

    it("зливає банк і ручні, ховає приховані, від нових до старих", () => {
      const bank = [
        tx({ id: "old", time: sec("2025-01-10T10:00:00Z") }),
        tx({ id: "hid", time: sec("2026-03-01T10:00:00Z") }),
      ];
      const manual = [
        {
          id: "m1",
          date: "2026-02-01T09:00:00.000Z",
          amount: 50,
          category: "x",
        },
      ];
      const all = collectAllHistory(bank, manual, ["hid"]);

      expect(all.map((t) => t.id)).toEqual(["manual_m1", "old"]);
    });

    it("називає файл діапазоном київських днів", () => {
      const txs = [
        tx({ time: sec("2026-10-20T10:00:00Z") }),
        tx({ time: sec("2025-01-10T10:00:00Z") }),
      ];

      expect(csvRangeFilename(txs)).toBe("finyk-2025-01-10_2026-10-20.csv");
      expect(csvRangeFilename([])).toBe("finyk.csv");
    });

    it("порожня історія не створює файл", async () => {
      await expect(exportAllHistoryCsv([], () => cat("Їжа"))).resolves.toEqual({
        count: 0,
        result: "empty",
      });
    });
  });
});
