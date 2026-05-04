import { describe, it, expect, beforeEach, vi } from "vitest";
import type { Mock } from "vitest";

vi.mock("../../obs/logger.js", () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

const { captureMessageMock, captureExceptionMock } = vi.hoisted(() => ({
  captureMessageMock: vi.fn(),
  captureExceptionMock: vi.fn(),
}));
vi.mock("../../sentry.js", () => ({
  Sentry: {
    captureMessage: captureMessageMock,
    captureException: captureExceptionMock,
  },
}));

import { encryptToken } from "./crypto.js";
import {
  rotateMonoWebhookSecret,
  rotateStaleMonoWebhookSecrets,
} from "./rotateSecret.js";

// gitleaks:allow — fixed test fixture, not a real key (matches connection.test.ts).
const ENC_KEY =
  "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
const PUBLIC_API_BASE_URL = "https://api.example.com";

interface QueryRow {
  rows: Record<string, unknown>[];
  rowCount?: number | null;
}

// Matches the generic shape of `RotateOneInput["query"]` in
// `rotateSecret.ts`. We keep the generic parameter on the call signature
// (rather than fixing it to a concrete row type) so the mock can be
// passed straight into `rotateMonoWebhookSecret({ query: fn, ... })`
// without a per-call cast — see the `<R>` parameter on the production
// signature. Vitest 4 tightened `Mock<T>` to require a concrete `T`, so
// we declare the call signature explicitly and cast the spy through it.
type QueryFn = <R extends Record<string, unknown> = Record<string, unknown>>(
  sql: string,
  values?: unknown[],
  meta?: { op?: string },
) => Promise<{ rows: R[]; rowCount?: number | null }>;

type QueryMock = QueryFn & {
  /** All calls in order, for assertions on SQL/op routing. */
  callsOrdered: Array<{ sql: string; values?: unknown[]; op?: string }>;
} & Pick<Mock, "mockClear" | "mockReset" | "mockRestore" | "mock">;

function makeQueryMock(
  responses: Array<QueryRow | (() => QueryRow)>,
): QueryMock {
  const calls: Array<{ sql: string; values?: unknown[]; op?: string }> = [];
  let i = 0;
  const impl = async (
    sql: string,
    values?: unknown[],
    meta?: { op?: string },
  ): Promise<QueryRow> => {
    calls.push({ sql, values, op: meta?.op });
    const next = responses[i++];
    if (!next) {
      throw new Error(`Unexpected DB call #${i} (op=${meta?.op}): ${sql}`);
    }
    return typeof next === "function" ? next() : next;
  };
  const fn = vi.fn(impl) as unknown as QueryMock;
  fn.callsOrdered = calls;
  return fn;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("rotateMonoWebhookSecret (one connection)", () => {
  it("rotates: re-registers webhook with new secret and updates DB row", async () => {
    const enc = encryptToken("user_personal_token", ENC_KEY);
    const query = makeQueryMock([
      {
        rows: [
          {
            token_ciphertext: enc.ciphertext,
            token_iv: enc.iv,
            token_tag: enc.tag,
          },
        ],
      },
      { rows: [], rowCount: 1 },
    ]);

    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, status: 200, text: async () => "" });

    const result = await rotateMonoWebhookSecret({
      userId: "user_1",
      encKey: ENC_KEY,
      publicApiBaseUrl: PUBLIC_API_BASE_URL,
      fetchImpl: fetchMock as unknown as typeof fetch,
      query,
    });

    expect(result.rotated).toBe(true);
    expect(result.userId).toBe("user_1");

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://api.monobank.ua/personal/webhook");
    const body = JSON.parse(init.body as string);
    expect(body.webHookUrl).toMatch(
      /^https:\/\/api\.example\.com\/api\/mono\/webhook\/[0-9a-f]{64}$/,
    );
    expect(init.headers["X-Token"]).toBe("user_personal_token");

    // Two DB calls: SELECT ciphertext, then UPDATE.
    expect(query).toHaveBeenCalledTimes(2);
    expect(query.callsOrdered[0].op).toBe("mono_rotate_select");
    expect(query.callsOrdered[1].op).toBe("mono_rotate_update");

    // UPDATE values: [userId, newSecret, newSecretHash]
    const updateValues = query.callsOrdered[1].values as [
      string,
      string,
      string,
    ];
    expect(updateValues[0]).toBe("user_1");
    expect(updateValues[1]).toMatch(/^[0-9a-f]{64}$/);
    expect(updateValues[2]).toMatch(/^[0-9a-f]{64}$/);
    expect(updateValues[1]).not.toBe(updateValues[2]);
  });

  it("returns not_found when no active connection for user", async () => {
    const query = makeQueryMock([{ rows: [] }]);
    const fetchMock = vi.fn();

    const result = await rotateMonoWebhookSecret({
      userId: "missing_user",
      encKey: ENC_KEY,
      publicApiBaseUrl: PUBLIC_API_BASE_URL,
      fetchImpl: fetchMock as unknown as typeof fetch,
      query,
    });

    expect(result.rotated).toBe(false);
    expect(result.reason).toBe("not_found");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("returns decrypt_failed on tampered/wrong-key ciphertext", async () => {
    const enc = encryptToken("user_personal_token", ENC_KEY);
    // Tamper with the auth tag — decrypt MUST throw.
    const corruptTag = Buffer.from(enc.tag);
    corruptTag[0] = corruptTag[0] ^ 0xff;
    const query = makeQueryMock([
      {
        rows: [
          {
            token_ciphertext: enc.ciphertext,
            token_iv: enc.iv,
            token_tag: corruptTag,
          },
        ],
      },
    ]);
    const fetchMock = vi.fn();

    const result = await rotateMonoWebhookSecret({
      userId: "user_1",
      encKey: ENC_KEY,
      publicApiBaseUrl: PUBLIC_API_BASE_URL,
      fetchImpl: fetchMock as unknown as typeof fetch,
      query,
    });

    expect(result.rotated).toBe(false);
    expect(result.reason).toBe("decrypt_failed");
    // Must NOT have called Monobank (no plaintext token to send).
    expect(fetchMock).not.toHaveBeenCalled();
    // Must NOT have run the UPDATE either — only the SELECT.
    expect(query).toHaveBeenCalledTimes(1);
  });

  it("returns monobank_register_failed (non-2xx) without UPDATE-ing DB", async () => {
    const enc = encryptToken("user_personal_token", ENC_KEY);
    const query = makeQueryMock([
      {
        rows: [
          {
            token_ciphertext: enc.ciphertext,
            token_iv: enc.iv,
            token_tag: enc.tag,
          },
        ],
      },
    ]);
    const fetchMock = vi.fn().mockResolvedValueOnce({
      ok: false,
      status: 500,
      text: async () => "Internal Server Error",
    });

    const result = await rotateMonoWebhookSecret({
      userId: "user_1",
      encKey: ENC_KEY,
      publicApiBaseUrl: PUBLIC_API_BASE_URL,
      fetchImpl: fetchMock as unknown as typeof fetch,
      query,
    });

    expect(result.rotated).toBe(false);
    expect(result.reason).toBe("monobank_register_failed");
    expect(result.monobankStatus).toBe(500);
    // SELECT only — no UPDATE happened, so the OLD secret/hash are still
    // active and incoming webhooks still resolve.
    expect(query).toHaveBeenCalledTimes(1);
  });

  it("returns monobank_register_timeout on fetch rejection", async () => {
    const enc = encryptToken("user_personal_token", ENC_KEY);
    const query = makeQueryMock([
      {
        rows: [
          {
            token_ciphertext: enc.ciphertext,
            token_iv: enc.iv,
            token_tag: enc.tag,
          },
        ],
      },
    ]);
    const fetchMock = vi.fn().mockRejectedValueOnce(new Error("timeout"));

    const result = await rotateMonoWebhookSecret({
      userId: "user_1",
      encKey: ENC_KEY,
      publicApiBaseUrl: PUBLIC_API_BASE_URL,
      fetchImpl: fetchMock as unknown as typeof fetch,
      query,
    });

    expect(result.rotated).toBe(false);
    expect(result.reason).toBe("monobank_register_timeout");
    expect(query).toHaveBeenCalledTimes(1);
  });
});

describe("rotateStaleMonoWebhookSecrets (batch)", () => {
  it("rotates each candidate and reports zero-stale when nothing is overdue", async () => {
    const enc = encryptToken("user_personal_token", ENC_KEY);
    const tokenRow = {
      token_ciphertext: enc.ciphertext,
      token_iv: enc.iv,
      token_tag: enc.tag,
    };
    const query = makeQueryMock([
      // Candidate selection: 2 rows
      { rows: [{ user_id: "u1" }, { user_id: "u2" }] },
      // u1: SELECT + UPDATE
      { rows: [tokenRow] },
      { rows: [], rowCount: 1 },
      // u2: SELECT + UPDATE
      { rows: [tokenRow] },
      { rows: [], rowCount: 1 },
      // Stale count
      { rows: [{ count: "0" }] },
    ]);

    const fetchMock = vi
      .fn()
      .mockResolvedValue({ ok: true, status: 200, text: async () => "" });

    const result = await rotateStaleMonoWebhookSecrets({
      encKey: ENC_KEY,
      publicApiBaseUrl: PUBLIC_API_BASE_URL,
      olderThanDays: 90,
      alertAfterDays: 100,
      fetchImpl: fetchMock as unknown as typeof fetch,
      query,
    });

    expect(result.candidates).toBe(2);
    expect(result.rotated).toBe(2);
    expect(result.failed).toBe(0);
    expect(result.stale).toBe(0);
    expect(result.dryRun).toBe(false);
    expect(captureMessageMock).not.toHaveBeenCalled();
  });

  it("captures Sentry warning when stale > 0 even with all rotations succeeding", async () => {
    const enc = encryptToken("user_personal_token", ENC_KEY);
    const tokenRow = {
      token_ciphertext: enc.ciphertext,
      token_iv: enc.iv,
      token_tag: enc.tag,
    };
    const query = makeQueryMock([
      // 1 candidate
      { rows: [{ user_id: "u1" }] },
      // u1 SELECT + UPDATE
      { rows: [tokenRow] },
      { rows: [], rowCount: 1 },
      // 3 stale connections (older than alertAfterDays — couldn't be
      // rotated this batch, e.g. limit cap on a previous run).
      { rows: [{ count: "3" }] },
    ]);
    const fetchMock = vi
      .fn()
      .mockResolvedValue({ ok: true, status: 200, text: async () => "" });

    const result = await rotateStaleMonoWebhookSecrets({
      encKey: ENC_KEY,
      publicApiBaseUrl: PUBLIC_API_BASE_URL,
      olderThanDays: 90,
      alertAfterDays: 100,
      fetchImpl: fetchMock as unknown as typeof fetch,
      query,
    });

    expect(result.stale).toBe(3);
    expect(captureMessageMock).toHaveBeenCalledTimes(1);
    const [msg, opts] = captureMessageMock.mock.calls[0];
    expect(msg).toMatch(/3/);
    expect(msg).toMatch(/100/);
    expect(opts.level).toBe("warning");
    expect(opts.tags.module).toBe("mono");
  });

  it("dryRun: counts candidates but does not call Monobank or UPDATE", async () => {
    const query = makeQueryMock([
      { rows: [{ user_id: "u1" }, { user_id: "u2" }] },
      { rows: [{ count: "0" }] },
    ]);
    const fetchMock = vi.fn();

    const result = await rotateStaleMonoWebhookSecrets({
      encKey: ENC_KEY,
      publicApiBaseUrl: PUBLIC_API_BASE_URL,
      olderThanDays: 90,
      alertAfterDays: 100,
      dryRun: true,
      fetchImpl: fetchMock as unknown as typeof fetch,
      query,
    });

    expect(result.candidates).toBe(2);
    expect(result.rotated).toBe(0);
    expect(result.dryRun).toBe(true);
    expect(fetchMock).not.toHaveBeenCalled();
    // Two queries only: candidate-select + stale-count.
    expect(query).toHaveBeenCalledTimes(2);
  });

  it("counts a Monobank failure as `failed` but still processes the rest", async () => {
    const enc = encryptToken("user_personal_token", ENC_KEY);
    const tokenRow = {
      token_ciphertext: enc.ciphertext,
      token_iv: enc.iv,
      token_tag: enc.tag,
    };
    const query = makeQueryMock([
      { rows: [{ user_id: "u1" }, { user_id: "u2" }] },
      // u1 SELECT (Monobank will fail, no UPDATE)
      { rows: [tokenRow] },
      // u2 SELECT + UPDATE (success)
      { rows: [tokenRow] },
      { rows: [], rowCount: 1 },
      // stale count
      { rows: [{ count: "0" }] },
    ]);
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: false,
        status: 502,
        text: async () => "Bad Gateway",
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: async () => "",
      });

    const result = await rotateStaleMonoWebhookSecrets({
      encKey: ENC_KEY,
      publicApiBaseUrl: PUBLIC_API_BASE_URL,
      olderThanDays: 90,
      alertAfterDays: 100,
      fetchImpl: fetchMock as unknown as typeof fetch,
      query,
    });

    expect(result.candidates).toBe(2);
    expect(result.rotated).toBe(1);
    expect(result.failed).toBe(1);
    expect(result.results.find((r) => r.userId === "u1")?.reason).toBe(
      "monobank_register_failed",
    );
  });

  it("rejects invalid params before touching the DB", async () => {
    const query = makeQueryMock([]);
    const fetchMock = vi.fn();

    await expect(
      rotateStaleMonoWebhookSecrets({
        encKey: ENC_KEY,
        publicApiBaseUrl: PUBLIC_API_BASE_URL,
        olderThanDays: 0,
        fetchImpl: fetchMock as unknown as typeof fetch,
        query,
      }),
    ).rejects.toThrow(/olderThanDays/);

    await expect(
      rotateStaleMonoWebhookSecrets({
        encKey: ENC_KEY,
        publicApiBaseUrl: PUBLIC_API_BASE_URL,
        olderThanDays: 100,
        alertAfterDays: 50,
        fetchImpl: fetchMock as unknown as typeof fetch,
        query,
      }),
    ).rejects.toThrow(/alertAfterDays/);

    expect(query).not.toHaveBeenCalled();
  });
});
