import { describe, it, expect, beforeEach, vi } from "vitest";
import type { Mock } from "vitest";

// historyFetch.ts pulls the pg pool + queue + logger at module load; stub them
// so the pure helpers can be imported without a database or env.
vi.mock("../../db.js", () => ({ pool: {} }));
vi.mock("../../obs/logger.js", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));
vi.mock("../ai-memory/ingestQueue.js", () => ({
  enqueueMemoryIngest: vi.fn(),
}));
vi.mock("./mccCategories.js", () => ({ categorizeMcc: () => null }));
vi.mock("./tokenStore.js", () => ({ decryptAndLazyReencrypt: vi.fn() }));

import {
  BackfillItemSchema,
  buildMemoryContent,
  fetchAccountStatement,
} from "./historyFetch.js";

// 2023-11-14T22:13:20Z — fixed epoch so the date slice is deterministic.
const TS = 1_700_000_000;
const DATE = "2023-11-14";

function item(overrides: Record<string, unknown> = {}) {
  return BackfillItemSchema.parse({
    id: "tx1",
    time: TS,
    amount: -4200,
    operationAmount: -4200,
    currencyCode: 980,
    description: "Coffee",
    ...overrides,
  });
}

describe("BackfillItemSchema", () => {
  it("parses a minimal valid Monobank statement item with defaults", () => {
    const parsed = BackfillItemSchema.parse({
      id: "abc",
      time: TS,
      amount: 1000,
      operationAmount: 1000,
      currencyCode: 980,
    });
    expect(parsed.description).toBe("");
    expect(parsed.mcc).toBe(0);
  });

  it("rejects an item without an id", () => {
    const r = BackfillItemSchema.safeParse({
      time: TS,
      amount: 1,
      operationAmount: 1,
      currencyCode: 980,
    });
    expect(r.success).toBe(false);
  });

  it("rejects a non-integer amount (kopiykas must be whole minor units)", () => {
    const r = BackfillItemSchema.safeParse({
      id: "abc",
      time: TS,
      amount: 1.5,
      operationAmount: 1,
      currencyCode: 980,
    });
    expect(r.success).toBe(false);
  });

  it("rejects an out-of-range currency code", () => {
    const r = BackfillItemSchema.safeParse({
      id: "abc",
      time: TS,
      amount: 1,
      operationAmount: 1,
      currencyCode: 10_000,
    });
    expect(r.success).toBe(false);
  });

  it("rejects a negative timestamp", () => {
    const r = BackfillItemSchema.safeParse({
      id: "abc",
      time: -1,
      amount: 1,
      operationAmount: 1,
      currencyCode: 980,
    });
    expect(r.success).toBe(false);
  });
});

describe("buildMemoryContent", () => {
  it("formats an expense with the minus sign and currency symbol", () => {
    const out = buildMemoryContent(item({ amount: -4200 }), "food");
    expect(out).toContain("Витрата");
    expect(out).toContain("−"); // U+2212 minus, not a hyphen
    expect(out).toContain("₴");
    expect(out).toContain("Coffee");
    expect(out).toContain("· food");
    expect(out.endsWith(DATE)).toBe(true);
  });

  it("formats income with the plus sign and the income verb", () => {
    const out = buildMemoryContent(item({ amount: 5000 }), null);
    expect(out).toContain("Надходження");
    expect(out).toContain("+");
    expect(out).not.toContain("· food");
  });

  it("substitutes a placeholder when the description is empty", () => {
    const out = buildMemoryContent(item({ description: "" }), null);
    expect(out).toContain("Без опису");
  });

  it("omits the currency symbol for an unknown currency code", () => {
    const out = buildMemoryContent(item({ currencyCode: 9_999 }), null);
    expect(out).not.toContain("₴");
    expect(out).not.toContain("$");
  });
});

describe("fetchAccountStatement", () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns only schema-valid items, dropping malformed ones", async () => {
    const valid = {
      id: "ok",
      time: TS,
      amount: -100,
      operationAmount: -100,
      currencyCode: 980,
    };
    const malformed = { time: TS, amount: -100 }; // no id
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => [valid, malformed],
    });
    vi.stubGlobal("fetch", fetchMock);

    const out = await fetchAccountStatement("token", "acc1", 0, TS);
    expect(out).toHaveLength(1);
    expect(out[0]!.id).toBe("ok");

    const url = (fetchMock as Mock).mock.calls[0]![0] as string;
    expect(url).toContain("/personal/statement/acc1/0/");
  });

  it("throws when the upstream responds with a non-ok status", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 429,
        text: async () => "Too Many Requests",
      }),
    );
    await expect(fetchAccountStatement("token", "acc1", 0, TS)).rejects.toThrow(
      /429/,
    );
  });

  it("returns an empty array when the upstream body is not an array", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) }),
    );
    const out = await fetchAccountStatement("token", "acc1", 0, TS);
    expect(out).toEqual([]);
  });
});
