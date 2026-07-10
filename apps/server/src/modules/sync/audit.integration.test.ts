/**
 * Integration tests for `GET /api/sync/audit` (listSyncAudit handler).
 *
 * Uses a real Postgres container to verify:
 *   1. Self-mode: a user gets only their own sync_audit_log rows (RLS gate).
 *   2. Cross-user without allowlist → 403 Forbidden (no details leaked).
 *   3. Allowlisted cross-user read → 200 with the target user's rows.
 *
 * `SYNC_AUDIT_ADMIN_USER_IDS` is mutated on the env singleton (same pattern
 * as `audit.test.ts`) to avoid reloading the module between tests.
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
  type IntegrationHarness,
} from "../../test/createIntegrationApp.js";

let harness: IntegrationHarness;
let dockerAvailable = false;

let listSyncAuditFn: (req: Request, res: Response) => Promise<void>;
let envRef: { SYNC_AUDIT_ADMIN_USER_IDS: string | undefined };

const USER_SELF = "u_audit_intg_self";
const USER_OTHER = "u_audit_intg_other";
const USER_ADMIN = "u_audit_intg_admin";

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
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    },
  };
  return res as TestRes & Response;
}

function makeReq(actorId: string, query: Record<string, string> = {}): Request {
  return {
    method: "GET",
    query,
    user: { id: actorId },
  } as unknown as Request;
}

/** Insert a row into sync_audit_log for the given user. */
async function seedAuditRow(
  userId: string,
  opType = "push",
  outcome = "ok",
): Promise<void> {
  await harness.pool.query(
    `INSERT INTO sync_audit_log
       (user_id, op_type, module, outcome, conflict, payload_size_bytes, duration_ms)
     VALUES ($1, $2, 'finyk', $3, false, 1024, 12)`,
    [userId, opType, outcome],
  );
}

beforeAll(async () => {
  try {
    harness = await bootIntegrationHarness({ app: false });
    dockerAvailable = true;
  } catch (e) {
    if (process.env["CI"]) throw e;
    console.warn(
      "[audit integration] Skipping:",
      e instanceof Error ? e.message : String(e),
    );
    return;
  }

  vi.doMock("../../db.js", () => ({
    default: harness.pool,
    pool: harness.pool,
    query: (text: string, values?: unknown[]) =>
      harness.pool.query(text, values),
    ensureSchema: vi.fn().mockResolvedValue(undefined),
  }));

  vi.doMock("../../obs/logger.js", () => ({
    logger: {
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      fatal: vi.fn(),
    },
  }));

  const [mod, envMod] = await Promise.all([
    import("./audit.js"),
    import("../../env.js"),
  ]);
  listSyncAuditFn = mod.listSyncAudit;
  envRef = envMod.env as unknown as {
    SYNC_AUDIT_ADMIN_USER_IDS: string | undefined;
  };
}, INTEGRATION_TIMEOUT_MS);

afterAll(async () => {
  await shutdownIntegrationHarness();
}, INTEGRATION_TIMEOUT_MS);

beforeEach(async () => {
  if (!dockerAvailable) return;
  // Reset admin allowlist before each test.
  envRef.SYNC_AUDIT_ADMIN_USER_IDS = "";
  await truncateIntegrationTables(harness.pool);
  await seedIntegrationUser(harness.pool, USER_SELF);
  await seedIntegrationUser(harness.pool, USER_OTHER);
  await seedIntegrationUser(harness.pool, USER_ADMIN);
});

describe("sync/audit — integration (real Postgres)", () => {
  it(
    "self-mode: user gets own rows and no rows from other users",
    async (ctx) => {
      if (!dockerAvailable) return ctx.skip();

      await seedAuditRow(USER_SELF, "push", "ok");
      await seedAuditRow(USER_SELF, "pull", "empty");
      await seedAuditRow(USER_OTHER, "push", "ok"); // should not appear

      const res = makeRes();
      await listSyncAuditFn(makeReq(USER_SELF), res);

      expect(res.statusCode).toBe(200);
      const body = res.body as {
        ok: boolean;
        userId: string;
        isAdminView: boolean;
        rows: Array<{ userId: string; id: number }>;
      };
      expect(body.ok).toBe(true);
      expect(body.userId).toBe(USER_SELF);
      expect(body.isAdminView).toBe(false);
      // Only USER_SELF rows.
      expect(body.rows).toHaveLength(2);
      expect(body.rows.every((r) => r.userId === USER_SELF)).toBe(true);
      // Hard Rule #1: id must be a number, not a string.
      expect(typeof body.rows[0]!.id).toBe("number");
    },
    INTEGRATION_TIMEOUT_MS,
  );

  it(
    "cross-user without allowlist → 403 Forbidden",
    async (ctx) => {
      if (!dockerAvailable) return ctx.skip();

      await seedAuditRow(USER_OTHER, "push", "ok");

      const res = makeRes();
      await listSyncAuditFn(makeReq(USER_SELF, { user_id: USER_OTHER }), res);

      expect(res.statusCode).toBe(403);
      expect((res.body as Record<string, unknown>)["error"]).toBe("Forbidden");
    },
    INTEGRATION_TIMEOUT_MS,
  );

  it(
    "allowlisted cross-user read → 200 with target user's rows",
    async (ctx) => {
      if (!dockerAvailable) return ctx.skip();

      envRef.SYNC_AUDIT_ADMIN_USER_IDS = USER_ADMIN;

      await seedAuditRow(USER_OTHER, "pull_all", "ok");

      const res = makeRes();
      await listSyncAuditFn(makeReq(USER_ADMIN, { user_id: USER_OTHER }), res);

      expect(res.statusCode).toBe(200);
      const body = res.body as {
        ok: boolean;
        userId: string;
        isAdminView: boolean;
        rows: Array<{ userId: string }>;
      };
      expect(body.ok).toBe(true);
      expect(body.userId).toBe(USER_OTHER);
      expect(body.isAdminView).toBe(true);
      expect(body.rows).toHaveLength(1);
      expect(body.rows[0]!.userId).toBe(USER_OTHER);
    },
    INTEGRATION_TIMEOUT_MS,
  );
});
