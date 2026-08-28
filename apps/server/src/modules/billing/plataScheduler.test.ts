import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Мокаємо env, щоб chargeByToken мав PLATA_TOKEN і суму (env парситься на
// import — process.env post-import не допоможе).
vi.mock("../../env/env.js", () => ({
  env: {
    PLATA_TOKEN: "test-merchant-token",
    PLATA_ENABLED: true,
    PRO_MONTHLY_UAH_KOPIYKAS: 19900,
  },
}));

import { encryptToken } from "../mono/crypto.js";
import {
  chargeDuePlataSubscriptions,
  PlataRecurringPoller,
} from "./plataScheduler.js";

const ENC_KEY = "b".repeat(64);

function dueRow(userId: string, token: string) {
  const enc = encryptToken(token, ENC_KEY);
  return {
    user_id: userId,
    wallet_id: "wal_1",
    card_token_ciphertext: enc.ciphertext,
    card_token_iv: enc.iv,
    card_token_tag: enc.tag,
  };
}

function mockPool(dueRows: ReturnType<typeof dueRow>[]) {
  const calls: { sql: string; params: unknown[] | undefined }[] = [];
  const query = vi.fn(async (sql: string, params?: unknown[]) => {
    calls.push({ sql, params });
    if (sql.includes("JOIN plata_card_token")) {
      return { rowCount: dueRows.length, rows: dueRows };
    }
    return { rowCount: 1, rows: [] };
  });
  // Claim-транзакція йде через виділеного клієнта (`pool.connect()`), як у
  // gdpr cleanupWorker — mock ділить той самий `query`, щоб assert-и по
  // `calls` бачили і BEGIN/COMMIT, і SELECT/UPDATE.
  const release = vi.fn();
  const connect = vi.fn(async () => ({ query, release }));
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return { pool: { query, connect } as any, calls, connect, release };
}

beforeEach(() => {
  process.env["MONO_TOKEN_ENC_KEY"] = ENC_KEY;
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("chargeDuePlataSubscriptions", () => {
  it("shifts the period on a successful token charge", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ status: "success" }))),
    );
    const { pool, calls } = mockPool([dueRow("usr_1", "tok_1")]);

    const result = await chargeDuePlataSubscriptions(pool);

    expect(result).toEqual({ processed: 1, charged: 1, pastDue: 0 });
    const shift = calls.find((c) =>
      c.sql.includes("current_period_end + INTERVAL '1 month'"),
    );
    expect(shift).toBeDefined();
  });

  it("marks past_due when the charge is declined", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("nope", { status: 402 })),
    );
    const { pool, calls } = mockPool([dueRow("usr_2", "tok_2")]);

    const result = await chargeDuePlataSubscriptions(pool);

    expect(result).toEqual({ processed: 1, charged: 0, pastDue: 1 });
    expect(calls.some((c) => c.sql.includes("past_due"))).toBe(true);
  });

  it("marks past_due when Monopay accepts the request but does not return success", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ status: "created" }))),
    );
    const { pool, calls } = mockPool([dueRow("usr_pending", "tok_pending")]);

    const result = await chargeDuePlataSubscriptions(pool);

    expect(result).toEqual({ processed: 1, charged: 0, pastDue: 1 });
    expect(calls.some((c) => c.sql.includes("past_due"))).toBe(true);
  });

  it("marks past_due and skips fetch when the stored card token cannot be decrypted", async () => {
    const fetchImpl = vi.fn();
    vi.stubGlobal("fetch", fetchImpl);
    const { pool, calls } = mockPool([
      {
        user_id: "usr_corrupt",
        wallet_id: "wal_corrupt",
        card_token_ciphertext: Buffer.from("not-ciphertext"),
        card_token_iv: Buffer.from("bad-iv"),
        card_token_tag: Buffer.from("bad-tag"),
      },
    ]);

    const result = await chargeDuePlataSubscriptions(pool);

    expect(result).toEqual({ processed: 1, charged: 0, pastDue: 1 });
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(calls.some((c) => c.sql.includes("past_due"))).toBe(true);
  });

  it("rejects before charging when the token encryption key is missing", async () => {
    delete process.env["MONO_TOKEN_ENC_KEY"];
    const fetchImpl = vi.fn();
    vi.stubGlobal("fetch", fetchImpl);
    const { pool, connect } = mockPool([
      dueRow("usr_missing_key", "tok_missing_key"),
    ]);

    await expect(chargeDuePlataSubscriptions(pool)).rejects.toThrow(
      /MONO_TOKEN_ENC_KEY/,
    );
    expect(fetchImpl).not.toHaveBeenCalled();
    // Конфіг-фейл валідовано ДО відкриття транзакції — жодного row-lock-у.
    expect(connect).not.toHaveBeenCalled();
  });

  it("claims due rows with FOR UPDATE SKIP LOCKED inside one BEGIN…COMMIT (no double-charge)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ status: "success" }))),
    );
    const { pool, calls, release } = mockPool([dueRow("usr_lock", "tok_lock")]);

    await chargeDuePlataSubscriptions(pool);

    const sqls = calls.map((c) => c.sql);
    expect(sqls[0]).toBe("BEGIN");
    expect(sqls[sqls.length - 1]).toBe("COMMIT");
    const select = sqls.find((s) => s.includes("JOIN plata_card_token"));
    expect(select).toMatch(/FOR UPDATE OF s SKIP LOCKED/);
    // Charge-UPDATE відбувається МІЖ BEGIN і COMMIT (та сама транзакція).
    const shiftIdx = sqls.findIndex((s) =>
      s.includes("current_period_end + INTERVAL '1 month'"),
    );
    expect(shiftIdx).toBeGreaterThan(0);
    expect(shiftIdx).toBeLessThan(sqls.length - 1);
    expect(release).toHaveBeenCalledTimes(1);
  });

  it("rolls back and releases the client when the claim transaction fails", async () => {
    vi.stubGlobal("fetch", vi.fn());
    const calls: string[] = [];
    const query = vi.fn(async (sql: string) => {
      calls.push(sql);
      if (sql.includes("JOIN plata_card_token")) {
        throw new Error("connection reset");
      }
      return { rowCount: 0, rows: [] };
    });
    const release = vi.fn();
    const pool = {
      query,
      connect: vi.fn(async () => ({ query, release })),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any;

    await expect(chargeDuePlataSubscriptions(pool)).rejects.toThrow(
      /connection reset/,
    );
    expect(calls).toContain("ROLLBACK");
    expect(calls).not.toContain("COMMIT");
    expect(release).toHaveBeenCalledTimes(1);
  });

  it("no-ops when nothing is due", async () => {
    vi.stubGlobal("fetch", vi.fn());
    const { pool } = mockPool([]);
    const result = await chargeDuePlataSubscriptions(pool);
    expect(result).toEqual({ processed: 0, charged: 0, pastDue: 0 });
    expect(fetch).not.toHaveBeenCalled();
  });
});

describe("PlataRecurringPoller", () => {
  it("start() is a no-op when disabled or interval is zero", async () => {
    const disabled = mockPool([]);
    new PlataRecurringPoller({
      pool: disabled.pool,
      enabled: false,
      intervalMs: 1,
    }).start();
    expect(disabled.calls).toEqual([]);

    const intervalOff = mockPool([]);
    new PlataRecurringPoller({
      pool: intervalOff.pool,
      enabled: true,
      intervalMs: 0,
    }).start();
    expect(intervalOff.calls).toEqual([]);
  });

  it("runOnce returns zeros while another charge pass is in progress", async () => {
    let releaseSelect:
      | ((value: {
          rowCount: number;
          rows: ReturnType<typeof dueRow>[];
        }) => void)
      | undefined;
    const query = vi.fn(async (sql: string) => {
      if (sql.includes("JOIN plata_card_token")) {
        return await new Promise<{
          rowCount: number;
          rows: ReturnType<typeof dueRow>[];
        }>((resolve) => {
          releaseSelect = resolve;
        });
      }
      return { rowCount: 1, rows: [] };
    });
    const poller = new PlataRecurringPoller({
      pool: {
        query,
        connect: async () => ({ query, release: vi.fn() }),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any,
      enabled: true,
      intervalMs: 1,
    });

    const firstRun = poller.runOnce();
    await vi.waitFor(() => expect(releaseSelect).toBeDefined());

    await expect(poller.runOnce()).resolves.toEqual({
      processed: 0,
      charged: 0,
      pastDue: 0,
    });

    releaseSelect?.({ rowCount: 0, rows: [] });
    await expect(firstRun).resolves.toEqual({
      processed: 0,
      charged: 0,
      pastDue: 0,
    });
  });

  it("runOnce returns zeros while stopping is set", async () => {
    const { pool, calls } = mockPool([]);
    const poller = new PlataRecurringPoller({
      pool,
      enabled: true,
      intervalMs: 1,
    });
    (poller as unknown as { stopping: boolean }).stopping = true;

    await expect(poller.runOnce()).resolves.toEqual({
      processed: 0,
      charged: 0,
      pastDue: 0,
    });
    expect(calls).toEqual([]);
  });
});
