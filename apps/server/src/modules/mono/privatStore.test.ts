import { describe, it, expect, beforeEach, vi } from "vitest";
import type { Mock } from "vitest";

// ── Mocks ────────────────────────────────────────────────────
// Same shape as connection.test.ts: mock the DB pool and the env module,
// but keep the real crypto.ts / tokenStore.ts logic so encrypt→decrypt is
// exercised end-to-end, not stubbed away.

vi.mock("../../db.js", () => ({
  query: vi.fn(),
}));

const { mockEnv } = vi.hoisted(() => ({
  mockEnv: {
    MONO_TOKEN_ENC_KEY:
      "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
    MONO_TOKEN_ENC_KEYS: undefined as string | undefined,
    MONO_TOKEN_ENC_KEY_CURRENT_VERSION: undefined as string | undefined,
  },
}));

vi.mock("../../env/env.js", () => ({
  env: new Proxy(
    {},
    {
      get(_target, prop) {
        return (mockEnv as Record<string | symbol, unknown>)[prop];
      },
    },
  ),
}));

import { query as _query } from "../../db.js";
import {
  savePrivatCredentials,
  loadPrivatCredentials,
  deletePrivatCredentials,
  getPrivatStatus,
} from "./privatStore.js";

const dbQuery = _query as unknown as Mock;

beforeEach(() => {
  vi.clearAllMocks();
  mockEnv.MONO_TOKEN_ENC_KEY =
    "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
  mockEnv.MONO_TOKEN_ENC_KEYS = undefined;
  mockEnv.MONO_TOKEN_ENC_KEY_CURRENT_VERSION = undefined;
});

describe("savePrivatCredentials", () => {
  it("encrypts the token and upserts into privat_connection", async () => {
    dbQuery.mockResolvedValueOnce({ rows: [], rowCount: 1 });

    await savePrivatCredentials("user_1", {
      merchantId: "merchant_1",
      token: "raw-merchant-token",
    });

    expect(dbQuery).toHaveBeenCalledTimes(1);
    const [sql, params] = dbQuery.mock.calls[0]!;
    expect(String(sql)).toContain("INSERT INTO privat_connection");
    expect(String(sql)).toContain("ON CONFLICT (user_id) DO UPDATE");
    expect(params[0]).toBe("user_1");
    expect(params[1]).toBe("merchant_1");
    // Ciphertext/iv/tag are Buffers, never the raw plaintext token.
    expect(Buffer.isBuffer(params[2])).toBe(true);
    expect(String(params[2])).not.toContain("raw-merchant-token");
  });

  it("throws when no encryption key is configured", async () => {
    mockEnv.MONO_TOKEN_ENC_KEY = undefined as unknown as string;
    await expect(
      savePrivatCredentials("user_1", {
        merchantId: "m",
        token: "t",
      }),
    ).rejects.toThrow(/encryption key/i);
    expect(dbQuery).not.toHaveBeenCalled();
  });
});

describe("loadPrivatCredentials", () => {
  it("returns null when the user has no PrivatBank connection", async () => {
    dbQuery.mockResolvedValueOnce({ rows: [] });
    const result = await loadPrivatCredentials("user_1");
    expect(result).toBeNull();
  });

  it("decrypts and returns the stored credentials (round-trips through save)", async () => {
    // Encrypt via the real save path first so the row shape matches what
    // the DB would actually contain.
    let savedRow: {
      token_ciphertext: Buffer;
      token_iv: Buffer;
      token_tag: Buffer;
      token_key_version: number | null;
    } | null = null;
    dbQuery.mockImplementationOnce(async (_sql: string, params: unknown[]) => {
      savedRow = {
        merchant_id: params[1],
        token_ciphertext: params[2],
        token_iv: params[3],
        token_tag: params[4],
        token_key_version: params[5],
      } as never;
      return { rows: [], rowCount: 1 };
    });
    await savePrivatCredentials("user_1", {
      merchantId: "merchant_1",
      token: "round-trip-token",
    });

    dbQuery.mockResolvedValueOnce({ rows: [savedRow] });
    const result = await loadPrivatCredentials("user_1");
    expect(result).toEqual({
      merchantId: "merchant_1",
      token: "round-trip-token",
    });
  });

  it("throws when no encryption key is configured", async () => {
    mockEnv.MONO_TOKEN_ENC_KEY = undefined as unknown as string;
    await expect(loadPrivatCredentials("user_1")).rejects.toThrow(
      /encryption key/i,
    );
    expect(dbQuery).not.toHaveBeenCalled();
  });
});

describe("deletePrivatCredentials", () => {
  it("deletes the connection row and is idempotent", async () => {
    dbQuery.mockResolvedValue({ rows: [], rowCount: 0 });
    await deletePrivatCredentials("user_1");
    expect(dbQuery).toHaveBeenCalledTimes(1);
    const [sql, params] = dbQuery.mock.calls[0]!;
    expect(String(sql)).toContain("DELETE FROM privat_connection");
    expect(params).toEqual(["user_1"]);
  });
});

describe("getPrivatStatus", () => {
  it("returns disconnected when no row exists", async () => {
    dbQuery.mockResolvedValueOnce({ rows: [] });
    const status = await getPrivatStatus("user_1");
    expect(status).toEqual({ connected: false, merchantId: null });
  });

  it("returns connected with merchantId when a row exists", async () => {
    dbQuery.mockResolvedValueOnce({ rows: [{ merchant_id: "merchant_1" }] });
    const status = await getPrivatStatus("user_1");
    expect(status).toEqual({ connected: true, merchantId: "merchant_1" });
  });
});
