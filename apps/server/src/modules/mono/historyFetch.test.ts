import { describe, it, expect, beforeEach, vi } from "vitest";
import type { Mock } from "vitest";

const harness = vi.hoisted(() => ({
  pool: { connect: vi.fn(), query: vi.fn() },
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
  enqueueMemoryIngest: vi.fn(),
  categorizeMcc: vi.fn(() => null),
  decryptAndLazyReencrypt: vi.fn(),
}));

// historyFetch.ts pulls the pg pool + queue + logger at module load; stub them
// so the pure helpers can be imported without a database or env.
vi.mock("../../db.js", () => ({ pool: harness.pool }));
vi.mock("../../obs/logger.js", () => ({
  logger: harness.logger,
}));
vi.mock("../ai-memory/ingestQueue.js", () => ({
  enqueueMemoryIngest: harness.enqueueMemoryIngest,
}));
vi.mock("./mccCategories.js", () => ({
  categorizeMcc: harness.categorizeMcc,
}));
vi.mock("./tokenStore.js", () => ({
  decryptAndLazyReencrypt: harness.decryptAndLazyReencrypt,
}));

import {
  BackfillItemSchema,
  buildMemoryContent,
  fetchAccountStatement,
  runMonoHistoryBackfill,
  scheduleHistoryBackfill,
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
    vi.clearAllMocks();
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

describe("runMonoHistoryBackfill", () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
    vi.clearAllMocks();
    harness.decryptAndLazyReencrypt.mockResolvedValue("mono-token");
    harness.pool.query.mockResolvedValue({ rows: [] });
  });

  function makeClient() {
    return {
      query: vi.fn().mockResolvedValue({ rows: [{ inserted: true }] }),
      release: vi.fn(),
    };
  }

  it("decrypts the token, fetches statements, upserts inserted rows, and enqueues memory", async () => {
    const client = makeClient();
    harness.pool.connect.mockResolvedValue(client);
    harness.categorizeMcc.mockReturnValue("food" as never);
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => [
          {
            id: "tx1",
            time: TS,
            amount: -4200,
            operationAmount: -4200,
            currencyCode: 980,
            description: "Coffee",
            mcc: 5814,
          },
        ],
      }),
    );

    await runMonoHistoryBackfill(
      "user_1",
      [{ id: "acc1" }],
      {
        token_ciphertext: "cipher",
        token_iv: "iv",
        token_tag: "tag",
        token_key_version: "v1",
      } as never,
      {} as never,
    );

    expect(harness.decryptAndLazyReencrypt).toHaveBeenCalledTimes(1);
    expect(client.query).toHaveBeenCalledWith("BEGIN");
    expect(client.query).toHaveBeenCalledWith("COMMIT");
    expect(client.release).toHaveBeenCalledTimes(1);
    expect(harness.enqueueMemoryIngest).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "user_1",
        source: "finyk",
        sourceRef: "tx1",
        content: expect.stringContaining("Coffee"),
        metadata: expect.objectContaining({
          monoAccountId: "acc1",
          categorySlug: "food",
        }),
      }),
    );
    expect(harness.pool.query).toHaveBeenCalledWith(
      expect.stringContaining("UPDATE mono_connection"),
      ["user_1"],
    );
  });

  it("rolls back a failed transaction and continues to completion logging", async () => {
    const client = makeClient();
    client.query
      .mockResolvedValueOnce({ rows: [] }) // BEGIN
      .mockRejectedValueOnce(new Error("insert failed")) // INSERT
      .mockResolvedValueOnce({ rows: [] }); // ROLLBACK
    harness.pool.connect.mockResolvedValue(client);
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => [
          {
            id: "tx1",
            time: TS,
            amount: -100,
            operationAmount: -100,
            currencyCode: 980,
          },
        ],
      }),
    );

    await runMonoHistoryBackfill(
      "user_1",
      [{ id: "acc1" }],
      {
        token_ciphertext: "cipher",
        token_iv: "iv",
        token_tag: "tag",
        token_key_version: "v1",
      } as never,
      {} as never,
    );

    expect(client.query).toHaveBeenCalledWith("ROLLBACK");
    expect(harness.logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({
        msg: "mono_backfill_account_error",
        monoAccountId: "acc1",
      }),
    );
    expect(harness.logger.info).toHaveBeenCalledWith(
      expect.objectContaining({
        msg: "mono_backfill_complete",
        totalInserted: 0,
      }),
    );
  });

  it("waits between multiple accounts to respect Monobank statement pacing", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-01T00:00:00.000Z"));
    harness.pool.query.mockResolvedValue({ rows: [] });
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: true, json: async () => [] }),
    );

    const promise = runMonoHistoryBackfill(
      "user_1",
      [{ id: "acc1" }, { id: "acc2" }],
      {
        token_ciphertext: "cipher",
        token_iv: "iv",
        token_tag: "tag",
        token_key_version: "v1",
      } as never,
      {} as never,
    );

    await vi.advanceTimersByTimeAsync(0);
    expect(global.fetch).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(61_999);
    expect(global.fetch).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(1);
    await promise;

    expect(global.fetch).toHaveBeenCalledTimes(2);
    const urls = vi
      .mocked(global.fetch)
      .mock.calls.map((call) => String(call[0]));
    expect(urls[0]).toContain("/personal/statement/acc1/");
    expect(urls[1]).toContain("/personal/statement/acc2/");
  });

  it("logs and completes when the final last_backfill_at update fails", async () => {
    harness.pool.query.mockRejectedValueOnce(new Error("update failed"));

    await runMonoHistoryBackfill(
      "user_1",
      [],
      {
        token_ciphertext: "cipher",
        token_iv: "iv",
        token_tag: "tag",
        token_key_version: "v1",
      } as never,
      {} as never,
    );

    expect(harness.logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({
        msg: "mono_backfill_update_at_error",
      }),
    );
    expect(harness.logger.info).toHaveBeenCalledWith(
      expect.objectContaining({
        msg: "mono_backfill_complete",
        accounts: 0,
        totalInserted: 0,
      }),
    );
  });
});

describe("scheduleHistoryBackfill", () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
    vi.clearAllMocks();
    harness.pool.query.mockResolvedValue({
      rows: [],
    });
    harness.decryptAndLazyReencrypt.mockResolvedValue("mono-token");
  });

  it("does nothing when there are no accounts", () => {
    scheduleHistoryBackfill("user_1", [], {} as never);
    expect(harness.pool.query).not.toHaveBeenCalled();
  });

  it("loads the encrypted token row on the next tick", async () => {
    scheduleHistoryBackfill("user_1", ["acc1"], {} as never);
    await new Promise((resolve) => setImmediate(resolve));

    expect(harness.pool.query).toHaveBeenCalledWith(
      expect.stringContaining("SELECT token_ciphertext"),
      ["user_1"],
    );
  });

  it("runs the scheduled backfill when the encrypted token row exists", async () => {
    harness.pool.query
      .mockResolvedValueOnce({
        rows: [
          {
            token_ciphertext: "cipher",
            token_iv: "iv",
            token_tag: "tag",
            token_key_version: "v1",
          },
        ],
      })
      .mockResolvedValueOnce({ rows: [] });
    const fetchMock = vi
      .fn()
      .mockResolvedValue({ ok: true, json: async () => [] });
    vi.stubGlobal("fetch", fetchMock);

    scheduleHistoryBackfill("user_1", ["acc1"], {} as never);
    await new Promise((resolve) => setImmediate(resolve));
    await new Promise((resolve) => setImmediate(resolve));

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0]![0])).toContain(
      "/personal/statement/acc1/",
    );
    expect(harness.pool.query).toHaveBeenLastCalledWith(
      expect.stringContaining("UPDATE mono_connection"),
      ["user_1"],
    );
  });
});
