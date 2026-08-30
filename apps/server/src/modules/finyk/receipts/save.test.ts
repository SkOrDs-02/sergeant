import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Request, Response } from "express";

const mocks = vi.hoisted(() => ({
  connect: vi.fn(),
  matchReceiptToMono: vi.fn(),
}));

vi.mock("../../../db.js", () => ({
  default: { connect: mocks.connect },
}));
vi.mock("./matcher.js", () => ({
  matchReceiptToMono: mocks.matchReceiptToMono,
}));

import saveReceiptHandler from "./save.js";

interface TestRes {
  statusCode: number;
  body: unknown;
  status(code: number): TestRes;
  json(payload: unknown): TestRes;
}

function makeRes(): TestRes & Response {
  const res: TestRes = {
    statusCode: 200,
    body: undefined,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    },
  };
  return res as TestRes & Response;
}

function makeReq(body: unknown, userId = "u1"): Request {
  return { user: { id: userId }, body } as unknown as Request;
}

const NOW = "2026-01-15T12:35:00.000Z";

function baseSaveBody(overrides: Record<string, unknown> = {}) {
  return {
    source: "dps",
    fiscalNum: "4000123456",
    store: "Сільпо",
    storeTaxId: "30363252",
    purchasedAt: "2026-01-15T12:32:10.000Z",
    totalKopiykas: 15000,
    items: [
      {
        position: 1,
        name: "Молоко",
        qty: 1,
        priceKopiykas: 3200,
        sumKopiykas: 3200,
      },
    ],
    confidence: null,
    rawPayload: { xml: "<CHECK/>" },
    category: "food",
    ...overrides,
  };
}

function receiptDbRow(overrides: Record<string, unknown> = {}) {
  return {
    // `id` — реалістично вже `number` тут: `db.ts#installInt8Parser()`
    // коерсить int8 глобально на рівні pg-драйвера ДО того, як `save.ts`
    // побачить рядок (він передає `receiptRow.id` далі як SQL-параметр
    // дочірніх INSERT-ів, а не лише в серіалізатор) — на відміну від
    // `serialize.test.ts`, який навмисно подає рядки, щоб перевірити
    // сам коерсійний рубіж. `total_kopiykas` тут лишається рядком —
    // те поле йде НАПРЯМУ в `serializeReceipt`, тож усе одно вправляє
    // коерсію на цьому рівні.
    id: 1,
    user_id: "u1",
    source: "dps",
    fiscal_num: "4000123456",
    store_name: "Сільпо",
    store_tax_id: "30363252",
    purchased_at: "2026-01-15T12:32:10.000Z",
    total_kopiykas: "15000",
    created_at: NOW,
    updated_at: NOW,
    ...overrides,
  };
}

const itemDbRow = {
  id: "10",
  receipt_id: "1",
  position: 1,
  name: "Молоко",
  qty: "1.000",
  price_kopiykas: "3200",
  sum_kopiykas: "3200",
};

/**
 * Диспетчер по SQL-тексту замість строгої черги `mockResolvedValueOnce` —
 * стійкіший до порядку викликів усередині `save.ts`, легше розширювати
 * per-test override-ами.
 */
function makeFakeClient(
  overrides: Partial<
    Record<string, (params: unknown[]) => { rows: unknown[] }>
  > = {},
) {
  const calls: Array<{ sql: string; params: unknown[] }> = [];
  const query = vi.fn(async (sql: string, params: unknown[] = []) => {
    calls.push({ sql, params });
    if (/^BEGIN|^COMMIT|^ROLLBACK|^SAVEPOINT/.test(sql.trim()))
      return { rows: [] };
    if (overrides["insertReceipt"] && /INSERT INTO receipts/.test(sql)) {
      return overrides["insertReceipt"](params);
    }
    if (overrides["selectReceipt"] && /SELECT .* FROM receipts/s.test(sql)) {
      return overrides["selectReceipt"](params);
    }
    if (overrides["insertItems"] && /INSERT INTO receipt_items/.test(sql)) {
      return overrides["insertItems"](params);
    }
    if (overrides["selectItems"] && /SELECT .* FROM receipt_items/s.test(sql)) {
      return overrides["selectItems"](params);
    }
    if (
      overrides["insertManualExpense"] &&
      /INSERT INTO finyk_manual_expenses/.test(sql)
    ) {
      return overrides["insertManualExpense"](params);
    }
    if (
      overrides["insertLink"] &&
      /INSERT INTO finyk_tx_receipt_links/.test(sql)
    ) {
      return overrides["insertLink"](params);
    }
    if (
      overrides["selectLink"] &&
      /SELECT .* FROM finyk_tx_receipt_links/s.test(sql)
    ) {
      return overrides["selectLink"](params);
    }
    throw new Error(`save.test.ts fake client: unhandled SQL: ${sql}`);
  });
  return { query, release: vi.fn(), calls };
}

beforeEach(() => {
  mocks.connect.mockReset();
  mocks.matchReceiptToMono.mockReset();
});

describe("saveReceiptHandler — новий чек, matched на mono", () => {
  it("201, лінк tx_kind='mono', БЕЗ manual expense", async () => {
    mocks.matchReceiptToMono.mockResolvedValueOnce({
      kind: "mono",
      monoTxId: "mono-tx-1",
    });
    const client = makeFakeClient({
      insertReceipt: () => ({ rows: [receiptDbRow()] }),
      insertItems: () => ({ rows: [itemDbRow] }),
      insertLink: () => ({ rows: [] }),
    });
    mocks.connect.mockResolvedValue(client);

    const res = makeRes();
    await saveReceiptHandler(makeReq(baseSaveBody()), res);

    expect(res.statusCode).toBe(201);
    const body = res.body as {
      receipt: Record<string, unknown>;
      alreadyExists: boolean;
    };
    expect(body.alreadyExists).toBe(false);
    expect(body.receipt["id"]).toBe(1);
    expect(body.receipt["totalKopiykas"]).toBe(15000);
    expect(body.receipt["link"]).toEqual({
      txKind: "mono",
      txRef: "mono-tx-1",
    });

    const manualExpenseCall = client.calls.find((c) =>
      c.sql.includes("INSERT INTO finyk_manual_expenses"),
    );
    expect(manualExpenseCall).toBeUndefined();

    // `tx_kind` — inline SQL-літерал ('mono'/'manual'), не bound-параметр
    // (обидва варіанти — константи без user input, injection-ризику
    // нема); params несе лише $1=receipt_id, $2=tx_ref.
    const linkCall = client.calls.find((c) =>
      c.sql.includes("INSERT INTO finyk_tx_receipt_links"),
    );
    expect(linkCall?.sql).toContain("'mono'");
    expect(linkCall?.params).toEqual([1, "mono-tx-1"]);

    expect(client.calls.some((c) => c.sql.trim() === "COMMIT")).toBe(true);
    expect(client.release).toHaveBeenCalledTimes(1);
  });

  it("гонка на mono-лінку (23505): чек зберігається з link=null, БЕЗ manual expense", async () => {
    // Міграція 121: UNIQUE (tx_kind, tx_ref). matcher відсіює прилінковані
    // mono-tx, тож 23505 можливий лише при гонці двох конкурентних save-ів —
    // graceful-гілка лишає чек unmatched і НЕ створює дубль-витрату.
    mocks.matchReceiptToMono.mockResolvedValueOnce({
      kind: "mono",
      monoTxId: "mono-tx-1",
    });
    const linkError = Object.assign(new Error("duplicate key"), {
      code: "23505",
    });
    const client = makeFakeClient({
      insertReceipt: () => ({ rows: [receiptDbRow()] }),
      insertItems: () => ({ rows: [itemDbRow] }),
      insertLink: () => {
        throw linkError;
      },
    });
    mocks.connect.mockResolvedValue(client);

    const res = makeRes();
    await saveReceiptHandler(makeReq(baseSaveBody()), res);

    expect(res.statusCode).toBe(201);
    const body = res.body as { receipt: Record<string, unknown> };
    expect(body.receipt["link"]).toBeNull();
    expect(
      client.calls.some((c) =>
        c.sql.trim().startsWith("ROLLBACK TO SAVEPOINT link_mono"),
      ),
    ).toBe(true);
    expect(
      client.calls.find((c) =>
        c.sql.includes("INSERT INTO finyk_manual_expenses"),
      ),
    ).toBeUndefined();
    expect(client.calls.some((c) => c.sql.trim() === "COMMIT")).toBe(true);
  });
});

describe("saveReceiptHandler — новий чек, unmatched", () => {
  it("201, створює manual expense (гривні, Kyiv date) + лінк tx_kind='manual'", async () => {
    mocks.matchReceiptToMono.mockResolvedValueOnce({ kind: "none" });
    const client = makeFakeClient({
      insertReceipt: () => ({ rows: [receiptDbRow()] }),
      insertItems: () => ({ rows: [itemDbRow] }),
      insertManualExpense: () => ({ rows: [] }),
      insertLink: () => ({ rows: [] }),
    });
    mocks.connect.mockResolvedValue(client);

    const res = makeRes();
    await saveReceiptHandler(makeReq(baseSaveBody()), res);

    expect(res.statusCode).toBe(201);
    const body = res.body as { receipt: Record<string, unknown> };
    expect((body.receipt["link"] as Record<string, unknown>)["txKind"]).toBe(
      "manual",
    );

    const expenseCall = client.calls.find((c) =>
      c.sql.includes("INSERT INTO finyk_manual_expenses"),
    );
    expect(expenseCall).toBeDefined();
    const [, userId, blobJson] = expenseCall!.params as [
      string,
      string,
      string,
    ];
    expect(userId).toBe("u1");
    const blob = JSON.parse(blobJson) as {
      amount: number;
      category: string;
      description: string;
      date: string;
    };
    // 15000 копійок → 150 ГРИВЕНЬ (не копійок) у blob — той самий контракт,
    // що manualExpenses.ts.
    expect(blob.amount).toBe(150);
    expect(blob.category).toBe("food");
    expect(blob.description).toBe("Сільпо"); // назва магазину
    expect(blob.date).toBe("2026-01-15"); // Kyiv day-key від purchasedAt

    // `tx_kind='manual'` — inline SQL-літерал (див. коментар у тесті
    // matched-на-mono вище); params[1] тут — сам expenseId (tx_ref).
    const linkCall = client.calls.find((c) =>
      c.sql.includes("INSERT INTO finyk_tx_receipt_links"),
    );
    expect(linkCall?.sql).toContain("'manual'");
    expect(linkCall?.params?.[1]).toBe(expenseCall!.params[0]);
  });

  it("порожня назва магазину → fallback 'Невідомий магазин' ДО INSERT", async () => {
    mocks.matchReceiptToMono.mockResolvedValueOnce({ kind: "none" });
    let insertedStoreName: unknown;
    const client = makeFakeClient({
      insertReceipt: (params) => {
        insertedStoreName = params[3];
        return { rows: [receiptDbRow({ store_name: "Невідомий магазин" })] };
      },
      insertItems: () => ({ rows: [] }),
      insertManualExpense: () => ({ rows: [] }),
      insertLink: () => ({ rows: [] }),
    });
    mocks.connect.mockResolvedValue(client);

    await saveReceiptHandler(
      makeReq(baseSaveBody({ store: "  ", items: [] })),
      makeRes(),
    );

    expect(insertedStoreName).toBe("Невідомий магазин");
  });
});

describe("saveReceiptHandler — ідемпотентність (повторний скан)", () => {
  it("200, alreadyExists:true, matcher/manual-expense/link НЕ викликаються повторно", async () => {
    const client = makeFakeClient({
      insertReceipt: () => ({ rows: [] }), // ON CONFLICT DO NOTHING — конфлікт
      selectReceipt: () => ({ rows: [receiptDbRow()] }),
      selectItems: () => ({ rows: [itemDbRow] }),
      selectLink: () => ({
        rows: [{ tx_kind: "manual", tx_ref: "expense-1" }],
      }),
    });
    mocks.connect.mockResolvedValue(client);

    const res = makeRes();
    await saveReceiptHandler(makeReq(baseSaveBody()), res);

    expect(res.statusCode).toBe(200);
    const body = res.body as {
      alreadyExists: boolean;
      receipt: Record<string, unknown>;
    };
    expect(body.alreadyExists).toBe(true);
    expect(body.receipt["id"]).toBe(1);
    expect((body.receipt["link"] as Record<string, unknown>)["txRef"]).toBe(
      "expense-1",
    );

    expect(mocks.matchReceiptToMono).not.toHaveBeenCalled();
    expect(
      client.calls.some((c) => c.sql.includes("INSERT INTO receipt_items")),
    ).toBe(false);
    expect(
      client.calls.some((c) =>
        c.sql.includes("INSERT INTO finyk_manual_expenses"),
      ),
    ).toBe(false);
    expect(
      client.calls.some((c) =>
        c.sql.includes("INSERT INTO finyk_tx_receipt_links"),
      ),
    ).toBe(false);
    expect(client.calls.some((c) => c.sql.trim() === "COMMIT")).toBe(true);
  });

  it("vision-чек (fiscalNum: null) БЕЗ clientScanId завжди створює новий рядок — задокументована поведінка, без ON CONFLICT-гілки", async () => {
    mocks.matchReceiptToMono.mockResolvedValueOnce({ kind: "none" });
    const client = makeFakeClient({
      insertReceipt: () => ({
        rows: [receiptDbRow({ fiscal_num: null, source: "vision" })],
      }),
      insertItems: () => ({ rows: [] }),
      insertManualExpense: () => ({ rows: [] }),
      insertLink: () => ({ rows: [] }),
    });
    mocks.connect.mockResolvedValue(client);

    const res = makeRes();
    await saveReceiptHandler(
      makeReq(baseSaveBody({ source: "vision", fiscalNum: null, items: [] })),
      res,
    );

    expect(res.statusCode).toBe(201); // завжди 201 — жодного conflict-шляху
    const insertCall = client.calls.find((c) =>
      c.sql.includes("INSERT INTO receipts"),
    );
    expect(insertCall?.sql).not.toContain("ON CONFLICT");
    // Без clientScanId у body дедуп-SELECT (review-фікс MAJOR нижче)
    // взагалі не викликається — поведінка НЕ регресує.
    expect(
      client.calls.some((c) =>
        c.sql.includes("raw_payload ->> 'clientScanId'"),
      ),
    ).toBe(false);
  });
});

describe("saveReceiptHandler — vision retry-дедуп через clientScanId (review-фікс MAJOR)", () => {
  const CLIENT_SCAN_ID = "8e6b1f1e-2222-4444-8888-abcdefabcdef";

  it("другий save з тим самим clientScanId → 200 alreadyExists, БЕЗ нових item/manualExpense/link INSERT-ів", async () => {
    const client = makeFakeClient({
      selectReceipt: () => ({
        rows: [receiptDbRow({ fiscal_num: null, source: "vision" })],
      }),
      selectItems: () => ({ rows: [itemDbRow] }),
      selectLink: () => ({
        rows: [{ tx_kind: "manual", tx_ref: "expense-1" }],
      }),
    });
    mocks.connect.mockResolvedValue(client);

    const res = makeRes();
    await saveReceiptHandler(
      makeReq(
        baseSaveBody({
          source: "vision",
          fiscalNum: null,
          items: [],
          clientScanId: CLIENT_SCAN_ID,
        }),
      ),
      res,
    );

    expect(res.statusCode).toBe(200);
    const body = res.body as {
      alreadyExists: boolean;
      receipt: Record<string, unknown>;
    };
    expect(body.alreadyExists).toBe(true);

    expect(mocks.matchReceiptToMono).not.toHaveBeenCalled();
    expect(
      client.calls.some((c) => c.sql.includes("INSERT INTO receipts")),
    ).toBe(false);
    expect(
      client.calls.some((c) => c.sql.includes("INSERT INTO receipt_items")),
    ).toBe(false);
    expect(
      client.calls.some((c) =>
        c.sql.includes("INSERT INTO finyk_manual_expenses"),
      ),
    ).toBe(false);
    expect(
      client.calls.some((c) =>
        c.sql.includes("INSERT INTO finyk_tx_receipt_links"),
      ),
    ).toBe(false);

    // Дедуп-SELECT бʼє РІВНО по (user_id, clientScanId) — жодного
    // purchased_at (раунд 5 ревʼю: retry з відредагованою датою мусить
    // знаходити той самий чек; предикати дзеркалять
    // receipts_user_client_scan_idx).
    const dedupCall = client.calls.find((c) =>
      c.sql.includes("raw_payload ->> 'clientScanId'"),
    );
    expect(dedupCall?.params).toEqual(["u1", CLIENT_SCAN_ID]);
    expect(client.calls.some((c) => c.sql.trim() === "COMMIT")).toBe(true);
  });

  it("clientScanId потрапляє у raw_payload НАВІТЬ якщо клієнт не поклав його самостійно", async () => {
    mocks.matchReceiptToMono.mockResolvedValueOnce({ kind: "none" });
    let insertedRawPayload: unknown;
    const client = makeFakeClient({
      selectReceipt: () => ({ rows: [] }), // дедуп-SELECT нічого не знайшов — новий scan
      insertReceipt: (params) => {
        insertedRawPayload = params[6]; // fiscalNum=null гілка — 7-елементний params, raw_payload $7 → index 6
        return {
          rows: [receiptDbRow({ fiscal_num: null, source: "vision" })],
        };
      },
      insertItems: () => ({ rows: [] }),
      insertManualExpense: () => ({ rows: [] }),
      insertLink: () => ({ rows: [] }),
    });
    mocks.connect.mockResolvedValue(client);

    await saveReceiptHandler(
      makeReq(
        baseSaveBody({
          source: "vision",
          fiscalNum: null,
          items: [],
          clientScanId: CLIENT_SCAN_ID,
          rawPayload: { text: "vision JSON, без clientScanId усередині" },
        }),
      ),
      makeRes(),
    );

    const parsed = JSON.parse(insertedRawPayload as string) as Record<
      string,
      unknown
    >;
    expect(parsed["clientScanId"]).toBe(CLIENT_SCAN_ID);
    expect(parsed["text"]).toBe("vision JSON, без clientScanId усередині");
  });

  it("clientScanId, що НЕ знайдено (перший save з новим scan-ом) → звичайний INSERT, 201", async () => {
    mocks.matchReceiptToMono.mockResolvedValueOnce({ kind: "none" });
    const client = makeFakeClient({
      selectReceipt: () => ({ rows: [] }), // дедуп-SELECT нічого не знайшов
      insertReceipt: () => ({
        rows: [receiptDbRow({ fiscal_num: null, source: "vision" })],
      }),
      insertItems: () => ({ rows: [] }),
      insertManualExpense: () => ({ rows: [] }),
      insertLink: () => ({ rows: [] }),
    });
    mocks.connect.mockResolvedValue(client);

    const res = makeRes();
    await saveReceiptHandler(
      makeReq(
        baseSaveBody({
          source: "vision",
          fiscalNum: null,
          items: [],
          clientScanId: CLIENT_SCAN_ID,
        }),
      ),
      res,
    );

    expect(res.statusCode).toBe(201);
    expect(
      client.calls.some((c) => c.sql.includes("INSERT INTO receipts")),
    ).toBe(true);
  });

  it("КОНКУРЕНТНА гонка (23505 на receipts_user_client_scan_idx) → ROLLBACK TO SAVEPOINT + reload переможця, 200 alreadyExists", async () => {
    // Обидва конкурентні запити пройшли дедуп-SELECT до першого INSERT-у;
    // цей — програв гонку на партіальному UNIQUE (міграція 121).
    const raceError = Object.assign(new Error("duplicate key"), {
      code: "23505",
      constraint: "receipts_user_client_scan_idx",
    });
    let receiptSelects = 0;
    const client = makeFakeClient({
      selectReceipt: () => {
        receiptSelects += 1;
        // 1-й виклик — дедуп-SELECT (переможець ще не був видимий);
        // 2-й — reload після 23505, переможець уже закомічений.
        return receiptSelects === 1
          ? { rows: [] }
          : { rows: [receiptDbRow({ fiscal_num: null, source: "vision" })] };
      },
      insertReceipt: () => {
        throw raceError;
      },
      selectItems: () => ({ rows: [itemDbRow] }),
      selectLink: () => ({
        rows: [{ tx_kind: "manual", tx_ref: "expense-1" }],
      }),
    });
    mocks.connect.mockResolvedValue(client);

    const res = makeRes();
    await saveReceiptHandler(
      makeReq(
        baseSaveBody({
          source: "vision",
          fiscalNum: null,
          items: [],
          clientScanId: CLIENT_SCAN_ID,
        }),
      ),
      res,
    );

    expect(res.statusCode).toBe(200);
    const body = res.body as { alreadyExists: boolean };
    expect(body.alreadyExists).toBe(true);
    expect(
      client.calls.some(
        (c) => c.sql.trim() === "SAVEPOINT insert_vision_receipt",
      ),
    ).toBe(true);
    expect(
      client.calls.some((c) =>
        c.sql.trim().startsWith("ROLLBACK TO SAVEPOINT insert_vision_receipt"),
      ),
    ).toBe(true);
    // Програвший гонку НЕ створює власних item/matcher/expense/link.
    expect(mocks.matchReceiptToMono).not.toHaveBeenCalled();
    expect(
      client.calls.some((c) =>
        c.sql.includes("INSERT INTO finyk_manual_expenses"),
      ),
    ).toBe(false);
    expect(client.calls.some((c) => c.sql.trim() === "COMMIT")).toBe(true);
  });

  it("23505 з ІНШИМ constraint у vision-гілці → НЕ гонка: пробрасується, ROLLBACK без COMMIT", async () => {
    const otherError = Object.assign(new Error("duplicate key"), {
      code: "23505",
      constraint: "receipts_pkey",
    });
    const client = makeFakeClient({
      selectReceipt: () => ({ rows: [] }),
      insertReceipt: () => {
        throw otherError;
      },
    });
    mocks.connect.mockResolvedValue(client);

    await expect(
      saveReceiptHandler(
        makeReq(
          baseSaveBody({
            source: "vision",
            fiscalNum: null,
            items: [],
            clientScanId: CLIENT_SCAN_ID,
          }),
        ),
        makeRes(),
      ),
    ).rejects.toThrow("duplicate key");

    expect(client.calls.some((c) => c.sql.trim() === "ROLLBACK")).toBe(true);
    expect(client.calls.some((c) => c.sql.trim() === "COMMIT")).toBe(false);
  });

  it("clientScanId, вкладений клієнтом ЛИШЕ в rawPayload (без body-поля) → дедуп-SELECT працює з ним же", async () => {
    // Ефективний ключ — те, що реально ляже в raw_payload (і що бачить
    // партіальний UNIQUE): дедуп-SELECT/guard мусять дивитись туди ж,
    // інакше конфлікт, видимий індексу, давав би незʼясовне 500.
    const client = makeFakeClient({
      selectReceipt: () => ({
        rows: [receiptDbRow({ fiscal_num: null, source: "vision" })],
      }),
      selectItems: () => ({ rows: [] }),
      selectLink: () => ({ rows: [] }),
    });
    mocks.connect.mockResolvedValue(client);

    const res = makeRes();
    await saveReceiptHandler(
      makeReq(
        baseSaveBody({
          source: "vision",
          fiscalNum: null,
          items: [],
          rawPayload: { text: "vision JSON", clientScanId: CLIENT_SCAN_ID },
        }),
      ),
      res,
    );

    expect(res.statusCode).toBe(200);
    const dedupCall = client.calls.find((c) =>
      c.sql.includes("raw_payload ->> 'clientScanId'"),
    );
    expect(dedupCall?.params?.[1]).toBe(CLIENT_SCAN_ID);
    expect(
      client.calls.some((c) => c.sql.includes("INSERT INTO receipts")),
    ).toBe(false);
  });
});

describe("saveReceiptHandler — rollback on failure", () => {
  it("ROLLBACK + release(), коли matcher кидає помилку; оригінальна помилка пробрасывается", async () => {
    mocks.matchReceiptToMono.mockRejectedValueOnce(new Error("matcher boom"));
    const client = makeFakeClient({
      insertReceipt: () => ({ rows: [receiptDbRow()] }),
      insertItems: () => ({ rows: [itemDbRow] }),
    });
    mocks.connect.mockResolvedValue(client);

    await expect(
      saveReceiptHandler(makeReq(baseSaveBody()), makeRes()),
    ).rejects.toThrow("matcher boom");

    expect(client.calls.some((c) => c.sql.trim() === "ROLLBACK")).toBe(true);
    expect(client.calls.some((c) => c.sql.trim() === "COMMIT")).toBe(false);
    expect(client.release).toHaveBeenCalledTimes(1);
  });

  // Review-фікс Trivial: serializeReceipt + Schema.parse тепер будуються
  // ДО COMMIT — падіння серіалізації мусить ROLLBACK-увати, не лишати
  // транзакцію закомічену без відповіді клієнту.
  it("падіння serializeReceipt (нечислове total_kopiykas) → ROLLBACK, НЕ COMMIT; помилка пробрасується", async () => {
    const client = makeFakeClient({
      insertReceipt: () => ({
        rows: [receiptDbRow({ total_kopiykas: "not-a-number" })],
      }),
      insertItems: () => ({ rows: [itemDbRow] }),
      insertLink: () => ({ rows: [] }),
    });
    mocks.connect.mockResolvedValue(client);
    mocks.matchReceiptToMono.mockResolvedValueOnce({
      kind: "mono",
      monoTxId: "mono-tx-1",
    });

    await expect(
      saveReceiptHandler(makeReq(baseSaveBody()), makeRes()),
    ).rejects.toThrow(/total_kopiykas/);

    expect(client.calls.some((c) => c.sql.trim() === "ROLLBACK")).toBe(true);
    expect(client.calls.some((c) => c.sql.trim() === "COMMIT")).toBe(false);
    expect(client.release).toHaveBeenCalledTimes(1);
  });
});
