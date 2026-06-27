import { describe, it, expect, vi } from "vitest";
import { txSourceOf, toIsoDay, toDisplayAmount } from "./search";
import type { FinykSearchTx } from "./search";

// Heavy IO deps — mocked so pure helpers can be imported
vi.mock("../../hubChatUtils", () => ({ ls: vi.fn(() => []) }));
vi.mock("./dualWriteBridge", () => ({ finykChatWrite: vi.fn() }));
vi.mock("../../../../modules/finyk/utils", () => ({
  resolveExpenseCategoryMeta: vi.fn(() => ({ label: "Інше", emoji: "🔹" })),
}));
vi.mock("../../../../modules/finyk/lib/sqliteReader", () => ({
  getCachedFinykSqliteState: vi.fn(() => ({
    manualExpenses: [],
    txCategories: {},
    hiddenTransactions: [],
  })),
}));

// --- txSourceOf ---

describe("txSourceOf", () => {
  it("returns source tag when present", () => {
    const tx: FinykSearchTx = {
      id: "1",
      date: "2026-01-01",
      amount: 100,
      description: "",
      source: "manual",
    };
    expect(txSourceOf(tx)).toBe("manual");
  });

  it("prefers source tag over type field", () => {
    const tx: FinykSearchTx = {
      id: "1",
      date: "2026-01-01",
      amount: 100,
      description: "",
      source: "bank",
      type: "income",
    };
    expect(txSourceOf(tx)).toBe("bank");
  });

  it("falls back to manual when type is income", () => {
    const tx: FinykSearchTx = {
      id: "1",
      date: "2026-01-01",
      amount: 100,
      description: "",
      type: "income",
    };
    expect(txSourceOf(tx)).toBe("manual");
  });

  it("falls back to manual when type is expense", () => {
    const tx: FinykSearchTx = {
      id: "1",
      date: "2026-01-01",
      amount: -50,
      description: "",
      type: "expense",
    };
    expect(txSourceOf(tx)).toBe("manual");
  });

  it("falls back to bank when no source tag and type is neither income nor expense", () => {
    const tx: FinykSearchTx = {
      id: "1",
      date: "2026-01-01",
      amount: 100,
      description: "",
    };
    expect(txSourceOf(tx)).toBe("bank");
  });
});

// --- toIsoDay ---

describe("toIsoDay", () => {
  it("slices a full ISO string to 10 chars", () => {
    expect(toIsoDay("2026-06-15T12:00:00Z")).toBe("2026-06-15");
  });

  it("returns a bare YYYY-MM-DD unchanged", () => {
    expect(toIsoDay("2026-06-15")).toBe("2026-06-15");
  });

  it("converts a millisecond timestamp (>10^10)", () => {
    const ms = new Date("2026-06-15T00:00:00Z").getTime(); // ~1750118400000
    const result = toIsoDay(ms);
    expect(result).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("converts a second timestamp (<10^10) by multiplying by 1000", () => {
    const sec = Math.floor(new Date("2026-06-15T00:00:00Z").getTime() / 1000);
    const result = toIsoDay(sec);
    expect(result).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("returns empty string for non-finite number", () => {
    expect(toIsoDay(NaN)).toBe("");
    expect(toIsoDay(Infinity)).toBe("");
  });

  it("returns empty string for null", () => {
    expect(toIsoDay(null)).toBe("");
  });

  it("returns empty string for object", () => {
    expect(toIsoDay({})).toBe("");
  });

  it("returns empty string for non-date string", () => {
    expect(toIsoDay("hello")).toBe("");
  });
});

// --- toDisplayAmount ---

describe("toDisplayAmount", () => {
  it("returns absolute amount for manual source (no division)", () => {
    const tx: FinykSearchTx = {
      id: "1",
      date: "2026-01-01",
      amount: -150,
      description: "",
    };
    expect(toDisplayAmount(tx, "manual")).toBe(150);
  });

  it("divides by 100 for bank source (kopiykas → hryvnias)", () => {
    const tx: FinykSearchTx = {
      id: "1",
      date: "2026-01-01",
      amount: 15000,
      description: "",
    };
    expect(toDisplayAmount(tx, "bank")).toBe(150);
  });

  it("returns 0 for NaN amount", () => {
    const tx: FinykSearchTx = {
      id: "1",
      date: "2026-01-01",
      amount: NaN,
      description: "",
    };
    expect(toDisplayAmount(tx, "manual")).toBe(0);
  });

  it("handles zero amount", () => {
    const tx: FinykSearchTx = {
      id: "1",
      date: "2026-01-01",
      amount: 0,
      description: "",
    };
    expect(toDisplayAmount(tx, "bank")).toBe(0);
  });

  it("returns absolute value for negative bank amount", () => {
    const tx: FinykSearchTx = {
      id: "1",
      date: "2026-01-01",
      amount: -5000,
      description: "",
    };
    expect(toDisplayAmount(tx, "bank")).toBe(50);
  });
});
