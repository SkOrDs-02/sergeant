import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Mock } from "vitest";

const mocks = vi.hoisted(() => ({
  loggerWarn: vi.fn(),
  recordExternalHttp: vi.fn(),
}));

vi.mock("../../obs/logger.js", () => ({
  logger: { warn: mocks.loggerWarn, info: vi.fn(), error: vi.fn() },
}));

vi.mock("../../lib/externalHttp.js", () => ({
  recordExternalHttp: mocks.recordExternalHttp,
}));

vi.mock("../../env/env.js", () => ({
  env: {
    SILPO_MCP_URL: "https://mcp.silpo.ua/mcp",
    SILPO_OAUTH_CLIENT_ID: "test-client-id",
  },
}));

import {
  buildAuthorizationUrl,
  consumeAuthorizationState,
  discoverOAuthMetadata,
  exchangeCode,
  generatePkcePair,
  refreshTokens,
  __silpoOAuthTestHooks,
} from "./oauth.js";

const METADATA = {
  authorization_endpoint: "https://auth.silpo.ua/authorize",
  token_endpoint: "https://auth.silpo.ua/token",
  registration_endpoint: "https://auth.silpo.ua/register",
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function fetchMock(): Mock {
  const mock = vi.fn();
  vi.stubGlobal("fetch", mock);
  return mock as Mock;
}

/**
 * In-memory stand-in for the `silpo_oauth_state` table — routes by SQL
 * substring, honours the TTL filter the real statements carry.
 */
function makeStateDb(clock: { now: number }) {
  const rows = new Map<
    string,
    {
      user_id: string;
      code_verifier: string;
      redirect_uri: string;
      created_at: number;
    }
  >();
  const query = (async (text: string, values: unknown[] = []) => {
    if (text.includes("INSERT INTO silpo_oauth_state")) {
      const [state, userId, verifier, redirectUri] = values as string[];
      rows.set(state!, {
        user_id: userId!,
        code_verifier: verifier!,
        redirect_uri: redirectUri!,
        created_at: clock.now,
      });
      return { rows: [], rowCount: 1 };
    }
    if (text.includes("RETURNING")) {
      const [state, ttlMs] = values as [string, number];
      const row = rows.get(state);
      // Протухлий рядок НЕ повертається (і не згорає) — так само, як у SQL,
      // де TTL стоїть у WHERE.
      if (!row || clock.now - row.created_at > ttlMs) {
        return { rows: [], rowCount: 0 };
      }
      rows.delete(state);
      return { rows: [row], rowCount: 1 };
    }
    if (text.includes("DELETE FROM silpo_oauth_state")) {
      const [ttlMs] = values as [number];
      for (const [key, row] of rows) {
        if (clock.now - row.created_at > ttlMs) rows.delete(key);
      }
      return { rows: [], rowCount: 0 };
    }
    throw new Error(`fake db: unhandled query: ${text}`);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  }) as any;
  return { query, size: () => rows.size };
}

beforeEach(() => {
  mocks.recordExternalHttp.mockReset();
  mocks.loggerWarn.mockReset();
  __silpoOAuthTestHooks().clearMetadataCache();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("generatePkcePair", () => {
  it("derives code_challenge as base64url(SHA-256(code_verifier))", async () => {
    const crypto = await import("node:crypto");
    const { codeVerifier, codeChallenge } = generatePkcePair();

    expect(codeVerifier).toMatch(/^[A-Za-z0-9_-]{43}$/);
    const expected = crypto
      .createHash("sha256")
      .update(codeVerifier)
      .digest("base64")
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "");
    expect(codeChallenge).toBe(expected);
  });

  it("generates a fresh pair on every call", () => {
    const a = generatePkcePair();
    const b = generatePkcePair();
    expect(a.codeVerifier).not.toBe(b.codeVerifier);
  });
});

describe("discoverOAuthMetadata", () => {
  it("fetches and caches the well-known metadata document", async () => {
    const mock = fetchMock();
    mock.mockResolvedValueOnce(jsonResponse(METADATA));

    const first = await discoverOAuthMetadata();
    const second = await discoverOAuthMetadata();

    expect(first).toEqual(METADATA);
    expect(second).toEqual(METADATA);
    expect(mock).toHaveBeenCalledTimes(1); // second call served from cache
    expect(mock).toHaveBeenCalledWith(
      "https://mcp.silpo.ua/.well-known/oauth-authorization-server",
      expect.anything(),
    );
  });
});

describe("buildAuthorizationUrl / consumeAuthorizationState", () => {
  it("builds a PKCE S256 authorize URL and stores state → verifier for one-time consumption", async () => {
    const mock = fetchMock();
    mock.mockResolvedValueOnce(jsonResponse(METADATA));
    const clock = { now: 1_700_000_000_000 };
    const db = makeStateDb(clock);

    const { url, state } = await buildAuthorizationUrl({
      userId: "user-1",
      redirectUri: "https://api.example.com/api/silpo/callback",
      query: db.query,
    });

    const parsed = new URL(url);
    expect(parsed.origin + parsed.pathname).toBe(
      METADATA.authorization_endpoint,
    );
    expect(parsed.searchParams.get("response_type")).toBe("code");
    expect(parsed.searchParams.get("client_id")).toBe("test-client-id");
    expect(parsed.searchParams.get("code_challenge_method")).toBe("S256");
    expect(parsed.searchParams.get("state")).toBe(state);
    expect(parsed.searchParams.get("code_challenge")).toBeTruthy();

    const consumed = await consumeAuthorizationState(state, db.query);
    expect(consumed).toMatchObject({
      userId: "user-1",
      redirectUri: "https://api.example.com/api/silpo/callback",
    });
    expect(consumed?.codeVerifier).toBeTruthy();

    // One-time use: consuming again returns null.
    expect(await consumeAuthorizationState(state, db.query)).toBeNull();
  });

  it("returns null for an unknown state", async () => {
    const db = makeStateDb({ now: 1_700_000_000_000 });
    expect(
      await consumeAuthorizationState("never-issued", db.query),
    ).toBeNull();
  });

  it("refuses a state older than the TTL", async () => {
    const mock = fetchMock();
    mock.mockResolvedValueOnce(jsonResponse(METADATA));
    const clock = { now: 1_700_000_000_000 };
    const db = makeStateDb(clock);

    const { state } = await buildAuthorizationUrl({
      userId: "user-1",
      redirectUri: "https://api.example.com/api/silpo/callback",
      query: db.query,
    });

    clock.now += 11 * 60 * 1000; // TTL — 10 хвилин
    expect(await consumeAuthorizationState(state, db.query)).toBeNull();
  });

  it("survives a process restart — the state lives in PG, not in memory", async () => {
    // Регресія: доки мапа була в памʼяті процесу, будь-який редеплой у
    // 10-хвилинне вікно авторизації повертав людину в `invalid_state`.
    const mock = fetchMock();
    mock.mockResolvedValueOnce(jsonResponse(METADATA));
    const clock = { now: 1_700_000_000_000 };
    const db = makeStateDb(clock);

    const { state } = await buildAuthorizationUrl({
      userId: "user-1",
      redirectUri: "https://api.example.com/api/silpo/callback",
      query: db.query,
    });

    // Новий інстанс модуля = новий процес: увесь in-process стан втрачено.
    vi.resetModules();
    const restarted = await import("./oauth.js");

    const consumed = await restarted.consumeAuthorizationState(state, db.query);
    expect(consumed).toMatchObject({ userId: "user-1" });
  });

  it("sweeps expired rows when a new authorization starts", async () => {
    const mock = fetchMock();
    mock.mockResolvedValue(jsonResponse(METADATA));
    const clock = { now: 1_700_000_000_000 };
    const db = makeStateDb(clock);

    await buildAuthorizationUrl({
      userId: "user-1",
      redirectUri: "https://api.example.com/api/silpo/callback",
      query: db.query,
    });
    expect(db.size()).toBe(1);

    clock.now += 11 * 60 * 1000;
    await buildAuthorizationUrl({
      userId: "user-1",
      redirectUri: "https://api.example.com/api/silpo/callback",
      query: db.query,
    });

    expect(db.size()).toBe(1); // протухлий підметено, лишився новий
  });
});
describe("exchangeCode", () => {
  it("posts the PKCE grant and parses the token response", async () => {
    const mock = fetchMock();
    mock.mockResolvedValueOnce(jsonResponse(METADATA)).mockResolvedValueOnce(
      jsonResponse({
        access_token: "at-1",
        refresh_token: "rt-1",
        expires_in: 3600,
        token_type: "Bearer",
      }),
    );

    const tokens = await exchangeCode({
      code: "auth-code",
      codeVerifier: "verifier-123",
      redirectUri: "https://api.example.com/api/silpo/callback",
    });

    expect(tokens).toMatchObject({
      access_token: "at-1",
      refresh_token: "rt-1",
    });
    const [, tokenInit] = mock.mock.calls[1] as [string, RequestInit];
    const sentBody = new URLSearchParams(tokenInit.body as string);
    expect(sentBody.get("grant_type")).toBe("authorization_code");
    expect(sentBody.get("code_verifier")).toBe("verifier-123");
    expect(sentBody.get("client_id")).toBe("test-client-id");
  });

  it("throws (never silently swallows) on a non-2xx token response", async () => {
    const mock = fetchMock();
    mock
      .mockResolvedValueOnce(jsonResponse(METADATA))
      .mockResolvedValueOnce(new Response("invalid_grant", { status: 400 }));

    await expect(
      exchangeCode({
        code: "bad-code",
        codeVerifier: "verifier-123",
        redirectUri: "https://api.example.com/api/silpo/callback",
      }),
    ).rejects.toThrow(/HTTP 400/);
  });
});

describe("refreshTokens", () => {
  it("posts grant_type=refresh_token", async () => {
    const mock = fetchMock();
    mock
      .mockResolvedValueOnce(jsonResponse(METADATA))
      .mockResolvedValueOnce(
        jsonResponse({ access_token: "at-2", expires_in: 3600 }),
      );

    const tokens = await refreshTokens("rt-1");

    expect(tokens).toMatchObject({ access_token: "at-2" });
    const [, tokenInit] = mock.mock.calls[1] as [string, RequestInit];
    const sentBody = new URLSearchParams(tokenInit.body as string);
    expect(sentBody.get("grant_type")).toBe("refresh_token");
    expect(sentBody.get("refresh_token")).toBe("rt-1");
  });
});
