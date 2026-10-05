import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./dualWriteBridge", () => ({
  finykChatWrite: vi.fn(),
}));
vi.mock("../../../../modules/finyk/lib/sqliteWriter", () => ({
  triggerManualExpenseDeleteSqliteMirror: vi.fn(),
}));

import {
  __setFinykSqliteStateCacheForTests,
  clearFinykSqliteCache,
} from "../../../../modules/finyk/lib/sqliteReader";
import { finykChatWrite } from "./dualWriteBridge";
import { triggerManualExpenseDeleteSqliteMirror } from "../../../../modules/finyk/lib/sqliteWriter";
import { createDebt, createReceivable, markDebtPaid } from "./debts";
import type { ChatActionUndoableResult } from "../types";

const mockWrite = vi.mocked(finykChatWrite);

// data-08: стан читається з прогрітого кешу SQLite, а не з kv.
/** Сід кешу SQLite без повної типізації рядків — тестам досить мінімуму полів. */
function seedFinykCache(partial: Record<string, unknown>): void {
  __setFinykSqliteStateCacheForTests(partial as never);
}

beforeEach(() => {
  vi.clearAllMocks();
  clearFinykSqliteCache();
  seedFinykCache({});
});

// Аудит data-01: id був `d_<Date.now()>` / `r_<Date.now()>` — передбачуваний,
// однаковий у межах мілісекунди, а PK таблиць на сервері глобальний.
describe("id боргу і дебіторки (data-01)", () => {
  it("два борги в ту саму мілісекунду мають різні id без Date.now()", () => {
    vi.spyOn(Date, "now").mockReturnValue(1_777_000_000_000);
    try {
      createDebt({ name: "create_debt", input: { name: "А", amount: 10 } });
      createDebt({ name: "create_debt", input: { name: "Б", amount: 20 } });
    } finally {
      vi.mocked(Date.now).mockRestore();
    }
    const ids = mockWrite.mock.calls.map(
      (c) => (c[1] as Array<{ id: string }>).at(-1)!.id,
    );
    expect(ids).toHaveLength(2);
    expect(new Set(ids).size).toBe(2);
    for (const id of ids) {
      expect(id).toMatch(/^d_[0-9a-f]{8}-[0-9a-f]{4}-/);
      expect(id).not.toContain("1777000000000");
    }
  });

  it("дебіторка отримує r_<uuid>", () => {
    vi.spyOn(Date, "now").mockReturnValue(1_777_000_000_000);
    try {
      createReceivable({
        name: "create_receivable",
        input: { name: "В", amount: 10 },
      });
    } finally {
      vi.mocked(Date.now).mockRestore();
    }
    const written = mockWrite.mock.calls[0]![1] as Array<{ id: string }>;
    expect(written.at(-1)!.id).toMatch(/^r_[0-9a-f]{8}-[0-9a-f]{4}-/);
  });
});

// ─── createDebt ───────────────────────────────────────────────────────────────

describe("createDebt", () => {
  it("returns result with debt name and amount", () => {
    const out = createDebt({
      name: "create_debt",
      input: { name: "Аренда", amount: 5000 },
    });
    expect(out).toMatchObject({ result: expect.stringContaining("Аренда") });
    expect(out).toMatchObject({
      result: expect.stringContaining("5 000"),
    });
  });

  it("persists the new debt via finykChatWrite", () => {
    createDebt({
      name: "create_debt",
      input: { name: "Позика", amount: 1000 },
    });
    expect(mockWrite).toHaveBeenCalledWith(
      "finyk_debts",
      expect.arrayContaining([
        expect.objectContaining({ name: "Позика", totalAmount: 1000 }),
      ]),
    );
  });

  it("leaves the glyph empty by default", () => {
    // 2026-08-03: дефолтне «💸» прибрано разом із рештою emoji в UI —
    // борг без явного гліфа малюється нейтрально, а не грошовим смайлом.
    createDebt({ name: "create_debt", input: { name: "X", amount: 100 } });
    expect(mockWrite).toHaveBeenCalledWith(
      "finyk_debts",
      expect.arrayContaining([expect.objectContaining({ emoji: "" })]),
    );
  });

  it("uses provided emoji", () => {
    createDebt({
      name: "create_debt",
      input: { name: "X", amount: 100, emoji: "🏠" },
    });
    expect(mockWrite).toHaveBeenCalledWith(
      "finyk_debts",
      expect.arrayContaining([expect.objectContaining({ emoji: "🏠" })]),
    );
  });

  it("appends to existing debts", () => {
    const existing = [
      {
        id: "d_1",
        name: "Old",
        totalAmount: 500,
        dueDate: "",
        emoji: "💸",
        linkedTxIds: [],
      },
    ];
    seedFinykCache({ manualDebts: existing });
    createDebt({ name: "create_debt", input: { name: "New", amount: 300 } });
    const written = mockWrite.mock.calls[0]![1] as unknown[];
    expect(written).toHaveLength(2);
  });

  it("undo removes the created debt", () => {
    const result = createDebt({
      name: "create_debt",
      input: { name: "Тест", amount: 200 },
    }) as { result: string; undo: () => void };
    const written = mockWrite.mock.calls[0]![1] as Array<{ id: string }>;
    const newId = written[written.length - 1]!.id;

    vi.clearAllMocks();
    seedFinykCache({
      manualDebts: [
        {
          id: newId,
          name: "Тест",
          totalAmount: 200,
          dueDate: "",
          emoji: "💸",
          linkedTxIds: [],
        },
      ],
    });
    result.undo();
    const afterUndo = mockWrite.mock.calls[0]![1] as unknown[];
    expect(afterUndo).toHaveLength(0);
  });

  // W2 audit: the model is untrusted input exactly like a manual form —
  // `Number(amount)` alone let NaN/negative/oversized values through and
  // reported success. Every case asserts BOTH halves: a rejection string
  // comes back AND nothing is persisted.
  describe("rejects an invalid amount without persisting", () => {
    it.each([
      ["NaN", Number.NaN],
      ["negative", -500],
      ["zero", 0],
      ["a non-numeric string", "тисяча"],
      ["above the domain ceiling", 5_000_000_000],
    ])("%s amount", (_label, amount) => {
      const out = createDebt({
        name: "create_debt",
        input: { name: "Аренда", amount },
      });
      expect(typeof out).toBe("string");
      expect(out as string).toMatch(/додатний amount|завелика/);
      expect(mockWrite).not.toHaveBeenCalled();
    });
  });
});

// ─── createReceivable ─────────────────────────────────────────────────────────

describe("createReceivable", () => {
  it("returns result with debtor name and amount", () => {
    const out = createReceivable({
      name: "create_receivable",
      input: { name: "Іванченко", amount: 2500 },
    });
    expect(out).toMatchObject({ result: expect.stringContaining("Іванченко") });
    expect(out).toMatchObject({
      result: expect.stringContaining("2 500"),
    });
  });

  it("persists via finykChatWrite on finyk_recv key", () => {
    createReceivable({
      name: "create_receivable",
      input: { name: "X", amount: 100 },
    });
    expect(mockWrite).toHaveBeenCalledWith("finyk_recv", expect.any(Array));
  });

  it("undo removes the created receivable", () => {
    const result = createReceivable({
      name: "create_receivable",
      input: { name: "Y", amount: 500 },
    }) as { result: string; undo: () => void };
    const written = mockWrite.mock.calls[0]![1] as Array<{ id: string }>;
    const newId = written[written.length - 1]!.id;

    vi.clearAllMocks();
    seedFinykCache({
      receivables: [{ id: newId, name: "Y", amount: 500, linkedTxIds: [] }],
    });
    result.undo();
    const afterUndo = mockWrite.mock.calls[0]![1] as unknown[];
    expect(afterUndo).toHaveLength(0);
  });

  describe("rejects an invalid amount without persisting", () => {
    it.each([
      ["NaN", Number.NaN],
      ["negative", -500],
      ["zero", 0],
      ["a non-numeric string", "тисяча"],
      ["above the domain ceiling", 5_000_000_000],
    ])("%s amount", (_label, amount) => {
      const out = createReceivable({
        name: "create_receivable",
        input: { name: "Іванченко", amount },
      });
      expect(typeof out).toBe("string");
      expect(out as string).toMatch(/додатний amount|завелика/);
      expect(mockWrite).not.toHaveBeenCalled();
    });
  });
});

// ─── markDebtPaid ─────────────────────────────────────────────────────────────

describe("markDebtPaid", () => {
  it("returns error for empty debt_id", () => {
    const result = markDebtPaid({
      name: "mark_debt_paid",
      input: { debt_id: "", amount: 100 },
    });
    expect(result).toContain("debt_id");
  });

  it("returns error when debt not found", () => {
    const result = markDebtPaid({
      name: "mark_debt_paid",
      input: { debt_id: "d_999", amount: 100 },
    });
    expect(result).toContain("не знайдено");
  });

  it("returns error when payAmount would be zero or negative", () => {
    const debt = {
      id: "d_1",
      name: "X",
      totalAmount: 0,
      dueDate: "",
      emoji: "💸",
      linkedTxIds: [],
    };
    seedFinykCache({ manualDebts: [debt] });
    const result = markDebtPaid({
      name: "mark_debt_paid",
      input: { debt_id: "d_1", amount: 0 },
    });
    expect(result).toContain("додатною");
  });

  it("records payment transaction and updates linkedTxIds", () => {
    const debt = {
      id: "d_1",
      name: "Оренда",
      totalAmount: 1000,
      dueDate: "",
      emoji: "💸",
      linkedTxIds: [],
    };
    seedFinykCache({ manualDebts: [debt] });
    const out = markDebtPaid({
      name: "mark_debt_paid",
      input: { debt_id: "d_1", amount: 300 },
    }) as ChatActionUndoableResult;
    expect(out.result).toContain("300");
    expect(out.result).toContain("Оренда");
    expect(mockWrite).toHaveBeenCalledTimes(2);
  });

  it("marks debt as closed when fully paid", () => {
    const debt = {
      id: "d_1",
      name: "X",
      totalAmount: 500,
      dueDate: "",
      emoji: "💸",
      linkedTxIds: [],
    };
    seedFinykCache({ manualDebts: [debt] });
    const out = markDebtPaid({
      name: "mark_debt_paid",
      input: { debt_id: "d_1", amount: 500 },
    }) as ChatActionUndoableResult;
    expect(out.result).toContain("закрито");
  });

  it("does not mark as closed for partial payment", () => {
    const debt = {
      id: "d_1",
      name: "X",
      totalAmount: 1000,
      dueDate: "",
      emoji: "💸",
      linkedTxIds: [],
    };
    seedFinykCache({ manualDebts: [debt] });
    const out = markDebtPaid({
      name: "mark_debt_paid",
      input: { debt_id: "d_1", amount: 300 },
    }) as ChatActionUndoableResult;
    expect(out.result).not.toContain("закрито");
  });

  it("uses custom note in payment transaction", () => {
    const debt = {
      id: "d_1",
      name: "X",
      totalAmount: 500,
      dueDate: "",
      emoji: "💸",
      linkedTxIds: [],
    };
    seedFinykCache({ manualDebts: [debt] });
    markDebtPaid({
      name: "mark_debt_paid",
      input: { debt_id: "d_1", amount: 200, note: "Part 1" },
    });
    const expensesCall = mockWrite.mock.calls[0]!;
    expect(expensesCall[0]).toBe("finyk_manual_expenses_v1");
    const expenses = expensesCall[1] as Array<{ description: string }>;
    expect(expenses[0]?.description).toContain("Part 1");
  });
});

// ─── data-08: канонічний стан із SQLite, а не з kv ────────────────────────────

describe("data-08: debts built on the canonical SQLite cache", () => {
  const uiDebt = {
    id: "d_ui",
    name: "Створений в UI",
    totalAmount: 1000,
    dueDate: "",
    emoji: "",
    linkedTxIds: [] as string[],
  };

  it("markDebtPaid знаходить борг, створений в UI (kv порожній)", () => {
    // kv (localStorage) порожній: UI його не пише. Борг є лише в кеші SQLite.
    localStorage.clear();
    seedFinykCache({ manualDebts: [uiDebt] });
    const out = markDebtPaid({
      name: "mark_debt_paid",
      input: { debt_id: "d_ui", amount: 400 },
    }) as ChatActionUndoableResult;
    expect(out.result).not.toContain("не знайдено");
    expect(out.result).toContain("Створений в UI");
    const debtWrite = mockWrite.mock.calls.find(([k]) => k === "finyk_debts");
    expect(debtWrite?.[1]).toEqual([
      expect.objectContaining({
        id: "d_ui",
        linkedTxIds: [expect.stringMatching(/^m_/)],
      }),
    ]);
  });

  it("повне погашення лишає всі борги з UI (закритий теж, logic-03)", () => {
    const other = { ...uiDebt, id: "d_other", name: "Інший" };
    seedFinykCache({ manualDebts: [uiDebt, other] });
    markDebtPaid({
      name: "mark_debt_paid",
      input: { debt_id: "d_ui", amount: 1000 },
    });
    const debtWrite = mockWrite.mock.calls.find(([k]) => k === "finyk_debts");
    expect(debtWrite?.[1]).toEqual([
      expect.objectContaining({
        id: "d_ui",
        linkedTxIds: [expect.stringMatching(/^m_/)],
      }),
      expect.objectContaining({ id: "d_other" }),
    ]);
  });

  it("createDebt додає до боргів з UI, а не замінює їх", () => {
    seedFinykCache({ manualDebts: [uiDebt] });
    createDebt({ name: "create_debt", input: { name: "Новий", amount: 50 } });
    const written = mockWrite.mock.calls[0]![1] as Array<{ id: string }>;
    expect(written.map((d) => d.id)).toEqual([
      "d_ui",
      expect.stringMatching(/^d_/),
    ]);
  });

  it("markDebtPaid не мутує кеш (prev для diff лишається недоторканим)", () => {
    seedFinykCache({ manualDebts: [uiDebt] });
    markDebtPaid({
      name: "mark_debt_paid",
      input: { debt_id: "d_ui", amount: 400 },
    });
    expect(uiDebt.linkedTxIds).toEqual([]);
  });

  it("холодний кеш: чесна відповідь замість запису", () => {
    clearFinykSqliteCache();
    for (const out of [
      createDebt({ name: "create_debt", input: { name: "X", amount: 10 } }),
      createReceivable({
        name: "create_receivable",
        input: { name: "Y", amount: 10 },
      }),
      markDebtPaid({
        name: "mark_debt_paid",
        input: { debt_id: "d_1", amount: 10 },
      }),
    ]) {
      expect(out).toContain("ще завантажуються");
    }
    expect(mockWrite).not.toHaveBeenCalled();
  });
  // logic-03: повне погашення раніше робило `debts.splice` — борг зникав
  // разом з історією без підтвердження і без undo. UI рахує погашений борг
  // за залишком і не видаляє його.
  describe("logic-03: повне погашення не видаляє борг і оборотне", () => {
    const debt = {
      id: "d_1",
      name: "Оренда",
      totalAmount: 500,
      dueDate: "",
      emoji: "💸",
      linkedTxIds: [] as string[],
    };

    it("лишає борг у finyk_debts і дописує txId у linkedTxIds", () => {
      seedFinykCache({ manualDebts: [debt] });
      const out = markDebtPaid({
        name: "mark_debt_paid",
        input: { debt_id: "d_1", amount: 500 },
      }) as ChatActionUndoableResult;
      expect(out.result).toContain("закрито");
      const debtsCall = mockWrite.mock.calls.find(
        (c) => c[0] === "finyk_debts",
      )!;
      const written = debtsCall[1] as Array<{
        id: string;
        linkedTxIds: string[];
      }>;
      expect(written).toHaveLength(1);
      expect(written[0]!.id).toBe("d_1");
      expect(written[0]!.linkedTxIds).toHaveLength(1);
      expect(written[0]!.linkedTxIds[0]).toMatch(/^m_/);
    });

    it("undo прибирає платіж і txId, не чіпаючи інші витрати й борги", () => {
      const other = { id: "m_other", date: "2026-10-01", amount: 7 };
      const otherDebt = { ...debt, id: "d_2", name: "Інший" };
      seedFinykCache({
        manualDebts: [debt, otherDebt],
        manualExpenses: [other],
      });
      const out = markDebtPaid({
        name: "mark_debt_paid",
        input: { debt_id: "d_1", amount: 500 },
      }) as ChatActionUndoableResult;
      expect(typeof out.undo).toBe("function");
      const expenses = mockWrite.mock.calls.find(
        (c) => c[0] === "finyk_manual_expenses_v1",
      )![1] as Array<{ id: string }>;
      const txId = expenses[0]!.id;
      const debts = mockWrite.mock.calls.find(
        (c) => c[0] === "finyk_debts",
      )![1] as unknown[];

      // Стан після дії (мок finykChatWrite кеш не оновлює) + чужа зміна
      // між дією й відкатом: undo має читати свіжий кеш.
      vi.clearAllMocks();
      seedFinykCache({ manualDebts: debts, manualExpenses: expenses });
      out.undo?.();

      const undoneExpenses = mockWrite.mock.calls.find(
        (c) => c[0] === "finyk_manual_expenses_v1",
      )![1] as Array<{ id: string }>;
      expect(undoneExpenses.map((e) => e.id)).toEqual(["m_other"]);
      const undoneDebts = mockWrite.mock.calls.find(
        (c) => c[0] === "finyk_debts",
      )![1] as Array<{ id: string; linkedTxIds: string[] }>;
      expect(undoneDebts.map((d) => d.id)).toEqual(["d_1", "d_2"]);
      expect(undoneDebts[0]!.linkedTxIds).not.toContain(txId);
      expect(triggerManualExpenseDeleteSqliteMirror).toHaveBeenCalledWith(txId);
    });

    it("undo ідемпотентний: другий виклик нічого не пише", () => {
      seedFinykCache({ manualDebts: [debt] });
      const out = markDebtPaid({
        name: "mark_debt_paid",
        input: { debt_id: "d_1", amount: 500 },
      }) as ChatActionUndoableResult;
      vi.clearAllMocks();
      seedFinykCache({ manualDebts: [debt], manualExpenses: [] });
      out.undo?.();
      expect(mockWrite).not.toHaveBeenCalled();
    });
  });
});
