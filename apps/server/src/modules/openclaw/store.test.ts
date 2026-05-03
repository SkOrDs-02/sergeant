import { describe, expect, it } from "vitest";
import type { Pool } from "pg";
import {
  listRecentWriteAudits,
  recordWriteAudit,
  type RecordWriteAuditInput,
} from "./store.js";

/**
 * Unit-tests for `openclaw_write_audit` helpers (ADR-0037, Phase 4.5).
 *
 * Pure SQL-shape checks via fake `pg.Pool`. We assert the SQL text-shape
 * (INSERT vs SELECT, table name, presence/absence of optional WHERE
 * clauses), parameter ordering, and value coercion so a future refactor
 * doesn't silently drop a filter or break the bigint→number contract
 * (AGENTS.md hard-rule #1).
 *
 * Real INSERT/SELECT roundtrip is exercised by integration migrations
 * + `pnpm ops:migrate:dryrun` — out of unit-test scope.
 */

interface RecordedCall {
  text: string;
  values: unknown[];
}

function makeFakePool(rows: Record<string, unknown>[] = []): {
  pool: Pool;
  calls: RecordedCall[];
} {
  const calls: RecordedCall[] = [];
  const pool = {
    async query(text: string, values: unknown[]) {
      calls.push({ text, values });
      return { rows, rowCount: rows.length };
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any as Pool;
  return { pool, calls };
}

function baseInput(): RecordWriteAuditInput {
  return {
    approvalId: "abc12345",
    tool: "post_to_topic",
    founderUserId: "user-1",
    founderTgUserId: 12345,
    action: "approved",
    input: { topic: "ops", text: "hi" },
    persona: "ops",
  };
}

describe("recordWriteAudit", () => {
  it("INSERTs into openclaw_write_audit and returns the new id (bigint→number)", async () => {
    const { pool, calls } = makeFakePool([{ id: "42" }]);
    const id = await recordWriteAudit(pool, baseInput());
    expect(id).toBe(42);
    expect(calls).toHaveLength(1);
    expect(calls[0]?.text).toMatch(/INSERT INTO openclaw_write_audit/);
  });

  it("returns 0 if INSERT…RETURNING produced no rows (defensive default)", async () => {
    const { pool } = makeFakePool([]);
    const id = await recordWriteAudit(pool, baseInput());
    expect(id).toBe(0);
  });

  it("passes core columns in fixed positional order", async () => {
    const { pool, calls } = makeFakePool([{ id: "1" }]);
    await recordWriteAudit(pool, baseInput());
    const v = calls[0]?.values ?? [];
    expect(v[0]).toBe("abc12345"); // approval_id
    expect(v[1]).toBe("post_to_topic"); // tool
    expect(v[2]).toBe("user-1"); // founder_user_id
    expect(v[3]).toBe(12345); // founder_tg_user_id
    expect(v[5]).toBe("approved"); // action
  });

  it("nullifies optional columns when not supplied (rejected/approved row)", async () => {
    const { pool, calls } = makeFakePool([{ id: "1" }]);
    await recordWriteAudit(pool, baseInput());
    const v = calls[0]?.values ?? [];
    expect(v[4]).toBeNull(); // invocation_id
    expect(v[7]).toBeNull(); // http_status
    expect(v[8]).toBeNull(); // ok
    expect(v[9]).toBeNull(); // response_excerpt
  });

  it("serialises input as JSON in $7", async () => {
    const { pool, calls } = makeFakePool([{ id: "1" }]);
    await recordWriteAudit(pool, {
      ...baseInput(),
      input: { topic: "ops", text: "hello world" },
    });
    expect(calls[0]?.values?.[6]).toBe(
      JSON.stringify({ topic: "ops", text: "hello world" }),
    );
  });

  it("defaults input to {} when not supplied", async () => {
    const { pool, calls } = makeFakePool([{ id: "1" }]);
    const { input: _omitted, ...rest } = baseInput();
    void _omitted;
    await recordWriteAudit(pool, rest);
    expect(calls[0]?.values?.[6]).toBe("{}");
  });

  it("persists executed-row fields (httpStatus / ok / responseExcerpt)", async () => {
    const { pool, calls } = makeFakePool([{ id: "1" }]);
    await recordWriteAudit(pool, {
      ...baseInput(),
      action: "executed",
      httpStatus: 200,
      ok: true,
      responseExcerpt: '{"ok":true,"id":7}',
    });
    const v = calls[0]?.values ?? [];
    expect(v[7]).toBe(200);
    expect(v[8]).toBe(true);
    expect(v[9]).toBe('{"ok":true,"id":7}');
  });

  it("truncates response_excerpt above 4096 bytes (server-side cap)", async () => {
    const { pool, calls } = makeFakePool([{ id: "1" }]);
    const huge = "x".repeat(5_000);
    await recordWriteAudit(pool, {
      ...baseInput(),
      action: "executed",
      httpStatus: 502,
      ok: false,
      responseExcerpt: huge,
    });
    const v = calls[0]?.values ?? [];
    expect(typeof v[9]).toBe("string");
    expect((v[9] as string).length).toBe(4_096);
  });

  it("preserves response_excerpt at-or-under the cap exactly", async () => {
    const { pool, calls } = makeFakePool([{ id: "1" }]);
    const exactly = "y".repeat(4_096);
    await recordWriteAudit(pool, {
      ...baseInput(),
      action: "executed",
      httpStatus: 200,
      ok: true,
      responseExcerpt: exactly,
    });
    expect((calls[0]?.values?.[9] as string).length).toBe(4_096);
  });

  it("persists persona in $11 (last positional column before metadata)", async () => {
    const { pool, calls } = makeFakePool([{ id: "1" }]);
    await recordWriteAudit(pool, { ...baseInput(), persona: "growth" });
    expect(calls[0]?.values?.[10]).toBe("growth");
  });

  it("nullifies persona when not provided", async () => {
    const { pool, calls } = makeFakePool([{ id: "1" }]);
    const { persona: _p, ...rest } = baseInput();
    void _p;
    await recordWriteAudit(pool, rest);
    expect(calls[0]?.values?.[10]).toBeNull();
  });
});

describe("listRecentWriteAudits", () => {
  it("SELECT-s from openclaw_write_audit ordered newest-first", async () => {
    const { pool, calls } = makeFakePool([]);
    await listRecentWriteAudits(pool, { founderUserId: "u" });
    expect(calls).toHaveLength(1);
    expect(calls[0]?.text).toMatch(/FROM openclaw_write_audit/);
    expect(calls[0]?.text).toMatch(/ORDER BY recorded_at DESC/);
  });

  it("filters by founder_user_id always (single-tenant safety)", async () => {
    const { pool, calls } = makeFakePool([]);
    await listRecentWriteAudits(pool, { founderUserId: "user-1" });
    expect(calls[0]?.text).toMatch(/founder_user_id = \$1/);
    expect(calls[0]?.values?.[0]).toBe("user-1");
  });

  it("does not include tool/action/persona conditions when no filters set", async () => {
    const { pool, calls } = makeFakePool([]);
    await listRecentWriteAudits(pool, { founderUserId: "u" });
    expect(calls[0]?.text).not.toMatch(/tool = /);
    expect(calls[0]?.text).not.toMatch(/action = /);
    expect(calls[0]?.text).not.toMatch(/persona = /);
  });

  it("appends tool filter as next bind", async () => {
    const { pool, calls } = makeFakePool([]);
    await listRecentWriteAudits(pool, {
      founderUserId: "u",
      tool: "pause_workflow",
    });
    expect(calls[0]?.text).toMatch(/tool = \$2/);
    expect(calls[0]?.values?.[1]).toBe("pause_workflow");
  });

  it("combines tool + action filters in stable order", async () => {
    const { pool, calls } = makeFakePool([]);
    await listRecentWriteAudits(pool, {
      founderUserId: "u",
      tool: "post_to_topic",
      action: "executed",
    });
    expect(calls[0]?.text).toMatch(/tool = \$2/);
    expect(calls[0]?.text).toMatch(/action = \$3/);
    expect(calls[0]?.values?.[1]).toBe("post_to_topic");
    expect(calls[0]?.values?.[2]).toBe("executed");
  });

  it("appends persona filter and shifts limit-position accordingly", async () => {
    const { pool, calls } = makeFakePool([]);
    await listRecentWriteAudits(pool, {
      founderUserId: "u",
      persona: "ops",
      limit: 5,
    });
    // params: [u, ops, 5]
    expect(calls[0]?.text).toMatch(/persona = \$2/);
    expect(calls[0]?.text).toMatch(/LIMIT \$3/);
    expect(calls[0]?.values).toEqual(["u", "ops", 5]);
  });

  it("clamps limit to [1, 100]", async () => {
    const { pool, calls } = makeFakePool([]);
    await listRecentWriteAudits(pool, {
      founderUserId: "u",
      limit: 9_999,
    });
    expect(calls[0]?.values?.at(-1)).toBe(100);

    await listRecentWriteAudits(pool, { founderUserId: "u", limit: 0 });
    expect(calls[1]?.values?.at(-1)).toBe(1);

    await listRecentWriteAudits(pool, { founderUserId: "u", limit: -7 });
    expect(calls[2]?.values?.at(-1)).toBe(1);
  });

  it("defaults limit to 20 when unspecified", async () => {
    const { pool, calls } = makeFakePool([]);
    await listRecentWriteAudits(pool, { founderUserId: "u" });
    expect(calls[0]?.values?.at(-1)).toBe(20);
  });

  it("normalises row shape — bigint→number, dates → ISO, JSONB defaults", async () => {
    const recordedAt = new Date("2026-05-03T10:00:00.000Z");
    const { pool } = makeFakePool([
      {
        id: "12345",
        recorded_at: recordedAt,
        approval_id: "abc",
        tool: "post_to_topic",
        founder_user_id: "u",
        founder_tg_user_id: "67890", // pg returns BIGINT as string by default
        invocation_id: "777",
        action: "executed",
        input: { topic: "ops", text: "x" },
        http_status: 200,
        ok: true,
        response_excerpt: "ok",
        persona: "ops",
        metadata: null,
      },
    ]);
    const out = await listRecentWriteAudits(pool, { founderUserId: "u" });
    expect(out).toHaveLength(1);
    const r = out[0]!;
    expect(r.id).toBe(12345);
    expect(typeof r.id).toBe("number");
    expect(r.founder_tg_user_id).toBe(67890);
    expect(typeof r.founder_tg_user_id).toBe("number");
    expect(r.invocation_id).toBe(777);
    expect(r.recorded_at).toBe("2026-05-03T10:00:00.000Z");
    expect(r.action).toBe("executed");
    expect(r.input).toEqual({ topic: "ops", text: "x" });
    expect(r.http_status).toBe(200);
    expect(r.ok).toBe(true);
    expect(r.persona).toBe("ops");
    // metadata=null → coerced to {} for safe consumer iteration.
    expect(r.metadata).toEqual({});
  });

  it("appends recordedAfter as `recorded_at >= $N` and shifts limit-position", async () => {
    const { pool, calls } = makeFakePool([]);
    const cutoff = new Date("2026-05-01T00:00:00.000Z");
    await listRecentWriteAudits(pool, {
      founderUserId: "u",
      recordedAfter: cutoff,
      limit: 50,
    });
    // params: [u, cutoff, 50]
    expect(calls[0]?.text).toMatch(/recorded_at >= \$2/);
    expect(calls[0]?.text).toMatch(/LIMIT \$3/);
    expect(calls[0]?.values).toEqual(["u", cutoff, 50]);
  });

  it("composes recordedAfter with tool/action/persona filters", async () => {
    const { pool, calls } = makeFakePool([]);
    const cutoff = new Date("2026-05-01T00:00:00.000Z");
    await listRecentWriteAudits(pool, {
      founderUserId: "u",
      tool: "post_to_topic",
      action: "executed",
      persona: "ops",
      recordedAfter: cutoff,
      limit: 7,
    });
    // params: [u, post_to_topic, executed, ops, cutoff, 7]
    expect(calls[0]?.text).toMatch(/tool = \$2/);
    expect(calls[0]?.text).toMatch(/action = \$3/);
    expect(calls[0]?.text).toMatch(/persona = \$4/);
    expect(calls[0]?.text).toMatch(/recorded_at >= \$5/);
    expect(calls[0]?.text).toMatch(/LIMIT \$6/);
    expect(calls[0]?.values).toEqual([
      "u",
      "post_to_topic",
      "executed",
      "ops",
      cutoff,
      7,
    ]);
  });

  it("omits recordedAfter clause when filter is undefined", async () => {
    const { pool, calls } = makeFakePool([]);
    await listRecentWriteAudits(pool, { founderUserId: "u" });
    expect(calls[0]?.text).not.toMatch(/recorded_at >=/);
  });

  it("preserves nulls for invocation_id/http_status/ok/response_excerpt/persona", async () => {
    const { pool } = makeFakePool([
      {
        id: "1",
        recorded_at: "2026-05-03T10:00:00.000Z",
        approval_id: "a",
        tool: "create_github_issue",
        founder_user_id: "u",
        founder_tg_user_id: "1",
        invocation_id: null,
        action: "rejected",
        input: {},
        http_status: null,
        ok: null,
        response_excerpt: null,
        persona: null,
        metadata: {},
      },
    ]);
    const out = await listRecentWriteAudits(pool, { founderUserId: "u" });
    const r = out[0]!;
    expect(r.invocation_id).toBeNull();
    expect(r.http_status).toBeNull();
    expect(r.ok).toBeNull();
    expect(r.response_excerpt).toBeNull();
    expect(r.persona).toBeNull();
  });
});
