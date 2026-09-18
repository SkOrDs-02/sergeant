/**
 * Read-side чеків Сільпо: пагінація курсором, деталь і пара
 * «відвʼязати / повернути».
 *
 * Тест безмережевий і без моків: усі три функції приймають `queryFn`
 * аргументом, тож фейковий виконавець запитів дає повний контроль над
 * відповідями і, головне, над ПОРЯДКОМ стейтментів.
 *
 * Порядок тут і є предметом перевірки. Шапка модуля описує його як вибір
 * безпечного боку на збої: `unlink` спершу записує відхилення і лише потім
 * знімає лінк, `relink` — дзеркально. Зворотний порядок у першому випадку
 * лишив би знятий лінк без памʼяті про відмову, і найближчий sync мовчки
 * повернув би те, що людина щойно прибрала. Така властивість не видима
 * ні з типів, ні з відповіді ендпоїнта — її стереже лише тест.
 */

import { describe, it, expect } from "vitest";

import {
  listReceipts,
  getReceiptDetail,
  unlinkReceiptFromTransaction,
  relinkReceiptToTransaction,
  type ReceiptSummaryRow,
} from "./receiptsRead.js";
import type { QueryFn } from "./tokenStore.js";

interface Recorded {
  sql: string;
  params: unknown[];
  op: string | undefined;
}

/**
 * Фейковий `queryFn`. `responses` віддаються по черзі; кожен виклик
 * записується, тож тест бачить і SQL, і параметри, і порядок.
 */
function fakeQuery(responses: Array<{ rows?: unknown[]; rowCount?: number }>): {
  queryFn: QueryFn;
  calls: Recorded[];
} {
  const calls: Recorded[] = [];
  const queue = [...responses];
  const queryFn = (async (
    sql: string,
    params?: unknown[],
    opts?: { op?: string },
  ) => {
    calls.push({ sql, params: params ?? [], op: opts?.op });
    const next = queue.shift() ?? {};
    return { rows: next.rows ?? [], rowCount: next.rowCount ?? 0 };
  }) as unknown as QueryFn;
  return { queryFn, calls };
}

function row(receiptId: string, purchasedAt: string): ReceiptSummaryRow {
  return {
    receiptId,
    purchasedAt,
    storeId: "store-1",
    channel: "offline",
    paymentHint: null,
    totalKop: 12345,
    transactionId: null,
  };
}

describe("listReceipts", () => {
  it("віддає сторінку без курсора, коли більше нема", async () => {
    const { queryFn } = fakeQuery([
      { rows: [row("r-1", "2026-09-01T10:00:00.000Z")] },
    ]);
    const page = await listReceipts("user-1", { limit: 10 }, queryFn);

    expect(page.data).toHaveLength(1);
    expect(page.data[0]?.totalKop).toBe(12345);
    expect(page.nextCursor).toBeNull();
  });

  it("бере на один рядок більше за limit, щоб дізнатись про наступну сторінку", async () => {
    const { queryFn, calls } = fakeQuery([{ rows: [] }]);
    await listReceipts("user-1", { limit: 25 }, queryFn);

    // Останній параметр — LIMIT. 26 замість 25: зайвий рядок і є ознакою
    // «є ще», без окремого COUNT.
    expect(calls[0]?.params.at(-1)).toBe(26);
  });

  it("зрізає зайвий рядок і повертає курсор на останній ВИДАНИЙ", async () => {
    const { queryFn } = fakeQuery([
      {
        rows: [
          row("r-3", "2026-09-03T10:00:00.000Z"),
          row("r-2", "2026-09-02T10:00:00.000Z"),
          row("r-1", "2026-09-01T10:00:00.000Z"),
        ],
      },
    ]);
    const page = await listReceipts("user-1", { limit: 2 }, queryFn);

    expect(page.data.map((r) => r.receiptId)).toEqual(["r-3", "r-2"]);
    expect(page.nextCursor).not.toBeNull();
  });

  it("курсор переживає повний цикл: видали один, попроси наступний", async () => {
    const first = fakeQuery([
      {
        rows: [
          row("r-3", "2026-09-03T10:00:00.000Z"),
          row("r-2", "2026-09-02T10:00:00.000Z"),
        ],
      },
    ]);
    const page = await listReceipts("user-1", { limit: 1 }, first.queryFn);

    const second = fakeQuery([{ rows: [] }]);
    await listReceipts(
      "user-1",
      { limit: 1, cursor: page.nextCursor ?? undefined },
      second.queryFn,
    );

    // Курсор непрозорий для клієнта, але всередині мусить розкластись рівно
    // в ту пару, з якої його склали — інакше пагінація тихо перестрибує чеки.
    expect(second.calls[0]?.params).toContain("2026-09-03T10:00:00.000Z");
    expect(second.calls[0]?.params).toContain("r-3");
    expect(second.calls[0]?.sql).toContain("r.purchased_at <");
  });

  it("фільтр за транзакцією йде в SQL, а не матчиться у клієнті", async () => {
    const { queryFn, calls } = fakeQuery([{ rows: [] }]);
    await listReceipts("user-1", { limit: 10, transactionId: "tx-9" }, queryFn);

    // Матчинг у клієнті мовчки промахувався, щойно потрібний чек виїжджав
    // за першу сторінку.
    expect(calls[0]?.sql).toContain("l.transaction_id =");
    expect(calls[0]?.params).toContain("tx-9");
  });

  it.each([
    ["не base64", "не-курсор!!"],
    ["не масив", Buffer.from('{"a":1}', "utf8").toString("base64url")],
    ["не та довжина", Buffer.from('["a"]', "utf8").toString("base64url")],
    ["порожній елемент", Buffer.from('["","r"]', "utf8").toString("base64url")],
    ["не рядки", Buffer.from("[1,2]", "utf8").toString("base64url")],
  ])("битий курсор (%s) стає 400, а не 500", async (_label, cursor) => {
    const { queryFn, calls } = fakeQuery([{ rows: [] }]);
    await expect(
      listReceipts("user-1", { limit: 10, cursor }, queryFn),
    ).rejects.toMatchObject({ status: 400, code: "VALIDATION" });
    // До бази справа не дійшла.
    expect(calls).toHaveLength(0);
  });
});

describe("getReceiptDetail", () => {
  it("немає чека — null, і по позиції не ходимо", async () => {
    const { queryFn, calls } = fakeQuery([{ rows: [] }]);
    const detail = await getReceiptDetail("user-1", "r-1", queryFn);

    expect(detail).toBeNull();
    expect(calls).toHaveLength(1);
  });

  it("склеює шапку з позиціями", async () => {
    const { queryFn, calls } = fakeQuery([
      { rows: [row("r-1", "2026-09-01T10:00:00.000Z")] },
      {
        rows: [
          {
            id: 1,
            name: "Молоко",
            qty: 1,
            unit: "шт",
            priceKop: 3200,
            categorySlug: null,
            barcode: null,
          },
        ],
      },
    ]);
    const detail = await getReceiptDetail("user-1", "r-1", queryFn);

    expect(detail?.receiptId).toBe("r-1");
    expect(detail?.items).toHaveLength(1);
    expect(detail?.items[0]?.name).toBe("Молоко");
    // Обидва запити звужені власником — чужий чек не дістати за id.
    expect(calls.every((c) => c.params.includes("user-1"))).toBe(true);
  });
});

describe("unlinkReceiptFromTransaction", () => {
  it("лінка немає — null і жодного запису", async () => {
    const { queryFn, calls } = fakeQuery([{ rows: [] }]);
    const out = await unlinkReceiptFromTransaction("user-1", "tx-1", queryFn);

    // Розлінк того, чого немає, це 404 для людини, а не мовчазний успіх.
    expect(out).toBeNull();
    expect(calls).toHaveLength(1);
  });

  it("ЗАПИСУЄ відхилення ДО зняття лінка", async () => {
    const { queryFn, calls } = fakeQuery([
      { rows: [{ receipt_id: "r-1" }] },
      { rowCount: 1 },
      { rowCount: 1 },
    ]);
    const out = await unlinkReceiptFromTransaction("user-1", "tx-1", queryFn);

    expect(out).toBe("r-1");
    expect(calls.map((c) => c.op)).toEqual([
      "silpo_tx_receipt_link_select_for_unlink",
      "silpo_link_rejection_insert",
      "silpo_tx_receipt_link_delete",
    ]);
    // Саме цей порядок: збій між кроками лишає відхилення без знятого лінка,
    // тобто поточний стан. Зворотний дав би знятий лінк без памʼяті про
    // відмову — і sync повернув би те, що людина щойно прибрала.
  });

  it("лінк зник між SELECT і DELETE — null, а не фальшивий успіх", async () => {
    const { queryFn } = fakeQuery([
      { rows: [{ receipt_id: "r-1" }] },
      { rowCount: 1 },
      { rowCount: 0 },
    ]);
    expect(
      await unlinkReceiptFromTransaction("user-1", "tx-1", queryFn),
    ).toBeNull();
  });
});

describe("relinkReceiptToTransaction", () => {
  it("ЗНІМАЄ відхилення ДО постановки лінка", async () => {
    const { queryFn, calls } = fakeQuery([{ rowCount: 1 }, { rowCount: 1 }]);
    const ok = await relinkReceiptToTransaction(
      "user-1",
      "tx-1",
      "r-1",
      queryFn,
    );

    expect(ok).toBe(true);
    expect(calls.map((c) => c.op)).toEqual([
      "silpo_link_rejection_delete",
      "silpo_tx_receipt_link_relink",
    ]);
    // Дзеркальний до unlink: збій між кроками веде туди ж, куди й дія,
    // бо sync відновить пару детермінованим матчем.
  });

  it("чек не належить користувачу — false", async () => {
    // `EXISTS` у INSERT не пропускає чужий receipt_id, тож rowCount = 0.
    const { queryFn } = fakeQuery([{ rowCount: 1 }, { rowCount: 0 }]);
    expect(
      await relinkReceiptToTransaction("user-1", "tx-1", "чужий", queryFn),
    ).toBe(false);
  });
});
