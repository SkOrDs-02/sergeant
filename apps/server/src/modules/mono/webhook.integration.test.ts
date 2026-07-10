/**
 * Integration tests for the Monobank webhook handler.
 *
 * Uses a real Postgres container (Testcontainers + migrations) so that FK
 * enforcement, ON CONFLICT semantics, and BIGINT coercion are all exercised
 * against the actual schema. Skips gracefully when Docker is unavailable
 * locally; fails in CI (process.env.CI is set) so the guard never silently
 * passes on a misconfigured runner.
 *
 * Pattern mirrors `read.integration.test.ts`:
 *   1. `bootIntegrationHarness({ app: false })` — spin up Postgres, run
 *      migrations, set env vars (DATABASE_URL, MONO_WEBHOOK_ENABLED, …).
 *   2. `vi.doMock("../../db.js")` — wire the singleton pool/query used by
 *      `webhook.ts` to the test container's pool.
 *   3. `await import("./webhook.js")` — load handler after mock is in place.
 *   4. Direct handler calls (no HTTP) — `makeReq` / `makeRes` helpers.
 */

import {
  describe,
  it,
  expect,
  beforeAll,
  afterAll,
  beforeEach,
  vi,
} from "vitest";
import type { Request, Response } from "express";
import {
  bootIntegrationHarness,
  shutdownIntegrationHarness,
  seedIntegrationUser,
  truncateIntegrationTables,
  INTEGRATION_TIMEOUT_MS,
} from "../../test/createIntegrationApp.js";
import { webhookSecretHash } from "./crypto.js";

// ── Side-effect stubs (hoisted — must be declared before any dynamic import) ──

vi.mock("../../obs/logger.js", () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
  serializeError: vi.fn((err: unknown) => ({
    message: err instanceof Error ? err.message : String(err),
  })),
}));

vi.mock("../../obs/metrics.js", () => ({
  monoWebhookReceivedTotal: { inc: vi.fn() },
  monoWebhookDurationMs: { observe: vi.fn() },
  aiMemoryIngestEnqueuedTotal: { inc: vi.fn() },
  aiMemoryIngestProcessedTotal: { inc: vi.fn() },
  aiMemoryIngestDurationMs: { observe: vi.fn() },
  aiMemoryIngestQueueDepth: { set: vi.fn() },
}));

vi.mock("../../push/send.js", () => ({
  sendToUserQuietly: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../ai-memory/ingestQueue.js", () => ({
  enqueueMemoryIngest: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../../obs/securityEvents.js", () => ({
  emitSecurityEvent: vi.fn(),
}));

// ── Globals set in beforeAll ───────────────────────────────────────────────

import type pg from "pg";

let testPool: pg.Pool;
let webhookHandler: typeof import("./webhook.js").webhookHandler;
let accountsHandler: typeof import("./read.js").accountsHandler;
let dockerAvailable = false;
let skipReason: string | null = null;

// ── Constants ─────────────────────────────────────────────────────────────

const USER_A = "integration_user_a_wh";
const USER_B = "integration_user_b_wh";
const ACCOUNT_ID = "acct_int_test";
const WEBHOOK_SECRET = "test-webhook-secret-integration-32x";

// ── Lifecycle ─────────────────────────────────────────────────────────────

beforeAll(async () => {
  try {
    const harness = await bootIntegrationHarness({ app: false });
    testPool = harness.pool;

    // Wire the module-level singleton in webhook.ts / read.ts to the
    // test container's pool. Must happen before the dynamic import below.
    vi.doMock("../../db.js", () => ({
      query: (text: string, values?: unknown[]) => testPool.query(text, values),
      pool: testPool,
      default: testPool,
      ensureSchema: vi.fn().mockResolvedValue(undefined),
    }));

    const wh = await import("./webhook.js");
    webhookHandler = wh.webhookHandler;

    const rd = await import("./read.js");
    accountsHandler = rd.accountsHandler;

    dockerAvailable = true;
  } catch (err) {
    if (process.env["CI"]) throw err;
    skipReason = err instanceof Error ? err.message : String(err);
    console.warn(
      `[webhook integration] Skipping: Docker unavailable — ${skipReason}`,
    );
  }
}, INTEGRATION_TIMEOUT_MS);

afterAll(async () => {
  await shutdownIntegrationHarness();
}, INTEGRATION_TIMEOUT_MS);

beforeEach(async () => {
  if (!dockerAvailable) return;
  await truncateIntegrationTables(testPool);
});

// ── Helpers ───────────────────────────────────────────────────────────────

interface TestRes {
  statusCode: number;
  body: unknown;
  status(code: number): TestRes;
  json(payload: unknown): TestRes;
}

function makeRes(): TestRes & Response {
  const res: TestRes = {
    statusCode: 200,
    body: {},
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(payload: unknown) {
      this.body = payload;
      return this;
    },
  };
  return res as TestRes & Response;
}

/** Webhook request via path-param secret transport. */
function makeReq(secret: string, body?: unknown): Request {
  return {
    params: { secret },
    headers: {},
    body: body ?? validPayload(),
  } as unknown as Request;
}

function makeReadReq(userId = USER_A): Request {
  return { query: {}, user: { id: userId } } as unknown as Request;
}

function validPayload(overrides: Record<string, unknown> = {}) {
  return {
    type: "StatementItem",
    data: {
      account: ACCOUNT_ID,
      statementItem: {
        id: "tx_int_001",
        time: Math.floor(Date.now() / 1000),
        description: "Кава",
        mcc: 5814,
        amount: -6500,
        operationAmount: -6500,
        currencyCode: 980,
        balance: 1_500_000,
        ...overrides,
      },
    },
  };
}

/** Seed a mono_connection row for the given user, returning the secret. */
async function seedConnection(
  userId: string,
  secret = WEBHOOK_SECRET,
  status = "active",
): Promise<void> {
  const secretHash = webhookSecretHash(secret);
  await testPool.query(
    `INSERT INTO mono_connection
       (user_id, token_ciphertext, token_iv, token_tag, token_fingerprint,
        webhook_secret, webhook_secret_hash, status)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     ON CONFLICT (user_id) DO NOTHING`,
    [
      userId,
      Buffer.from("dummy_ct"),
      Buffer.from("dummy_iv"),
      Buffer.from("dummy_tag"),
      "dummy_fingerprint",
      secret,
      secretHash,
      status,
    ],
  );
}

/** Seed a mono_account row (required FK for mono_transaction inserts). */
async function seedAccount(
  userId: string,
  accountId = ACCOUNT_ID,
  balance = 0,
): Promise<void> {
  await testPool.query(
    `INSERT INTO mono_account
       (user_id, mono_account_id, currency_code, balance)
     VALUES ($1, $2, 980, $3)
     ON CONFLICT (user_id, mono_account_id) DO NOTHING`,
    [userId, accountId, balance],
  );
}

// ── Tests ─────────────────────────────────────────────────────────────────

describe("webhook.integration — real Postgres", () => {
  /**
   * Test 1: valid StatementItem → INSERT mono_transaction + balance update.
   *
   * Verifies end-to-end happy path: webhook arrives with a valid payload,
   * mono_transaction row is created, and mono_account.balance is updated to
   * match the incoming statementItem.balance.
   */
  it("valid StatementItem → inserts mono_transaction and updates balance", async () => {
    if (!dockerAvailable) {
      console.log(`SKIP: ${skipReason ?? "Docker unavailable"}`);
      return;
    }

    await seedIntegrationUser(testPool, USER_A);
    await seedConnection(USER_A);
    await seedAccount(USER_A, ACCOUNT_ID, 0);

    const res = makeRes();
    await webhookHandler(makeReq(WEBHOOK_SECRET), res);

    expect(res.statusCode).toBe(200);
    expect(res.body).toMatchObject({ ok: true });

    // Verify mono_transaction row was created
    const txResult = await testPool.query(
      `SELECT user_id, mono_account_id, mono_tx_id, amount, balance
       FROM mono_transaction
       WHERE user_id = $1`,
      [USER_A],
    );
    expect(txResult.rows).toHaveLength(1);
    expect(txResult.rows[0]).toMatchObject({
      user_id: USER_A,
      mono_account_id: ACCOUNT_ID,
      mono_tx_id: "tx_int_001",
    });

    // Verify mono_account.balance was updated to match statementItem.balance
    const acctResult = await testPool.query(
      `SELECT balance FROM mono_account WHERE user_id = $1 AND mono_account_id = $2`,
      [USER_A, ACCOUNT_ID],
    );
    expect(acctResult.rows).toHaveLength(1);
    // The raw pg driver returns BIGINT as string — that is expected at the DB
    // level; coercion to number happens in the serializer (Hard Rule #1).
    // Here we verify the correct value was stored.
    expect(Number(acctResult.rows[0]!.balance)).toBe(1_500_000);
  });

  /**
   * Test 2: duplicate mono_tx_id → ON CONFLICT idempotent.
   *
   * Monobank retries if it doesn't receive a 200. The handler must be
   * idempotent: a second delivery of the same (user_id, mono_tx_id) pair
   * must not create a duplicate row.
   */
  it("duplicate mono_tx_id → ON CONFLICT leaves exactly one row", async () => {
    if (!dockerAvailable) {
      console.log(`SKIP: ${skipReason ?? "Docker unavailable"}`);
      return;
    }

    await seedIntegrationUser(testPool, USER_A);
    await seedConnection(USER_A);
    await seedAccount(USER_A);

    // First delivery
    const res1 = makeRes();
    await webhookHandler(makeReq(WEBHOOK_SECRET), res1);
    expect(res1.statusCode).toBe(200);

    // Second delivery — same tx_id, slightly different description
    const res2 = makeRes();
    await webhookHandler(
      makeReq(WEBHOOK_SECRET, validPayload({ description: "Кава (retry)" })),
      res2,
    );
    expect(res2.statusCode).toBe(200);

    // Exactly one row in mono_transaction
    const result = await testPool.query(
      `SELECT COUNT(*)::int AS cnt
       FROM mono_transaction
       WHERE user_id = $1 AND mono_tx_id = $2`,
      [USER_A, "tx_int_001"],
    );
    expect(result.rows[0]!.cnt).toBe(1);
  });

  /**
   * Test 3: unknown webhook secret → 404.
   *
   * A request with an unrecognised secret must return 404 so Monobank does
   * not learn whether the endpoint exists (security-by-obscurity layer).
   * No row should be written.
   */
  it("unknown webhook secret → 404, no DB write", async () => {
    if (!dockerAvailable) {
      console.log(`SKIP: ${skipReason ?? "Docker unavailable"}`);
      return;
    }

    await seedIntegrationUser(testPool, USER_A);
    // Seed connection with a DIFFERENT secret
    await seedConnection(USER_A, "other-secret-value-that-wont-match-zzz");

    const res = makeRes();
    await webhookHandler(makeReq("completely-wrong-secret"), res);

    expect(res.statusCode).toBe(404);
    expect(res.body).toMatchObject({ error: "Not found" });

    // No transaction should have been inserted
    const txResult = await testPool.query(
      `SELECT COUNT(*)::int AS cnt FROM mono_transaction WHERE user_id = $1`,
      [USER_A],
    );
    expect(txResult.rows[0]!.cnt).toBe(0);
  });

  /**
   * Test 4: FK violation (missing mono_account) → autocreate stub + retry.
   *
   * When Monobank delivers a transaction for an account that is not yet in
   * mono_account (e.g. a newly-opened card), the handler must:
   *   1. Detect the 23503 FK violation on the first upsert attempt.
   *   2. ROLLBACK TO SAVEPOINT.
   *   3. INSERT a stub mono_account row.
   *   4. Retry the upsert — successfully this time.
   * The final response must be 200 and both rows must exist.
   */
  it("FK missing account → autocreates mono_account stub and inserts tx", async () => {
    if (!dockerAvailable) {
      console.log(`SKIP: ${skipReason ?? "Docker unavailable"}`);
      return;
    }

    await seedIntegrationUser(testPool, USER_A);
    await seedConnection(USER_A);
    // Deliberately skip seedAccount — that's the test condition

    const res = makeRes();
    await webhookHandler(makeReq(WEBHOOK_SECRET), res);

    expect(res.statusCode).toBe(200);
    expect(res.body).toMatchObject({ ok: true });

    // mono_account stub should have been autocreated
    const acctResult = await testPool.query(
      `SELECT user_id, mono_account_id, currency_code
       FROM mono_account
       WHERE user_id = $1 AND mono_account_id = $2`,
      [USER_A, ACCOUNT_ID],
    );
    expect(acctResult.rows).toHaveLength(1);
    expect(acctResult.rows[0]).toMatchObject({
      user_id: USER_A,
      mono_account_id: ACCOUNT_ID,
      currency_code: 980,
    });

    // mono_transaction should also exist
    const txResult = await testPool.query(
      `SELECT COUNT(*)::int AS cnt FROM mono_transaction WHERE user_id = $1`,
      [USER_A],
    );
    expect(txResult.rows[0]!.cnt).toBe(1);
  });

  /**
   * Test 5: webhook secret scoped to user A → transaction attributed only
   * to user A, not user B.
   *
   * Each mono_connection row is scoped to a single user_id. The handler
   * resolves the user from the connection lookup (WHERE webhook_secret_hash
   * = $1) and must write the transaction only to that user. Verifies the FK
   * isolation guarantee that prevents cross-user data leaks.
   */
  it("user A secret → transaction attributed only to user A, not user B", async () => {
    if (!dockerAvailable) {
      console.log(`SKIP: ${skipReason ?? "Docker unavailable"}`);
      return;
    }

    await seedIntegrationUser(testPool, USER_A);
    await seedIntegrationUser(testPool, USER_B);
    await seedConnection(USER_A);
    await seedAccount(USER_A);

    const res = makeRes();
    await webhookHandler(makeReq(WEBHOOK_SECRET), res);

    expect(res.statusCode).toBe(200);

    // Transaction must be scoped to user A
    const txA = await testPool.query(
      `SELECT COUNT(*)::int AS cnt FROM mono_transaction WHERE user_id = $1`,
      [USER_A],
    );
    expect(txA.rows[0]!.cnt).toBe(1);

    // User B must have zero transactions
    const txB = await testPool.query(
      `SELECT COUNT(*)::int AS cnt FROM mono_transaction WHERE user_id = $1`,
      [USER_B],
    );
    expect(txB.rows[0]!.cnt).toBe(0);
  });

  /**
   * Test 6: balance BIGINT in DB → read path returns JS number (Hard Rule #1).
   *
   * Postgres returns BIGINT columns as strings in the `pg` driver. The
   * accountsHandler serializer must coerce them to JS numbers before
   * including them in the response. This test verifies the end-to-end
   * coercion: webhook writes a balance (bigint), accountsHandler reads it
   * back, and the response field `balance` must be `typeof 'number'` — not
   * a string like "1500000".
   */
  it("balance BIGINT in DB → accountsHandler returns JS number (Hard Rule #1)", async () => {
    if (!dockerAvailable) {
      console.log(`SKIP: ${skipReason ?? "Docker unavailable"}`);
      return;
    }

    await seedIntegrationUser(testPool, USER_A);
    await seedConnection(USER_A);
    await seedAccount(USER_A, ACCOUNT_ID, 0);

    // Webhook writes balance = 1_500_000 to mono_account via UPDATE
    const whRes = makeRes();
    await webhookHandler(makeReq(WEBHOOK_SECRET), whRes);
    expect(whRes.statusCode).toBe(200);

    // Now read back through the accounts handler
    const rdRes = makeRes();
    await accountsHandler(makeReadReq(USER_A), rdRes);

    expect(rdRes.statusCode).toBe(200);
    const accounts = rdRes.body as Array<Record<string, unknown>>;
    expect(accounts).toHaveLength(1);

    const acct = accounts[0]!;
    // Hard Rule #1: bigint must arrive as JS number, not string
    expect(typeof acct["balance"]).toBe("number");
    expect(acct["balance"]).toBe(1_500_000);
  });
});
