import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../hubChatUtils", () => ({ ls: vi.fn(), lsSet: vi.fn() }));
vi.mock("./dualWriteBridge", () => ({ finykChatWrite: vi.fn() }));
vi.mock("../../../../modules/finyk/utils", () => ({
  resolveExpenseCategoryMeta: vi.fn((id: string) => ({ label: `Cat(${id})` })),
}));
vi.mock("../../../../modules/finyk/lib/sqliteReader", () => ({
  getCachedFinykSqliteState: vi.fn(),
}));

import { ls } from "../../hubChatUtils";
import { finykChatWrite } from "./dualWriteBridge";
import { getCachedFinykSqliteState } from "../../../../modules/finyk/lib/sqliteReader";
import {
  batchCategorize,
  changeCategory,
  findTransaction,
  toDisplayAmount,
  toIsoDay,
  txSourceOf,
} from "./search";

const mockLs = vi.mocked(ls) as ReturnType<typeof vi.fn>;
const mockWrite = vi.mocked(finykChatWrite);
const mockGetCached = vi.mocked(getCachedFinykSqliteState);

function makeState() {
  return {
    hiddenTransactions: [],
    customCategories: [],
    txCategories: {},
    manualExpenses: [],
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockGetCached.mockReturnValue(makeState());
  mockLs.mockReturnValue([]);
});

// ─── txSourceOf ───────────────────────────────────────────────────────────────

describe("txSourceOf", () => {
  it("prefers source field when present", () => {
    expect(
      txSourceOf({
        id: "t1",
        date: "",
        amount: 0,
        description: "",
        source: "manual",
      }),
    ).toBe("manual");
    expect(
      txSourceOf({
        id: "t1",
        date: "",
        amount: 0,
        description: "",
        source: "bank",
      }),
    ).toBe("bank");
  });

  it("falls back to type field when source absent", () => {
    expect(
      txSourceOf({
        id: "t1",
        date: "",
        amount: 0,
        description: "",
        type: "income",
      }),
    ).toBe("manual");
    expect(
      txSourceOf({
        id: "t1",
        date: "",
        amount: 0,
        description: "",
        type: "expense",
      }),
    ).toBe("manual");
  });

  it("defaults to bank when no source or type", () => {
    expect(txSourceOf({ id: "t1", date: "", amount: 0, description: "" })).toBe(
      "bank",
    );
  });
});

// ─── toIsoDay ─────────────────────────────────────────────────────────────────

describe("toIsoDay", () => {
  it("extracts date from ISO string", () => {
    expect(toIsoDay("2026-04-15T12:00:00Z")).toBe("2026-04-15");
    expect(toIsoDay("2026-04-15")).toBe("2026-04-15");
  });

  it("converts epoch milliseconds to date", () => {
    const ms = new Date("2026-04-15T00:00:00Z").getTime();
    const result = toIsoDay(ms);
    expect(result).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("converts epoch seconds to date", () => {
    const sec = Math.floor(new Date("2026-04-15T00:00:00Z").getTime() / 1000);
    const result = toIsoDay(sec);
    expect(result).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("returns empty string for invalid input", () => {
    expect(toIsoDay(null)).toBe("");
    expect(toIsoDay("bad-date")).toBe("");
  });
});

// ─── toDisplayAmount ──────────────────────────────────────────────────────────

describe("toDisplayAmount", () => {
  it("manual: returns absolute value in hryvnias", () => {
    expect(
      toDisplayAmount(
        { id: "t", date: "", amount: -500, description: "" },
        "manual",
      ),
    ).toBe(500);
  });

  it("bank: divides by 100 (kopiykas to hryvnias)", () => {
    expect(
      toDisplayAmount(
        { id: "t", date: "", amount: -50000, description: "" },
        "bank",
      ),
    ).toBe(500);
  });

  it("returns 0 for non-finite amount", () => {
    expect(
      toDisplayAmount(
        { id: "t", date: "", amount: NaN, description: "" },
        "bank",
      ),
    ).toBe(0);
  });
});

// ─── changeCategory ───────────────────────────────────────────────────────────

describe("changeCategory", () => {
  it("saves category and returns confirmation", () => {
    mockLs.mockReturnValue({});
    const result = changeCategory({
      type: "change_category",
      input: { tx_id: "t1", category_id: "food" },
    });
    expect(result).toContain("t1");
    expect(result).toContain("Cat(food)");
    expect(mockWrite).toHaveBeenCalledWith("finyk_tx_cats", { t1: "food" });
  });
});

// ─── findTransaction ──────────────────────────────────────────────────────────

describe("findTransaction", () => {
  it("returns error when no filters provided", () => {
    const result = findTransaction({ type: "find_transaction", input: {} });
    expect(result).toContain("Потрібен query");
  });

  it("returns not-found when no matches", () => {
    const result = findTransaction({
      type: "find_transaction",
      input: { query: "nonexistent" },
    });
    expect(result).toContain("не знайдено");
  });
});

// ─── batchCategorize ──────────────────────────────────────────────────────────

describe("batchCategorize", () => {
  it("returns error when no pattern", () => {
    const result = batchCategorize({
      type: "batch_categorize",
      input: { pattern: "", category_id: "food" },
    });
    expect(result).toContain("pattern");
  });

  it("returns error when no category_id", () => {
    const result = batchCategorize({
      type: "batch_categorize",
      input: { pattern: "кава", category_id: "" },
    });
    expect(result).toContain("category_id");
  });

  it("dry_run by default — returns preview without saving", () => {
    const result = batchCategorize({
      type: "batch_categorize",
      input: { pattern: "кава", category_id: "food" },
    });
    expect(result).toContain("кава");
  });
});
