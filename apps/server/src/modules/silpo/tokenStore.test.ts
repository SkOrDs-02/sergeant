import { beforeEach, describe, expect, it, vi } from "vitest";
import { parseKeyRing } from "../../lib/keyRing.js";

const mocks = vi.hoisted(() => ({
  refreshTokens: vi.fn(),
}));

vi.mock("./oauth.js", () => ({
  refreshTokens: mocks.refreshTokens,
}));

import {
  callWithFreshAccessToken,
  markReauthRequired,
  persistTokens,
  readAndDecrypt,
  type QueryFn,
  type SilpoConnectionRow,
} from "./tokenStore.js";
import type { McpResult } from "./mcpClient.js";

const KEY_V1 = "1".repeat(64);
const KEY_V2 = "2".repeat(64);

function ringV1Only() {
  return parseKeyRing({
    keysCsv: `v1:${KEY_V1}`,
    currentVersion: "v1",
    envName: "SILPO_TOKEN_ENC_KEY",
  })!;
}
function ringV1AndV2() {
  return parseKeyRing({
    keysCsv: `v1:${KEY_V1},v2:${KEY_V2}`,
    currentVersion: "v2",
    envName: "SILPO_TOKEN_ENC_KEY",
  })!;
}

/** Minimal in-memory fake for `silpo_connection` — routes by SQL substring. */
function makeFakeDb(): {
  query: QueryFn;
  getRow: () => SilpoConnectionRow | null;
} {
  let row: SilpoConnectionRow | null = null;
  const query = (async (text: string, values: unknown[] = []) => {
    if (text.includes("SELECT") && text.includes("FROM silpo_connection")) {
      return { rows: row ? [row] : [], rowCount: row ? 1 : 0 };
    }
    if (text.includes("INSERT INTO silpo_connection")) {
      const [
        ,
        accessCt,
        accessIv,
        accessTag,
        refreshCt,
        refreshIv,
        refreshTag,
        keyVersion,
        expiresAt,
      ] = values as [
        string,
        Buffer,
        Buffer,
        Buffer,
        Buffer,
        Buffer,
        Buffer,
        number,
        Date | null,
      ];
      row = {
        access_token_ciphertext: accessCt,
        access_token_iv: accessIv,
        access_token_tag: accessTag,
        refresh_token_ciphertext: refreshCt,
        refresh_token_iv: refreshIv,
        refresh_token_tag: refreshTag,
        token_key_version: keyVersion,
        access_token_expires_at: expiresAt,
        status: "connected",
      };
      return { rows: [], rowCount: 1 };
    }
    if (text.includes("access_token_ciphertext = $2")) {
      // lazy re-encrypt UPDATE
      if (!row) return { rows: [], rowCount: 0 };
      const [
        ,
        accessCt,
        accessIv,
        accessTag,
        refreshCt,
        refreshIv,
        refreshTag,
        keyVersion,
        staleCt,
      ] = values as [
        string,
        Buffer,
        Buffer,
        Buffer,
        Buffer,
        Buffer,
        Buffer,
        number,
        Buffer,
      ];
      if (Buffer.compare(row.access_token_ciphertext, staleCt) !== 0) {
        return { rows: [], rowCount: 0 };
      }
      row = {
        ...row,
        access_token_ciphertext: accessCt,
        access_token_iv: accessIv,
        access_token_tag: accessTag,
        refresh_token_ciphertext: refreshCt,
        refresh_token_iv: refreshIv,
        refresh_token_tag: refreshTag,
        token_key_version: keyVersion,
      };
      return { rows: [], rowCount: 1 };
    }
    if (text.includes("status = 'reauth_required'")) {
      if (!row) return { rows: [], rowCount: 0 };
      row = { ...row, status: "reauth_required" };
      return { rows: [], rowCount: 1 };
    }
    throw new Error(`fake db: unhandled query: ${text}`);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  }) as any;
  return { query, getRow: () => row };
}

beforeEach(() => {
  mocks.refreshTokens.mockReset();
});

describe("persistTokens / readAndDecrypt — round trip", () => {
  it("round-trips both token triples under one key version", async () => {
    const db = makeFakeDb();
    const ring = ringV1Only();

    await persistTokens(
      "user-1",
      ring,
      {
        accessToken: "at-secret",
        refreshToken: "rt-secret",
        expiresAtMs: null,
      },
      db.query,
    );

    const row = db.getRow()!;
    expect(row.token_key_version).toBe(1);
    // Ciphertext must not equal the plaintext (sanity check we actually encrypted).
    expect(row.access_token_ciphertext.toString("utf8")).not.toContain(
      "at-secret",
    );

    const decrypted = await readAndDecrypt("user-1", ring, db.query);
    expect(decrypted).toMatchObject({
      accessToken: "at-secret",
      refreshToken: "rt-secret",
      status: "connected",
    });
  });

  it("returns null when the user has never connected", async () => {
    const db = makeFakeDb();
    const decrypted = await readAndDecrypt("nobody", ringV1Only(), db.query);
    expect(decrypted).toBeNull();
  });

  it("opportunistically re-encrypts both triples together on a version bump", async () => {
    const db = makeFakeDb();
    await persistTokens(
      "user-1",
      ringV1Only(),
      { accessToken: "at-1", refreshToken: "rt-1", expiresAtMs: null },
      db.query,
    );
    expect(db.getRow()!.token_key_version).toBe(1);

    const decrypted = await readAndDecrypt("user-1", ringV1AndV2(), db.query);

    expect(decrypted).toMatchObject({
      accessToken: "at-1",
      refreshToken: "rt-1",
    });
    expect(db.getRow()!.token_key_version).toBe(2);
  });
});

describe("markReauthRequired", () => {
  it("flips status without touching ciphertext", async () => {
    const db = makeFakeDb();
    await persistTokens(
      "user-1",
      ringV1Only(),
      { accessToken: "at-1", refreshToken: "rt-1", expiresAtMs: null },
      db.query,
    );
    await markReauthRequired("user-1", db.query);
    expect(db.getRow()!.status).toBe("reauth_required");
  });
});

describe("callWithFreshAccessToken", () => {
  function okResult<T>(data: T): McpResult<T> {
    return { ok: true, data };
  }
  function authRequired<T>(): McpResult<T> {
    return { ok: false, error: { kind: "auth_required", message: "401" } };
  }
  function rateLimited<T>(): McpResult<T> {
    return { ok: false, error: { kind: "rate_limited", message: "429" } };
  }

  it("returns not_connected without calling fn when there is no connection row", async () => {
    const db = makeFakeDb();
    const fn = vi.fn();

    const result = await callWithFreshAccessToken("user-1", fn, {
      ring: ringV1Only(),
      query: db.query,
    });

    expect(result).toEqual({
      ok: false,
      error: { kind: "not_connected", message: "Silpo is not connected" },
    });
    expect(fn).not.toHaveBeenCalled();
  });

  it("returns config_missing when no key ring is configured", async () => {
    const fn = vi.fn();
    const result = await callWithFreshAccessToken("user-1", fn, { ring: null });
    expect(result).toEqual({
      ok: false,
      error: {
        kind: "config_missing",
        message: "Silpo token encryption key is not configured",
      },
    });
    expect(fn).not.toHaveBeenCalled();
  });

  it("short-circuits on an already reauth_required connection", async () => {
    const db = makeFakeDb();
    await persistTokens(
      "user-1",
      ringV1Only(),
      { accessToken: "at-1", refreshToken: "rt-1", expiresAtMs: null },
      db.query,
    );
    await markReauthRequired("user-1", db.query);
    const fn = vi.fn();

    const result = await callWithFreshAccessToken("user-1", fn, {
      ring: ringV1Only(),
      query: db.query,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.kind).toBe("reauth_required");
    expect(fn).not.toHaveBeenCalled();
  });

  it("passes through a successful first call", async () => {
    const db = makeFakeDb();
    await persistTokens(
      "user-1",
      ringV1Only(),
      { accessToken: "at-1", refreshToken: "rt-1", expiresAtMs: null },
      db.query,
    );
    const fn = vi.fn().mockResolvedValue(okResult({ receipts: [] }));

    const result = await callWithFreshAccessToken("user-1", fn, {
      ring: ringV1Only(),
      query: db.query,
    });

    expect(result).toEqual({ ok: true, data: { receipts: [] } });
    expect(fn).toHaveBeenCalledWith("at-1");
    expect(fn).toHaveBeenCalledTimes(1);
    expect(mocks.refreshTokens).not.toHaveBeenCalled();
  });

  it("passes through non-auth errors without attempting a refresh", async () => {
    const db = makeFakeDb();
    await persistTokens(
      "user-1",
      ringV1Only(),
      { accessToken: "at-1", refreshToken: "rt-1", expiresAtMs: null },
      db.query,
    );
    const fn = vi.fn().mockResolvedValue(rateLimited());

    const result = await callWithFreshAccessToken("user-1", fn, {
      ring: ringV1Only(),
      query: db.query,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.kind).toBe("rate_limited");
    expect(mocks.refreshTokens).not.toHaveBeenCalled();
  });

  it("refreshes once on auth_required and retries with the new token", async () => {
    const db = makeFakeDb();
    await persistTokens(
      "user-1",
      ringV1Only(),
      { accessToken: "at-stale", refreshToken: "rt-1", expiresAtMs: null },
      db.query,
    );
    mocks.refreshTokens.mockResolvedValue({
      access_token: "at-fresh",
      refresh_token: "rt-2",
      expires_in: 3600,
    });
    const fn = vi
      .fn()
      .mockResolvedValueOnce(authRequired())
      .mockResolvedValueOnce(okResult({ receipts: [1] }));

    const result = await callWithFreshAccessToken("user-1", fn, {
      ring: ringV1Only(),
      query: db.query,
    });

    expect(result).toEqual({ ok: true, data: { receipts: [1] } });
    expect(fn).toHaveBeenNthCalledWith(1, "at-stale");
    expect(fn).toHaveBeenNthCalledWith(2, "at-fresh");
    expect(mocks.refreshTokens).toHaveBeenCalledWith("rt-1");

    const reread = await readAndDecrypt("user-1", ringV1Only(), db.query);
    expect(reread).toMatchObject({
      accessToken: "at-fresh",
      refreshToken: "rt-2",
    });
  });

  it("marks reauth_required after a second auth_required following refresh", async () => {
    const db = makeFakeDb();
    await persistTokens(
      "user-1",
      ringV1Only(),
      { accessToken: "at-stale", refreshToken: "rt-1", expiresAtMs: null },
      db.query,
    );
    mocks.refreshTokens.mockResolvedValue({ access_token: "at-fresh" });
    const fn = vi
      .fn()
      .mockResolvedValueOnce(authRequired())
      .mockResolvedValueOnce(authRequired());

    const result = await callWithFreshAccessToken("user-1", fn, {
      ring: ringV1Only(),
      query: db.query,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.kind).toBe("reauth_required");
    expect(fn).toHaveBeenCalledTimes(2);
    expect(db.getRow()!.status).toBe("reauth_required");
  });

  it("marks reauth_required when the refresh HTTP call itself throws", async () => {
    const db = makeFakeDb();
    await persistTokens(
      "user-1",
      ringV1Only(),
      { accessToken: "at-stale", refreshToken: "rt-1", expiresAtMs: null },
      db.query,
    );
    mocks.refreshTokens.mockRejectedValue(new Error("invalid_grant"));
    const fn = vi.fn().mockResolvedValueOnce(authRequired());

    const result = await callWithFreshAccessToken("user-1", fn, {
      ring: ringV1Only(),
      query: db.query,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.kind).toBe("reauth_required");
    expect(fn).toHaveBeenCalledTimes(1);
    expect(db.getRow()!.status).toBe("reauth_required");
  });
});
