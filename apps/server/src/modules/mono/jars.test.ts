import { describe, it, expect, beforeEach, vi } from "vitest";
import type { Mock } from "vitest";

vi.mock("../../db.js", () => ({
  query: vi.fn(),
}));

vi.mock("../../obs/logger.js", () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
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

const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

import { query as _query } from "../../db.js";
import { upsertJars, refreshJarsFromMono } from "./jars.js";
import { encryptToken } from "./crypto.js";

const dbQuery = _query as unknown as Mock;

beforeEach(() => {
  vi.clearAllMocks();
  mockEnv.MONO_TOKEN_ENC_KEY =
    "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
});

describe("upsertJars", () => {
  it("upserts every jar with defaults for optional fields", async () => {
    dbQuery.mockResolvedValue({ rows: [], rowCount: 1 });

    await upsertJars("user_1", [
      { id: "jar_1", title: "На відпустку", currencyCode: 980, balance: 5000 },
    ]);

    expect(dbQuery).toHaveBeenCalledTimes(1);
    const [sql, params] = dbQuery.mock.calls[0]!;
    expect(String(sql)).toContain("INSERT INTO mono_jar");
    expect(String(sql)).toContain(
      "ON CONFLICT (user_id, mono_jar_id) DO UPDATE",
    );
    expect(params).toEqual([
      "user_1",
      "jar_1",
      null, // sendId defaults to null
      "На відпустку",
      null, // description defaults to null
      980,
      5000,
      null, // goal defaults to null
    ]);
  });

  it("is a no-op for an empty jars array", async () => {
    await upsertJars("user_1", []);
    expect(dbQuery).not.toHaveBeenCalled();
  });

  it("upserts multiple jars, one query per jar", async () => {
    dbQuery.mockResolvedValue({ rows: [], rowCount: 1 });
    await upsertJars("user_1", [
      { id: "jar_1", currencyCode: 980 },
      { id: "jar_2", currencyCode: 840 },
    ]);
    expect(dbQuery).toHaveBeenCalledTimes(2);
  });
});

describe("refreshJarsFromMono", () => {
  it("no-ops when the encryption key is not configured", async () => {
    mockEnv.MONO_TOKEN_ENC_KEY = undefined as unknown as string;
    await refreshJarsFromMono("user_1");
    expect(dbQuery).not.toHaveBeenCalled();
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("no-ops when the user has no active mono_connection row", async () => {
    dbQuery.mockResolvedValueOnce({ rows: [] });
    await refreshJarsFromMono("user_1");
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("refreshes jars from a successful client-info call", async () => {
    const enc = encryptToken("mono-token-abc", mockEnv.MONO_TOKEN_ENC_KEY);
    dbQuery.mockResolvedValueOnce({
      rows: [
        {
          token_ciphertext: enc.ciphertext,
          token_iv: enc.iv,
          token_tag: enc.tag,
          token_key_version: null,
        },
      ],
    });
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        jars: [{ id: "jar_1", currencyCode: 980, balance: 1000 }],
      }),
    });
    dbQuery.mockResolvedValueOnce({ rows: [], rowCount: 1 });

    await refreshJarsFromMono("user_1");

    expect(mockFetch).toHaveBeenCalledWith(
      "https://api.monobank.ua/personal/client-info",
      expect.objectContaining({ headers: { "X-Token": "mono-token-abc" } }),
    );
    // 1 connection SELECT + 1 jar upsert
    expect(dbQuery).toHaveBeenCalledTimes(2);
    const upsertCall = dbQuery.mock.calls[1]!;
    expect(String(upsertCall[0])).toContain("INSERT INTO mono_jar");
  });

  it("swallows an upstream error without throwing", async () => {
    const enc = encryptToken("mono-token-abc", mockEnv.MONO_TOKEN_ENC_KEY);
    dbQuery.mockResolvedValueOnce({
      rows: [
        {
          token_ciphertext: enc.ciphertext,
          token_iv: enc.iv,
          token_tag: enc.tag,
          token_key_version: null,
        },
      ],
    });
    mockFetch.mockResolvedValueOnce({ ok: false, status: 500 });

    await expect(refreshJarsFromMono("user_1")).resolves.toBeUndefined();
    // No jar-upsert call beyond the initial connection SELECT.
    expect(dbQuery).toHaveBeenCalledTimes(1);
  });

  it("swallows a thrown fetch error without throwing", async () => {
    const enc = encryptToken("mono-token-abc", mockEnv.MONO_TOKEN_ENC_KEY);
    dbQuery.mockResolvedValueOnce({
      rows: [
        {
          token_ciphertext: enc.ciphertext,
          token_iv: enc.iv,
          token_tag: enc.tag,
          token_key_version: null,
        },
      ],
    });
    mockFetch.mockRejectedValueOnce(new Error("network error"));

    await expect(refreshJarsFromMono("user_1")).resolves.toBeUndefined();
  });
});
