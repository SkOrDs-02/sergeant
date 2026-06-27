import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../hubChatUtils", () => ({
  ls: vi.fn(),
}));
vi.mock("./dualWriteBridge", () => ({
  finykChatWrite: vi.fn(),
}));

import { ls } from "../../hubChatUtils";
import { finykChatWrite } from "./dualWriteBridge";
import { createDebt, createReceivable, markDebtPaid } from "./debts";

const mockLs = vi.mocked(ls) as ReturnType<typeof vi.fn>;
const mockWrite = vi.mocked(finykChatWrite);

beforeEach(() => {
  vi.clearAllMocks();
  mockLs.mockReturnValue([]);
});

// ─── createDebt ───────────────────────────────────────────────────────────────

describe("createDebt", () => {
  it("returns result with debt name and amount", () => {
    const out = createDebt({
      type: "create_debt",
      input: { name: "Аренда", amount: 5000 },
    });
    expect(out).toMatchObject({ result: expect.stringContaining("Аренда") });
    expect(out).toMatchObject({ result: expect.stringContaining("5000") });
  });

  it("persists the new debt via finykChatWrite", () => {
    createDebt({
      type: "create_debt",
      input: { name: "Позика", amount: 1000 },
    });
    expect(mockWrite).toHaveBeenCalledWith(
      "finyk_debts",
      expect.arrayContaining([
        expect.objectContaining({ name: "Позика", totalAmount: 1000 }),
      ]),
    );
  });

  it("uses 💸 emoji by default", () => {
    createDebt({ type: "create_debt", input: { name: "X", amount: 100 } });
    expect(mockWrite).toHaveBeenCalledWith(
      "finyk_debts",
      expect.arrayContaining([expect.objectContaining({ emoji: "💸" })]),
    );
  });

  it("uses provided emoji", () => {
    createDebt({
      type: "create_debt",
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
    mockLs.mockReturnValueOnce(existing);
    createDebt({ type: "create_debt", input: { name: "New", amount: 300 } });
    const written = mockWrite.mock.calls[0]![1] as unknown[];
    expect(written).toHaveLength(2);
  });

  it("undo removes the created debt", () => {
    const result = createDebt({
      type: "create_debt",
      input: { name: "Тест", amount: 200 },
    }) as { result: string; undo: () => void };
    const written = mockWrite.mock.calls[0]![1] as Array<{ id: string }>;
    const newId = written[written.length - 1]!.id;

    vi.clearAllMocks();
    mockLs.mockReturnValue([
      {
        id: newId,
        name: "Тест",
        totalAmount: 200,
        dueDate: "",
        emoji: "💸",
        linkedTxIds: [],
      },
    ]);
    result.undo();
    const afterUndo = mockWrite.mock.calls[0]![1] as unknown[];
    expect(afterUndo).toHaveLength(0);
  });
});

// ─── createReceivable ─────────────────────────────────────────────────────────

describe("createReceivable", () => {
  it("returns result with debtor name and amount", () => {
    const out = createReceivable({
      type: "create_receivable",
      input: { name: "Іванченко", amount: 2500 },
    });
    expect(out).toMatchObject({ result: expect.stringContaining("Іванченко") });
    expect(out).toMatchObject({ result: expect.stringContaining("2500") });
  });

  it("persists via finykChatWrite on finyk_recv key", () => {
    createReceivable({
      type: "create_receivable",
      input: { name: "X", amount: 100 },
    });
    expect(mockWrite).toHaveBeenCalledWith("finyk_recv", expect.any(Array));
  });

  it("undo removes the created receivable", () => {
    const result = createReceivable({
      type: "create_receivable",
      input: { name: "Y", amount: 500 },
    }) as { result: string; undo: () => void };
    const written = mockWrite.mock.calls[0]![1] as Array<{ id: string }>;
    const newId = written[written.length - 1]!.id;

    vi.clearAllMocks();
    mockLs.mockReturnValue([
      { id: newId, name: "Y", amount: 500, linkedTxIds: [] },
    ]);
    result.undo();
    const afterUndo = mockWrite.mock.calls[0]![1] as unknown[];
    expect(afterUndo).toHaveLength(0);
  });
});

// ─── markDebtPaid ─────────────────────────────────────────────────────────────

describe("markDebtPaid", () => {
  it("returns error for empty debt_id", () => {
    const result = markDebtPaid({
      type: "mark_debt_paid",
      input: { debt_id: "", amount: 100 },
    });
    expect(result).toContain("debt_id");
  });

  it("returns error when debt not found", () => {
    mockLs.mockReturnValue([]);
    const result = markDebtPaid({
      type: "mark_debt_paid",
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
    mockLs.mockReturnValue([debt]);
    const result = markDebtPaid({
      type: "mark_debt_paid",
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
    mockLs.mockReturnValueOnce([debt]).mockReturnValueOnce([]);
    const result = markDebtPaid({
      type: "mark_debt_paid",
      input: { debt_id: "d_1", amount: 300 },
    }) as string;
    expect(result).toContain("300");
    expect(result).toContain("Оренда");
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
    mockLs.mockReturnValueOnce([debt]).mockReturnValueOnce([]);
    const result = markDebtPaid({
      type: "mark_debt_paid",
      input: { debt_id: "d_1", amount: 500 },
    }) as string;
    expect(result).toContain("закрито");
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
    mockLs.mockReturnValueOnce([debt]).mockReturnValueOnce([]);
    const result = markDebtPaid({
      type: "mark_debt_paid",
      input: { debt_id: "d_1", amount: 300 },
    }) as string;
    expect(result).not.toContain("закрито");
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
    mockLs.mockReturnValueOnce([debt]).mockReturnValueOnce([]);
    markDebtPaid({
      type: "mark_debt_paid",
      input: { debt_id: "d_1", amount: 200, note: "Part 1" },
    });
    const expensesCall = mockWrite.mock.calls[0]!;
    expect(expensesCall[0]).toBe("finyk_manual_expenses_v1");
    const expenses = expensesCall[1] as Array<{ description: string }>;
    expect(expenses[0]?.description).toContain("Part 1");
  });
});
