import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Contract for `apps/server/src/modules/push/audit.ts` — the M14
 * append-only audit writer.
 *
 * The two surfaces under test:
 *
 *   1. `hashPushPayload(...)` — SHA-256 over canonical JSON. Must be
 *      stable across permuted top-level key orders so a flooder cannot
 *      bypass the audit hash by reordering `{title, body}` →
 *      `{body, title}`. Different payloads must hash differently.
 *   2. `logPushSend(...)` — best-effort INSERT path. We mock `pool.query`
 *      and `logger` to assert:
 *        a. the query SQL targets `push_send_audit` with the expected
 *           param positions (caller_ip → $1::inet, etc),
 *        b. SQLSTATE `42P01` (table missing) logs once and swallows the
 *           error,
 *        c. unrelated Postgres errors log every time but still swallow,
 *        d. successful inserts log nothing.
 *
 * We mock `pool` rather than spinning up a real Postgres because the
 * integration of the SQL against a fresh database is already covered by
 * the migration round-trip suite (`__tests__/041-push-send-audit.test
 * .ts`). This test file exists for handler-side semantics: the swallow
 * contract and the canonical-hash invariants.
 */

const queryMock = vi.fn();
const loggerMock = {
  debug: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  fatal: vi.fn(),
};

vi.mock("../../db.js", () => ({
  default: { query: queryMock },
  pool: { query: queryMock },
}));
vi.mock("../../obs/logger.js", async () => {
  const actual = await vi.importActual("../../obs/logger.js");
  return { ...actual, logger: loggerMock };
});

beforeEach(() => {
  queryMock.mockReset();
  loggerMock.warn.mockReset();
  loggerMock.error.mockReset();
});

describe("hashPushPayload", () => {
  it("returns a stable hex SHA-256 digest", async () => {
    const { hashPushPayload } = await import("./audit.js");
    const got = hashPushPayload({ title: "hi", body: "hello" });
    expect(got).toMatch(/^[0-9a-f]{64}$/);
  });

  it("is independent of top-level key order", async () => {
    const { hashPushPayload } = await import("./audit.js");
    const a = hashPushPayload({ title: "hi", body: "hello" });
    const b = hashPushPayload({ body: "hello", title: "hi" });
    expect(a).toBe(b);
  });

  it("differs when payload content differs", async () => {
    const { hashPushPayload } = await import("./audit.js");
    const a = hashPushPayload({ title: "hi", body: "hello" });
    const b = hashPushPayload({ title: "hi", body: "HELLO" });
    expect(a).not.toBe(b);
  });

  it("hashes primitives without throwing", async () => {
    const { hashPushPayload } = await import("./audit.js");
    expect(hashPushPayload(null)).toMatch(/^[0-9a-f]{64}$/);
    expect(hashPushPayload("str")).toMatch(/^[0-9a-f]{64}$/);
    expect(hashPushPayload(42)).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe("logPushSend — happy path", () => {
  it("INSERTs into push_send_audit with the expected param shape", async () => {
    queryMock.mockResolvedValue({ rows: [], rowCount: 1 });
    const { logPushSend } = await import("./audit.js");
    await logPushSend({
      callerIp: "10.0.0.5",
      targetUserId: "user-uuid-1",
      notificationType: "finyk",
      payload: { title: "hi", body: "hello" },
      subsCount: 3,
      sentCount: 2,
    });
    expect(queryMock).toHaveBeenCalledTimes(1);
    const [sql, params] = queryMock.mock.calls[0];
    expect(sql).toMatch(/INSERT INTO push_send_audit/i);
    expect(sql).toMatch(/\$1::inet/);
    expect(params).toEqual([
      "10.0.0.5",
      "user-uuid-1",
      "finyk",
      expect.stringMatching(/^[0-9a-f]{64}$/),
      3,
      2,
    ]);
    expect(loggerMock.warn).not.toHaveBeenCalled();
    expect(loggerMock.error).not.toHaveBeenCalled();
  });

  it("nullable caller_ip and notification_type pass through as null", async () => {
    queryMock.mockResolvedValue({ rows: [], rowCount: 1 });
    const { logPushSend } = await import("./audit.js");
    await logPushSend({
      callerIp: null,
      targetUserId: "u",
      notificationType: null,
      payload: {},
      subsCount: 0,
      sentCount: 0,
    });
    const [, params] = queryMock.mock.calls[0];
    expect(params[0]).toBeNull();
    expect(params[2]).toBeNull();
  });
});

describe("logPushSend — error swallowing", () => {
  it("SQLSTATE 42P01 logs warn once and does not throw", async () => {
    const tableMissing = Object.assign(new Error("relation missing"), {
      code: "42P01",
    });
    queryMock.mockRejectedValue(tableMissing);
    const { logPushSend, __resetAuditWarnForTests } =
      await import("./audit.js");
    __resetAuditWarnForTests();

    await expect(
      logPushSend({
        callerIp: "10.0.0.5",
        targetUserId: "u",
        notificationType: null,
        payload: {},
        subsCount: 0,
        sentCount: 0,
      }),
    ).resolves.toBeUndefined();
    await logPushSend({
      callerIp: "10.0.0.5",
      targetUserId: "u",
      notificationType: null,
      payload: {},
      subsCount: 0,
      sentCount: 0,
    });

    // Two failed inserts but only one warn line — by design.
    expect(loggerMock.warn).toHaveBeenCalledTimes(1);
    expect(loggerMock.warn.mock.calls[0][0]).toMatchObject({
      msg: "push_send_audit_table_missing",
    });
  });

  it("non-42P01 errors warn every time and do not throw", async () => {
    const generic = Object.assign(new Error("connection refused"), {
      code: "08006",
    });
    queryMock.mockRejectedValue(generic);
    const { logPushSend } = await import("./audit.js");

    await logPushSend({
      callerIp: "10.0.0.5",
      targetUserId: "u",
      notificationType: null,
      payload: {},
      subsCount: 0,
      sentCount: 0,
    });
    await logPushSend({
      callerIp: "10.0.0.5",
      targetUserId: "u",
      notificationType: null,
      payload: {},
      subsCount: 0,
      sentCount: 0,
    });

    expect(loggerMock.warn).toHaveBeenCalledTimes(2);
    expect(loggerMock.warn.mock.calls[0][0]).toMatchObject({
      msg: "push_send_audit_write_failed",
      code: "08006",
    });
  });
});
