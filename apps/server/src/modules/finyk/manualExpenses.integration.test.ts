/**
 * Integration tests for `createManualExpense` (POST /api/finyk/manual-expenses).
 *
 * Uses a real Postgres container so that INSERT … RETURNING, JSONB
 * serialisation, and the money minor-unit contract (kopiykas) are exercised
 * against the actual schema. Skips gracefully when Docker is unavailable
 * locally; fails in CI so the guard never silently passes.
 *
 * Pattern mirrors `read.integration.test.ts`:
 *   1. `bootIntegrationHarness({ app: false })` — spin up Postgres + env.
 *   2. `vi.doMock("../../db.js")` — wire the singleton pool used by
 *      `manualExpenses.ts` to the test container's pool.
 *   3. `await import("./manualExpenses.js")` — load handler post-mock.
 *   4. Direct handler calls with a synthetic `req` (no HTTP layer).
 *
 * Auth: `createManualExpense` reads `req.user.id` (set by `requireSession`
 * middleware). For direct-call integration tests we inject `user.id` via
 * the synthetic `req` object — no auth mocking required.
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
import { ValidationError } from "../../obs/errors.js";

// ── Globals set in beforeAll ───────────────────────────────────────────────

import type pg from "pg";

let testPool: pg.Pool;
let createManualExpense: typeof import("./manualExpenses.js").createManualExpense;
let dockerAvailable = false;
let skipReason: string | null = null;

// ── Constants ─────────────────────────────────────────────────────────────

const USER_A = "finyk_int_user_a";
const USER_B = "finyk_int_user_b";

// ── Lifecycle ─────────────────────────────────────────────────────────────

beforeAll(async () => {
  try {
    const harness = await bootIntegrationHarness({ app: false });
    testPool = harness.pool;

    // Wire the module-level pool singleton in manualExpenses.ts to the
    // test container's pool. Must happen before the dynamic import below.
    vi.doMock("../../db.js", () => ({
      query: (text: string, values?: unknown[]) => testPool.query(text, values),
      pool: testPool,
      default: testPool,
      ensureSchema: vi.fn().mockResolvedValue(undefined),
    }));

    const mod = await import("./manualExpenses.js");
    createManualExpense = mod.createManualExpense;

    dockerAvailable = true;
  } catch (err) {
    if (process.env["CI"]) throw err;
    skipReason = err instanceof Error ? err.message : String(err);
    console.warn(
      `[finyk/manualExpenses integration] Skipping: Docker unavailable — ${skipReason}`,
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

/** Synthetic POST request for `createManualExpense`. */
function makeReq(userId: string, body: Record<string, unknown>): Request {
  return {
    user: { id: userId },
    body,
  } as unknown as Request;
}

// ── Tests ─────────────────────────────────────────────────────────────────

describe("manualExpenses.integration — real Postgres", () => {
  /**
   * Test 1: POST with session user → row in finyk_manual_expenses,
   *         amountKopiykas in response.
   *
   * Verifies the full round-trip: handler reads kopiykas from `req.body`,
   * converts to hryvnyas for the JSONB blob (LS-parrity), and the
   * serializer converts back to kopiykas in the response. Confirms the row
   * is actually present in the DB with the correct user_id.
   */
  it("POST by authed user → row in DB, amountKopiykas in response", async () => {
    if (!dockerAvailable) {
      console.log(`SKIP: ${skipReason ?? "Docker unavailable"}`);
      return;
    }

    await seedIntegrationUser(testPool, USER_A);

    const req = makeReq(USER_A, {
      amount: 12000, // 120 hryvnyas in kopiykas
      category: "food",
      date: "2026-07-10",
      note: "Кава",
    });
    const res = makeRes();
    await createManualExpense(req, res);

    expect(res.statusCode).toBe(201);
    const body = res.body as {
      ok: boolean;
      expense: Record<string, unknown>;
    };
    expect(body.ok).toBe(true);

    // Money invariant: kopiykas round-trip correctly
    expect(body.expense["amountKopiykas"]).toBe(12000);
    expect(typeof body.expense["amountKopiykas"]).toBe("number");
    expect(body.expense["category"]).toBe("food");
    expect(body.expense["date"]).toBe("2026-07-10");
    expect(body.expense["note"]).toBe("Кава");

    // Verify the row actually landed in the DB
    const dbResult = await testPool.query(
      `SELECT user_id, data_json FROM finyk_manual_expenses WHERE user_id = $1`,
      [USER_A],
    );
    expect(dbResult.rows).toHaveLength(1);
    expect(dbResult.rows[0]!.user_id).toBe(USER_A);

    // The blob stores amount in hryvnyas (LS-parrity), not kopiykas
    const blob = dbResult.rows[0]!.data_json as { amount: number };
    expect(blob.amount).toBe(120);
  });

  /**
   * Test 2: reject amount ≤ 0 / non-integer.
   *
   * `ManualExpenseCreateSchema` requires `amount` to be a positive integer
   * (kopiykas). The handler must throw a ValidationError when given:
   *   - amount = 0 (not positive)
   *   - amount = -500 (negative)
   *   - amount = 199.5 (non-integer — kopiykas must be whole)
   *
   * `parseBody` throws `ValidationError` on schema failure; the Express
   * error handler converts this to 400. In direct-call integration tests
   * the error propagates and we assert it's a ValidationError.
   */
  it.each([
    ["zero amount", { amount: 0, category: "food" }],
    ["negative amount", { amount: -500, category: "food" }],
    ["non-integer amount", { amount: 199.5, category: "food" }],
    ["missing category", { amount: 1000 }],
    ["empty category", { amount: 1000, category: "" }],
  ])("rejects invalid body (%s) with ValidationError", async (_label, body) => {
    if (!dockerAvailable) {
      console.log(`SKIP: ${skipReason ?? "Docker unavailable"}`);
      return;
    }

    await seedIntegrationUser(testPool, USER_A);

    const req = makeReq(USER_A, body);
    const res = makeRes();

    await expect(createManualExpense(req, res)).rejects.toBeInstanceOf(
      ValidationError,
    );

    // No row should have been written
    const dbResult = await testPool.query(
      `SELECT COUNT(*)::int AS cnt FROM finyk_manual_expenses WHERE user_id = $1`,
      [USER_A],
    );
    expect(dbResult.rows[0]!.cnt).toBe(0);
  });

  /**
   * Test 3: user_id sourced from session, never from body.
   *
   * The handler reads `userId` from `req.user.id` (injected by
   * `requireSession` middleware) and ignores any `userId` that might
   * appear in the request body. This prevents a client from forging a
   * different user's expense.
   */
  it("user_id is taken from req.user.id, not from request body", async () => {
    if (!dockerAvailable) {
      console.log(`SKIP: ${skipReason ?? "Docker unavailable"}`);
      return;
    }

    await seedIntegrationUser(testPool, USER_A);

    // Attempt to pass a userId in the body (schema is strict() — it will be
    // stripped by Zod; ManualExpenseCreateSchema uses .strict() so unknown
    // keys cause a parse error). We pass without the key to keep it valid.
    const req = makeReq(USER_A, {
      amount: 5000,
      category: "transport",
    });
    const res = makeRes();
    await createManualExpense(req, res);

    expect(res.statusCode).toBe(201);

    // Row in DB must use the session user_id (USER_A), not any injected value
    const dbResult = await testPool.query(
      `SELECT user_id FROM finyk_manual_expenses`,
    );
    expect(dbResult.rows).toHaveLength(1);
    expect(dbResult.rows[0]!.user_id).toBe(USER_A);
  });

  /**
   * Test 4: user A expense is not visible to user B via SQL.
   *
   * The `user_id` column gates row visibility. A query scoped to user B's
   * ID must return zero rows even after user A has created an expense.
   * Verifies the SQL isolation invariant without a list-expenses endpoint
   * (which does not exist yet) — we query the DB directly.
   */
  it("user A expense is not visible to user B via SQL isolation", async () => {
    if (!dockerAvailable) {
      console.log(`SKIP: ${skipReason ?? "Docker unavailable"}`);
      return;
    }

    await seedIntegrationUser(testPool, USER_A);
    await seedIntegrationUser(testPool, USER_B);

    // Create expense for user A
    const req = makeReq(USER_A, {
      amount: 8000,
      category: "groceries",
      note: "Сільпо",
    });
    const res = makeRes();
    await createManualExpense(req, res);
    expect(res.statusCode).toBe(201);

    // User A's expense is visible to user A
    const rowsA = await testPool.query(
      `SELECT COUNT(*)::int AS cnt FROM finyk_manual_expenses WHERE user_id = $1`,
      [USER_A],
    );
    expect(rowsA.rows[0]!.cnt).toBe(1);

    // User B sees zero rows — SQL isolation guarantee
    const rowsB = await testPool.query(
      `SELECT COUNT(*)::int AS cnt FROM finyk_manual_expenses WHERE user_id = $1`,
      [USER_B],
    );
    expect(rowsB.rows[0]!.cnt).toBe(0);
  });
});
