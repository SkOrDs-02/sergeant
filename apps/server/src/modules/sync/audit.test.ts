import { describe, it, expect, beforeEach, vi } from "vitest";
import type { Request, Response } from "express";
import type { Mock } from "vitest";

vi.mock("../../db.js", () => {
  const pool = { connect: vi.fn(), query: vi.fn() };
  return { default: pool, pool };
});

vi.mock("../../obs/logger.js", async () => {
  const actual = await vi.importActual("../../obs/logger.js");
  return {
    ...actual,
    logger: {
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      fatal: vi.fn(),
    },
  };
});

import _pool from "../../db.js";
import { env } from "../../env.js";
import { logger as _logger } from "../../obs/logger.js";
import { isSyncAuditAdmin, listSyncAudit } from "./audit.js";

const pool = _pool as unknown as { connect: Mock; query: Mock };
const logger = _logger as unknown as {
  debug: Mock;
  info: Mock;
  warn: Mock;
  error: Mock;
  fatal: Mock;
};

interface TestResBody {
  ok?: boolean;
  error?: string;
  details?: unknown;
  userId?: string;
  isAdminView?: boolean;
  rows?: Array<{
    id: number;
    userId: string;
    opType: string;
    module: string;
    outcome: string;
    conflict: boolean;
    payloadSizeBytes: number | null;
    durationMs: number | null;
    createdAt: Date | string;
  }>;
  nextBeforeId?: number | null;
}

interface TestRes {
  statusCode: number;
  body: TestResBody;
  status(code: number): TestRes;
  json(payload: unknown): TestRes;
}

function makeRes(): TestRes & Response {
  const res: TestRes = {
    statusCode: 200,
    body: {} as TestResBody,
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(payload: unknown) {
      this.body = payload as TestRes["body"];
      return this;
    },
  };
  return res as TestRes & Response;
}

function makeReq(query: Record<string, string>, userId = "user_self"): Request {
  return {
    method: "GET",
    query,
    user: { id: userId },
  } as unknown as Request;
}

beforeEach(() => {
  // resetAllMocks (а не clearAllMocks!) — інакше непрожитий
  // mockResolvedValueOnce з попереднього тесту просочується у
  // наступний і ламає assert-и про rows.length / nextBeforeId.
  vi.resetAllMocks();
  // Reset env between tests — Object.assign because `env` is `as const`
  // at compile-time but a regular object at runtime.
  (env as unknown as { SYNC_AUDIT_ADMIN_USER_IDS: string }).SYNC_AUDIT_ADMIN_USER_IDS =
    "";
});

describe("isSyncAuditAdmin", () => {
  it("повертає false коли env-var порожній", () => {
    (env as unknown as { SYNC_AUDIT_ADMIN_USER_IDS: string }).SYNC_AUDIT_ADMIN_USER_IDS =
      "";
    expect(isSyncAuditAdmin("user_anyone")).toBe(false);
  });

  it("парсить comma-separated allow-list і трімить пробіли", () => {
    (env as unknown as { SYNC_AUDIT_ADMIN_USER_IDS: string }).SYNC_AUDIT_ADMIN_USER_IDS =
      " admin_a , admin_b ,, admin_c ";
    expect(isSyncAuditAdmin("admin_a")).toBe(true);
    expect(isSyncAuditAdmin("admin_b")).toBe(true);
    expect(isSyncAuditAdmin("admin_c")).toBe(true);
    expect(isSyncAuditAdmin("admin_d")).toBe(false);
    // empty string between двох ком — не має ламати фільтр.
    expect(isSyncAuditAdmin("")).toBe(false);
  });
});

describe("listSyncAudit — RLS gating", () => {
  it("self: повертає лише мій user_id навіть якщо я не адмін", async () => {
    pool.query.mockResolvedValueOnce({
      rows: [
        {
          id: "10",
          user_id: "user_self",
          op_type: "push",
          module: "finyk",
          outcome: "ok",
          conflict: false,
          payload_size_bytes: 123,
          duration_ms: 7,
          created_at: new Date("2026-04-01T00:00:00Z"),
        },
      ],
    });

    const res = makeRes();
    await listSyncAudit(makeReq({}), res);

    expect(res.statusCode).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.userId).toBe("user_self");
    expect(res.body.isAdminView).toBe(false);

    const [sql, params] = pool.query.mock.calls[0];
    expect(sql).toMatch(/FROM sync_audit_log/);
    expect(sql).toMatch(/user_id = \$1/);
    expect(params[0]).toBe("user_self");
    // BIGSERIAL → number у відповіді (Hard Rule #1).
    expect(res.body.rows![0].id).toBe(10);
    expect(typeof res.body.rows![0].id).toBe("number");
  });

  it("self via ?user_id=<self>: працює як self-mode (isAdminView=false)", async () => {
    pool.query.mockResolvedValueOnce({ rows: [] });

    const res = makeRes();
    await listSyncAudit(makeReq({ user_id: "user_self" }), res);

    expect(res.statusCode).toBe(200);
    expect(res.body.userId).toBe("user_self");
    expect(res.body.isAdminView).toBe(false);
    expect(logger.warn).not.toHaveBeenCalled();
  });

  it("non-admin запитує чужий user_id → 403 без подробиць", async () => {
    const res = makeRes();
    await listSyncAudit(
      makeReq({ user_id: "user_other" }, "user_self"),
      res,
    );

    expect(res.statusCode).toBe(403);
    expect(res.body.error).toBe("Forbidden");
    expect(pool.query).not.toHaveBeenCalled();
    // Лог: ми хочемо знати, хто намагався, для post-mortem-у.
    expect(logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({
        msg: "sync_audit_forbidden",
        actorId: "user_self",
        requestedUserId: "user_other",
      }),
    );
  });

  it("admin запитує чужий user_id → 200 + isAdminView=true", async () => {
    (env as unknown as { SYNC_AUDIT_ADMIN_USER_IDS: string }).SYNC_AUDIT_ADMIN_USER_IDS =
      "user_admin";
    pool.query.mockResolvedValueOnce({
      rows: [
        {
          id: "5",
          user_id: "user_other",
          op_type: "pull_all",
          module: "all",
          outcome: "ok",
          conflict: false,
          payload_size_bytes: null,
          duration_ms: 12,
          created_at: new Date("2026-04-01T00:00:00Z"),
        },
      ],
    });

    const res = makeRes();
    await listSyncAudit(
      makeReq({ user_id: "user_other" }, "user_admin"),
      res,
    );

    expect(res.statusCode).toBe(200);
    expect(res.body.userId).toBe("user_other");
    expect(res.body.isAdminView).toBe(true);
    expect(res.body.rows![0].userId).toBe("user_other");

    const [, params] = pool.query.mock.calls[0];
    expect(params[0]).toBe("user_other");
  });
});

describe("listSyncAudit — query filters", () => {
  it("підставляє op_type / outcome / module у WHERE", async () => {
    pool.query.mockResolvedValueOnce({ rows: [] });

    const res = makeRes();
    await listSyncAudit(
      makeReq({ op_type: "push", outcome: "conflict", module: "finyk" }),
      res,
    );

    const [sql, params] = pool.query.mock.calls[0];
    expect(sql).toMatch(/op_type = \$/);
    expect(sql).toMatch(/outcome = \$/);
    expect(sql).toMatch(/module = \$/);
    expect(params).toEqual([
      "user_self",
      "push",
      "conflict",
      "finyk",
      // limit
      50,
    ]);
    expect(res.statusCode).toBe(200);
  });

  it("обриває limit на максимумі (200)", async () => {
    pool.query.mockResolvedValueOnce({ rows: [] });

    const res = makeRes();
    await listSyncAudit(makeReq({ limit: "9999" }), res);

    expect(res.statusCode).toBe(400);
    expect(res.body.error).toBe("Invalid query");
  });

  it("дефолтний limit=50 коли клієнт не передає", async () => {
    pool.query.mockResolvedValueOnce({ rows: [] });

    const res = makeRes();
    await listSyncAudit(makeReq({}), res);

    const [, params] = pool.query.mock.calls[0];
    expect(params[params.length - 1]).toBe(50);
  });

  it("cursor: before_id → AND id < $N", async () => {
    pool.query.mockResolvedValueOnce({ rows: [] });

    const res = makeRes();
    await listSyncAudit(makeReq({ before_id: "100" }), res);

    const [sql, params] = pool.query.mock.calls[0];
    expect(sql).toMatch(/id < \$2/);
    expect(params[1]).toBe(100);
    expect(res.statusCode).toBe(200);
  });

  it("повертає nextBeforeId коли rows.length === limit", async () => {
    const rows = Array.from({ length: 50 }).map((_, i) => ({
      id: String(100 - i),
      user_id: "user_self",
      op_type: "push" as const,
      module: "finyk",
      outcome: "ok" as const,
      conflict: false,
      payload_size_bytes: 1,
      duration_ms: 1,
      created_at: new Date("2026-04-01T00:00:00Z"),
    }));
    pool.query.mockResolvedValueOnce({ rows });

    const res = makeRes();
    await listSyncAudit(makeReq({}), res);

    expect(res.body.rows).toHaveLength(50);
    // last row has id=51, тому next-page cursor — 51.
    expect(res.body.nextBeforeId).toBe(51);
  });

  it("nextBeforeId === null коли rows.length < limit", async () => {
    pool.query.mockResolvedValueOnce({
      rows: [
        {
          id: "1",
          user_id: "user_self",
          op_type: "push",
          module: "finyk",
          outcome: "ok",
          conflict: false,
          payload_size_bytes: 1,
          duration_ms: 1,
          created_at: new Date("2026-04-01T00:00:00Z"),
        },
      ],
    });

    const res = makeRes();
    await listSyncAudit(makeReq({}), res);

    expect(res.body.nextBeforeId).toBeNull();
  });
});

describe("listSyncAudit — invalid input", () => {
  it("op_type='garbage' → 400", async () => {
    const res = makeRes();
    await listSyncAudit(makeReq({ op_type: "garbage" }), res);

    expect(res.statusCode).toBe(400);
    expect(res.body.error).toBe("Invalid query");
    expect(pool.query).not.toHaveBeenCalled();
  });

  it("outcome='garbage' → 400", async () => {
    const res = makeRes();
    await listSyncAudit(makeReq({ outcome: "garbage" }), res);

    expect(res.statusCode).toBe(400);
    expect(pool.query).not.toHaveBeenCalled();
  });

  it("before_id='-5' → 400 (positive int)", async () => {
    const res = makeRes();
    await listSyncAudit(makeReq({ before_id: "-5" }), res);

    expect(res.statusCode).toBe(400);
    expect(pool.query).not.toHaveBeenCalled();
  });
});
