import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../hubChatUtils", () => ({ ls: vi.fn() }));
vi.mock("./dualWriteBridge", () => ({ finykChatWrite: vi.fn() }));
vi.mock("../../../../modules/finyk/utils", () => ({
  resolveExpenseCategoryMeta: vi.fn(() => null),
}));
vi.mock("../../../../modules/finyk/lib/sqliteWriter", () => ({
  triggerHiddenTransactionSqliteMirror: vi.fn(),
  triggerManualExpenseDeleteSqliteMirror: vi.fn(),
}));

import { ls } from "../../hubChatUtils";
import { finykChatWrite } from "./dualWriteBridge";
import { resolveExpenseCategoryMeta } from "../../../../modules/finyk/utils";
import {
  triggerHiddenTransactionSqliteMirror,
  triggerManualExpenseDeleteSqliteMirror,
} from "../../../../modules/finyk/lib/sqliteWriter";
import {
  createTransaction,
  deleteTransaction,
  hideTransaction,
  splitTransaction,
} from "./transactions";
import type { ChatActionUndoableResult } from "../types";

const mockLs = vi.mocked(ls) as ReturnType<typeof vi.fn>;
const mockWrite = vi.mocked(finykChatWrite);
const mockResolveMeta = vi.mocked(resolveExpenseCategoryMeta);
const mockHiddenMirror = vi.mocked(triggerHiddenTransactionSqliteMirror);
const mockDeleteMirror = vi.mocked(triggerManualExpenseDeleteSqliteMirror);

function isUndoable(
  out: ReturnType<typeof createTransaction>,
): out is ChatActionUndoableResult {
  return typeof out === "object" && out !== null && "undo" in out;
}

beforeEach(() => {
  vi.clearAllMocks();
  // Mirrors the real `ls(key, fallback)` behaviour (empty storage → fallback)
  // so per-call return shape (array vs. record) stays correct without every
  // test having to know the exact number/order of `ls()` calls a handler
  // makes. Tests that need a non-empty read override with `mockReturnValueOnce`.
  mockLs.mockImplementation((_key: string, fallback: unknown) => fallback);
  mockResolveMeta.mockReturnValue(null);
});

// ─── createTransaction ──────────────────────────────────────────────────────

describe("createTransaction", () => {
  it("returns error for non-numeric amount", () => {
    const out = createTransaction({
      name: "create_transaction",
      input: { amount: "not-a-number" },
    });
    expect(out).toBe("Некоректна сума транзакції.");
    expect(mockWrite).not.toHaveBeenCalled();
  });

  it("returns error for zero amount", () => {
    const out = createTransaction({
      name: "create_transaction",
      input: { amount: 0 },
    });
    expect(out).toBe("Некоректна сума транзакції.");
  });

  it("returns error for negative amount", () => {
    const out = createTransaction({
      name: "create_transaction",
      input: { amount: -50 },
    });
    expect(out).toBe("Некоректна сума транзакції.");
  });

  it("defaults to expense type when type is not 'income'", () => {
    const out = createTransaction({
      name: "create_transaction",
      input: { amount: 100, description: "кава" },
    }) as ChatActionUndoableResult;
    expect(out.result).toContain("Витрату");
    expect(mockWrite).toHaveBeenCalledWith(
      "finyk_manual_expenses_v1",
      expect.arrayContaining([expect.objectContaining({ type: "expense" })]),
    );
  });

  it("records income when type is 'income'", () => {
    const out = createTransaction({
      name: "create_transaction",
      input: { type: "income", amount: 5000, description: "зарплата" },
    }) as ChatActionUndoableResult;
    expect(out.result).toContain("Дохід");
    expect(mockWrite).toHaveBeenCalledWith(
      "finyk_manual_expenses_v1",
      expect.arrayContaining([expect.objectContaining({ type: "income" })]),
    );
  });

  it("stores absolute amount regardless of sign", () => {
    createTransaction({
      name: "create_transaction",
      input: { amount: 250 },
    });
    const written = mockWrite.mock.calls[0]![1] as Array<{ amount: number }>;
    expect(written[0]?.amount).toBe(250);
  });

  it("includes category label from resolveExpenseCategoryMeta in result", () => {
    mockResolveMeta.mockReturnValue({ id: "food", label: "🛒 Продукти" });
    const out = createTransaction({
      name: "create_transaction",
      input: { amount: 100, category: "food" },
    }) as ChatActionUndoableResult;
    expect(out.result).toContain("🛒 Продукти");
  });

  it("falls back to raw category text when no meta is resolved", () => {
    mockResolveMeta.mockReturnValue(null);
    const out = createTransaction({
      name: "create_transaction",
      input: { amount: 100, category: "custom_cat" },
    }) as ChatActionUndoableResult;
    expect(out.result).toContain("custom_cat");
  });

  it("prepends the new entry so it is written first", () => {
    mockLs.mockReturnValue([{ id: "m_old", amount: 10 }]);
    createTransaction({
      name: "create_transaction",
      input: { amount: 20 },
    });
    const written = mockWrite.mock.calls[0]![1] as Array<{ id: string }>;
    expect(written).toHaveLength(2);
    expect(written[0]?.id).not.toBe("m_old");
    expect(written[1]?.id).toBe("m_old");
  });

  it("returns an undoable result with a manual-expense id", () => {
    const out = createTransaction({
      name: "create_transaction",
      input: { amount: 100 },
    });
    expect(isUndoable(out)).toBe(true);
    expect((out as ChatActionUndoableResult).result).toMatch(/id:m_/);
  });

  describe("undo", () => {
    it("removes only the just-created entry", () => {
      const out = createTransaction({
        name: "create_transaction",
        input: { amount: 100 },
      }) as ChatActionUndoableResult;
      const written = mockWrite.mock.calls[0]![1] as Array<{ id: string }>;
      const newId = written[0]!.id;

      vi.clearAllMocks();
      mockLs.mockReturnValue([
        { id: newId, amount: 100 },
        { id: "m_other", amount: 50 },
      ]);
      out.undo();

      const afterUndo = mockWrite.mock.calls[0]![1] as Array<{ id: string }>;
      expect(afterUndo).toHaveLength(1);
      expect(afterUndo[0]?.id).toBe("m_other");
      expect(mockDeleteMirror).toHaveBeenCalledWith(newId);
    });

    it("is idempotent — a second undo call does not write again", () => {
      const out = createTransaction({
        name: "create_transaction",
        input: { amount: 100 },
      }) as ChatActionUndoableResult;
      const written = mockWrite.mock.calls[0]![1] as Array<{ id: string }>;
      const newId = written[0]!.id;

      vi.clearAllMocks();
      mockLs.mockReturnValue([]); // already removed elsewhere
      out.undo();

      expect(mockWrite).not.toHaveBeenCalled();
      // The SQLite mirror soft-delete still fires — idempotent by design.
      expect(mockDeleteMirror).toHaveBeenCalledWith(newId);
    });
  });
});

// ─── hideTransaction ────────────────────────────────────────────────────────

describe("hideTransaction", () => {
  it("adds the tx id to the hidden list", () => {
    const out = hideTransaction({
      name: "hide_transaction",
      input: { tx_id: "tx1" },
    });
    expect(out).toContain("tx1");
    expect(out).toContain("приховано");
    expect(mockWrite).toHaveBeenCalledWith("finyk_hidden_txs", ["tx1"]);
  });

  it("mirrors the hidden tx into SQLite", () => {
    hideTransaction({ name: "hide_transaction", input: { tx_id: "tx1" } });
    expect(mockHiddenMirror).toHaveBeenCalledWith("tx1");
  });

  it("is idempotent when the tx is already hidden", () => {
    mockLs.mockReturnValue(["tx1"]);
    hideTransaction({ name: "hide_transaction", input: { tx_id: "tx1" } });
    expect(mockWrite).not.toHaveBeenCalled();
    // Mirror still fires — safe to re-trigger a soft-delete-style upsert.
    expect(mockHiddenMirror).toHaveBeenCalledWith("tx1");
  });
});

// ─── deleteTransaction ──────────────────────────────────────────────────────

describe("deleteTransaction", () => {
  it("returns an error for an empty tx_id", () => {
    const out = deleteTransaction({
      name: "delete_transaction",
      input: { tx_id: "" },
    });
    expect(out).toContain("Потрібен tx_id");
    expect(mockWrite).not.toHaveBeenCalled();
  });

  it("refuses to delete a non-manual (bank) transaction", () => {
    const out = deleteTransaction({
      name: "delete_transaction",
      input: { tx_id: "bank_123" },
    });
    expect(out).toContain("hide_transaction");
    expect(mockWrite).not.toHaveBeenCalled();
  });

  it("returns an error when the manual tx is not found", () => {
    mockLs.mockReturnValue([]);
    const out = deleteTransaction({
      name: "delete_transaction",
      input: { tx_id: "m_ghost" },
    });
    expect(out).toContain("не знайдено");
    expect(mockWrite).not.toHaveBeenCalled();
  });

  it("removes the manual tx and mirrors the delete", () => {
    mockLs.mockReturnValue([{ id: "m_1" }, { id: "m_2" }]);
    const out = deleteTransaction({
      name: "delete_transaction",
      input: { tx_id: "m_1" },
    });
    expect(out).toContain("m_1");
    expect(out).toContain("видалено");
    expect(mockWrite).toHaveBeenCalledWith("finyk_manual_expenses_v1", [
      { id: "m_2" },
    ]);
    expect(mockDeleteMirror).toHaveBeenCalledWith("m_1");
  });
});

// ─── splitTransaction ───────────────────────────────────────────────────────

describe("splitTransaction", () => {
  it("returns an error for an empty tx_id", () => {
    const out = splitTransaction({
      name: "split_transaction",
      input: {
        tx_id: "",
        parts: [
          { category_id: "food", amount: 10 },
          { category_id: "transport", amount: 20 },
        ],
      },
    });
    expect(out).toBe("Потрібен tx_id.");
    expect(mockWrite).not.toHaveBeenCalled();
  });

  it("returns an error for fewer than 2 parts", () => {
    const out = splitTransaction({
      name: "split_transaction",
      input: { tx_id: "tx1", parts: [{ category_id: "food", amount: 10 }] },
    });
    expect(out).toContain("2 частини");
    expect(mockWrite).not.toHaveBeenCalled();
  });

  it("persists the split under finyk_tx_splits keyed by tx id", () => {
    splitTransaction({
      name: "split_transaction",
      input: {
        tx_id: "tx1",
        parts: [
          { category_id: "food", amount: 50 },
          { category_id: "transport", amount: 30 },
        ],
      },
    });
    expect(mockWrite).toHaveBeenCalledWith("finyk_tx_splits", {
      tx1: [
        { categoryId: "food", amount: 50 },
        { categoryId: "transport", amount: 30 },
      ],
    });
  });

  it("uses category label when resolved, raw id otherwise", () => {
    mockResolveMeta.mockImplementation((id) =>
      id === "food" ? { id: "food", label: "🛒 Продукти" } : null,
    );
    const out = splitTransaction({
      name: "split_transaction",
      input: {
        tx_id: "tx1",
        parts: [
          { category_id: "food", amount: 50 },
          { category_id: "custom_cat", amount: 30 },
        ],
      },
    });
    expect(out).toContain("🛒 Продукти: 50 грн");
    expect(out).toContain("custom_cat: 30 грн");
  });

  it("coerces negative/non-numeric part amounts to absolute numbers", () => {
    splitTransaction({
      name: "split_transaction",
      input: {
        tx_id: "tx1",
        parts: [
          { category_id: "food", amount: -50 },
          {
            category_id: "transport",
            amount: "not-a-number" as unknown as number,
          },
        ],
      },
    });
    const written = mockWrite.mock.calls[0]![1] as Record<
      string,
      Array<{ amount: number }>
    >;
    expect(written["tx1"]![0]?.amount).toBe(50);
    expect(written["tx1"]![1]?.amount).toBe(0);
  });

  it("merges into existing splits for other tx ids", () => {
    mockLs.mockReturnValue({
      "tx-existing": [{ categoryId: "food", amount: 10 }],
    });
    splitTransaction({
      name: "split_transaction",
      input: {
        tx_id: "tx1",
        parts: [
          { category_id: "food", amount: 50 },
          { category_id: "transport", amount: 30 },
        ],
      },
    });
    const written = mockWrite.mock.calls[0]![1] as Record<string, unknown>;
    expect(written).toHaveProperty("tx-existing");
    expect(written).toHaveProperty("tx1");
  });
});
