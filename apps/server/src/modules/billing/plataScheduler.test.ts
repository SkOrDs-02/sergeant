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
import { chargeDuePlataSubscriptions } from "./plataScheduler.js";

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
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return { pool: { query } as any, calls };
}

beforeEach(() => {
  process.env["MONO_TOKEN_ENC_KEY"] = ENC_KEY;
});
afterEach(() => {
  vi.restoreAllMocks();
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

  it("no-ops when nothing is due", async () => {
    vi.stubGlobal("fetch", vi.fn());
    const { pool } = mockPool([]);
    const result = await chargeDuePlataSubscriptions(pool);
    expect(result).toEqual({ processed: 0, charged: 0, pastDue: 0 });
    expect(fetch).not.toHaveBeenCalled();
  });
});
