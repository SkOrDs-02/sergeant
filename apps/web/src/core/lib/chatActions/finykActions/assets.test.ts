import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../hubChatUtils", () => ({ ls: vi.fn() }));
vi.mock("./dualWriteBridge", () => ({ finykChatWrite: vi.fn() }));

import { ls } from "../../hubChatUtils";
import { finykChatWrite } from "./dualWriteBridge";
import { addAsset, recurringExpense } from "./assets";

const mockLs = vi.mocked(ls) as ReturnType<typeof vi.fn>;
const mockWrite = vi.mocked(finykChatWrite);

beforeEach(() => {
  vi.clearAllMocks();
  mockLs.mockReturnValue([]);
});

// ─── addAsset ─────────────────────────────────────────────────────────────────

describe("addAsset", () => {
  it("returns error for empty name", () => {
    const result = addAsset({
      type: "add_asset",
      input: { name: "", amount: 1000 },
    });
    expect(result).toContain("назва");
  });

  it("returns error for zero amount", () => {
    const result = addAsset({
      type: "add_asset",
      input: { name: "Квартира", amount: 0 },
    });
    expect(result).toContain("додатною");
  });

  it("returns error for negative amount", () => {
    const result = addAsset({
      type: "add_asset",
      input: { name: "Квартира", amount: -100 },
    });
    expect(result).toContain("додатною");
  });

  it("persists new asset with UAH default currency", () => {
    const result = addAsset({
      type: "add_asset",
      input: { name: "Авто", amount: 500000 },
    }) as { result: string };
    expect(result.result).toContain("Авто");
    expect(result.result).toContain("500000");
    expect(result.result).toContain("UAH");
    expect(mockWrite).toHaveBeenCalledWith(
      "finyk_assets",
      expect.arrayContaining([
        expect.objectContaining({
          name: "Авто",
          amount: 500000,
          currency: "UAH",
        }),
      ]),
    );
  });

  it("normalizes currency to uppercase 3-char", () => {
    addAsset({
      type: "add_asset",
      input: { name: "Депозит", amount: 1000, currency: "usd" },
    });
    expect(mockWrite).toHaveBeenCalledWith(
      "finyk_assets",
      expect.arrayContaining([expect.objectContaining({ currency: "USD" })]),
    );
  });

  it("trims currency to 3 chars", () => {
    addAsset({
      type: "add_asset",
      input: { name: "X", amount: 100, currency: "EURUSD" },
    });
    expect(mockWrite).toHaveBeenCalledWith(
      "finyk_assets",
      expect.arrayContaining([expect.objectContaining({ currency: "EUR" })]),
    );
  });

  it("appends to existing assets", () => {
    const existing = [{ id: "a1", name: "Old", amount: 100, currency: "UAH" }];
    mockLs.mockReturnValue(existing);
    addAsset({ type: "add_asset", input: { name: "New", amount: 200 } });
    const written = mockWrite.mock.calls[0]![1] as unknown[];
    expect(written).toHaveLength(2);
  });

  it("returns object with undo function", () => {
    const result = addAsset({
      type: "add_asset",
      input: { name: "Test", amount: 100 },
    });
    expect(typeof (result as { undo: () => void }).undo).toBe("function");
  });

  it("undo removes the created asset", () => {
    const result = addAsset({
      type: "add_asset",
      input: { name: "Undo Test", amount: 300 },
    }) as { undo: () => void };
    const written = mockWrite.mock.calls[0]![1] as Array<{ id: string }>;
    const assetId = written[written.length - 1]!.id;
    vi.clearAllMocks();
    mockLs.mockReturnValue([{ id: assetId, name: "Undo Test", amount: 300 }]);
    result.undo();
    expect(mockWrite).toHaveBeenCalledWith("finyk_assets", []);
  });
});

// ─── recurringExpense ─────────────────────────────────────────────────────────

describe("recurringExpense", () => {
  it("returns error for empty name", () => {
    const result = recurringExpense({
      type: "recurring_expense",
      input: { name: "", amount: 100 },
    });
    expect(result).toContain("назва");
  });

  it("returns error for zero or negative amount", () => {
    expect(
      recurringExpense({
        type: "recurring_expense",
        input: { name: "Netflix", amount: 0 },
      }),
    ).toContain("додатною");
    expect(
      recurringExpense({
        type: "recurring_expense",
        input: { name: "Netflix", amount: -5 },
      }),
    ).toContain("додатною");
  });

  it("creates subscription and returns confirmation with id", () => {
    const result = recurringExpense({
      type: "recurring_expense",
      input: { name: "Netflix", amount: 199, day_of_month: 15 },
    }) as string;
    expect(result).toContain("Netflix");
    expect(result).toContain("199");
    expect(result).toContain("15-го");
  });

  it("defaults day_of_month to 1 when not provided", () => {
    recurringExpense({
      type: "recurring_expense",
      input: { name: "Gym", amount: 500 },
    });
    const written = mockWrite.mock.calls[0]![1] as Array<{
      dayOfMonth: number;
    }>;
    expect(written[written.length - 1]?.dayOfMonth).toBe(1);
  });

  it("clamps out-of-range day_of_month to 1", () => {
    recurringExpense({
      type: "recurring_expense",
      input: { name: "X", amount: 100, day_of_month: 45 },
    });
    const written = mockWrite.mock.calls[0]![1] as Array<{
      dayOfMonth: number;
    }>;
    expect(written[written.length - 1]?.dayOfMonth).toBe(1);
  });

  it("stores category when provided", () => {
    recurringExpense({
      type: "recurring_expense",
      input: { name: "Gym", amount: 500, category: "health" },
    });
    const written = mockWrite.mock.calls[0]![1] as Array<{ category: string }>;
    expect(written[written.length - 1]?.category).toBe("health");
  });

  it("persists to finyk_subs key", () => {
    recurringExpense({
      type: "recurring_expense",
      input: { name: "Gym", amount: 500 },
    });
    expect(mockWrite).toHaveBeenCalledWith("finyk_subs", expect.any(Array));
  });
});
