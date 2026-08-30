import { afterEach, beforeEach, describe, it, expect, vi } from "vitest";
import {
  txSourceOf,
  toIsoDay,
  toDisplayAmount,
  changeCategory,
} from "./search";
import type { FinykSearchTx } from "./search";
import type { ChatActionUndoableResult } from "../types";

// Heavy IO deps — mocked so pure helpers can be imported. `ls` is
// key-aware (backed by `lsFixtures`, see beforeEach below) so the
// `changeCategory` / undo tests further down can seed and observe
// per-key state — the pure-helper tests above never call `ls`, so the
// richer mock is a no-op for them.
vi.mock("../../hubChatUtils", () => ({ ls: vi.fn() }));
vi.mock("./dualWriteBridge", () => ({ finykChatWrite: vi.fn() }));
vi.mock("../../../../modules/finyk/utils", () => ({
  resolveExpenseCategoryMeta: vi.fn(() => ({ label: "Інше", emoji: "🔹" })),
}));
vi.mock("../../../../modules/finyk/lib/sqliteReader", () => ({
  getCachedFinykSqliteState: vi.fn(() => ({
    manualExpenses: [],
    txCategories: {},
    hiddenTransactions: [],
    customCategories: [],
  })),
}));
// `changeCategory` guards against hallucinated ids via `entityLookup`
// (same guard as `hideTransaction`/`splitTransaction` in
// `transactions.test.ts`) — override only the existence checks so the
// happy-path tests below don't need real SQLite/Mono state.
vi.mock("./entityLookup", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./entityLookup")>()),
  finykTransactionExists: vi.fn(() => true),
  finykCategoryExists: vi.fn(() => true),
}));

import { ls } from "../../hubChatUtils";
import { finykChatWrite } from "./dualWriteBridge";

const mockLs = vi.mocked(ls) as ReturnType<typeof vi.fn>;
const mockWrite = vi.mocked(finykChatWrite);

/** Mirrors the real key-value store `ls`/`finykChatWrite` operate on. */
const lsFixtures = new Map<string, unknown>();

function isUndoable(
  out: ReturnType<typeof changeCategory>,
): out is ChatActionUndoableResult {
  return typeof out === "object" && out !== null && "undo" in out;
}

beforeEach(() => {
  vi.clearAllMocks();
  lsFixtures.clear();
  mockLs.mockImplementation((key: string, fallback: unknown) =>
    lsFixtures.has(key) ? lsFixtures.get(key) : fallback,
  );
  // Read-after-write: `changeCategory`'s `undo` re-reads `finyk_tx_cats`
  // via `ls`, so the mocked write must land back in the same fixture map
  // the mocked read serves from — otherwise undo would always see the
  // pre-mutation state regardless of what the forward write did.
  mockWrite.mockImplementation((key: string, value: unknown) => {
    lsFixtures.set(key, value);
  });
});

afterEach(() => {
  lsFixtures.clear();
});

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

// --- changeCategory (B39: reversible overwrite, canon hub-coach §8) ---

describe("changeCategory", () => {
  it("B39: classified reversible — returns undo, not a bare success string", () => {
    // Before the fix, `change_category` had no entry in `TOOL_RISK` at
    // all (neither destructive-with-confirm nor reversible-with-undo): a
    // silent overwrite. It's `reversible` now — a working `undo`, no
    // blocking modal.
    const out = changeCategory({
      name: "change_category",
      input: { tx_id: "m_1", category_id: "food" },
    });
    expect(isUndoable(out)).toBe(true);
  });

  it("writes the new category mapping", () => {
    const out = changeCategory({
      name: "change_category",
      input: { tx_id: "m_1", category_id: "food" },
    });
    expect(isUndoable(out)).toBe(true);
    expect(mockWrite).toHaveBeenCalledWith(
      "finyk_tx_cats",
      expect.objectContaining({ m_1: "food" }),
    );
  });

  it("undo restores the PREVIOUS category override", () => {
    lsFixtures.set("finyk_tx_cats", { m_1: "transport" });
    const out = changeCategory({
      name: "change_category",
      input: { tx_id: "m_1", category_id: "food" },
    });
    if (!isUndoable(out)) throw new Error("expected an undoable result");
    expect(lsFixtures.get("finyk_tx_cats")).toEqual({ m_1: "food" });

    out.undo?.();

    expect(lsFixtures.get("finyk_tx_cats")).toEqual({ m_1: "transport" });
  });

  it("undo on a transaction with NO prior override removes the key entirely", () => {
    // The transaction's category came from the base categorisation rules
    // (no entry in `finyk_tx_cats`) — undo must not invent a mapping to
    // `undefined`, it must leave the map exactly as it was: absent.
    lsFixtures.set("finyk_tx_cats", {});
    const out = changeCategory({
      name: "change_category",
      input: { tx_id: "m_1", category_id: "food" },
    });
    if (!isUndoable(out)) throw new Error("expected an undoable result");
    expect(lsFixtures.get("finyk_tx_cats")).toEqual({ m_1: "food" });

    out.undo?.();

    expect(lsFixtures.get("finyk_tx_cats")).toEqual({});
  });

  it("undo doesn't disturb OTHER transactions' overrides", () => {
    lsFixtures.set("finyk_tx_cats", { m_1: "transport", m_2: "housing" });
    const out = changeCategory({
      name: "change_category",
      input: { tx_id: "m_1", category_id: "food" },
    });
    if (!isUndoable(out)) throw new Error("expected an undoable result");

    out.undo?.();

    expect(lsFixtures.get("finyk_tx_cats")).toEqual({
      m_1: "transport",
      m_2: "housing",
    });
  });
});
