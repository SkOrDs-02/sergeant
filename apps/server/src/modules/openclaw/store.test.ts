import { describe, expect, it } from "vitest";
import type { Pool } from "pg";
import {
  attachDecisionPrUrl,
  finalizeInvocation,
  getDailyCostUsd,
  insertDecision,
  listRecentDecisions,
  listRecentInvocations,
  listRecentWriteAudits,
  openInvocation,
  recordWriteAudit,
  type RecordDecisionInput,
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

  it("throws if INSERT…RETURNING produced no rows (no silent defensive default)", async () => {
    // 2026-05-08 — раніше тест очікував defensive `return 0`, але
    // implementation давно кидає (як і sibling-и `openInvocation` /
    // `insertDecision` з тим самим `INSERT … RETURNING id` патерном).
    // Контракт єдиний на весь модуль: відсутня row-а з RETURNING — це
    // інваріант-вайолейшен бази, його треба підняти, а не маскувати
    // нулем (нуль-id потім ламає FK у downstream-аудитах).
    const { pool } = makeFakePool([]);
    await expect(recordWriteAudit(pool, baseInput())).rejects.toThrow(
      /INSERT RETURNING returned no rows/,
    );
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

function baseDecisionInput(): RecordDecisionInput {
  return {
    founderUserId: "user-1",
    topic: "pricing",
    context: "Q3 pricing review",
    decision: "raise Pro tier by 10%",
    rationale: "COGS increased",
  };
}

describe("openInvocation", () => {
  it("INSERTs into openclaw_invocations and coerces bigint id to number", async () => {
    const { pool, calls } = makeFakePool([{ id: "9001" }]);
    const id = await openInvocation(pool, {
      founderUserId: "user-1",
      founderTgUserId: 555,
      trigger: "dm",
      userMessage: "hi",
    });
    expect(id).toBe(9001);
    expect(typeof id).toBe("number");
    expect(calls[0]?.text).toMatch(/INSERT INTO openclaw_invocations/);
    expect(calls[0]?.values).toEqual(["user-1", 555, "dm", "hi", "{}"]);
  });

  it("serialises metadata as JSON when supplied", async () => {
    const { pool, calls } = makeFakePool([{ id: "1" }]);
    await openInvocation(pool, {
      founderUserId: "user-1",
      founderTgUserId: 555,
      trigger: "weekly_review",
      userMessage: "digest",
      metadata: { source: "weekly" },
    });
    expect(calls[0]?.values?.[4]).toBe(JSON.stringify({ source: "weekly" }));
  });

  it("throws if INSERT…RETURNING produced no rows", async () => {
    const { pool } = makeFakePool([]);
    await expect(
      openInvocation(pool, {
        founderUserId: "user-1",
        founderTgUserId: 555,
        trigger: "dm",
        userMessage: "hi",
      }),
    ).rejects.toThrow(/INSERT RETURNING returned no rows/);
  });
});

describe("finalizeInvocation", () => {
  it("UPDATEs openclaw_invocations with defaulted optional fields", async () => {
    const { pool, calls } = makeFakePool([]);
    await finalizeInvocation(pool, { invocationId: 7, status: "success" });
    expect(calls).toHaveLength(1);
    expect(calls[0]?.text).toMatch(/UPDATE openclaw_invocations/);
    const v = calls[0]?.values ?? [];
    expect(v[0]).toBe(7); // id
    expect(v[1]).toBe("success"); // status
    expect(v[2]).toBeNull(); // assistant_response
    expect(v[3]).toBe("[]"); // tool_calls
    expect(v[4]).toBe(0); // cost_usd
    expect(v[5]).toBe(0); // duration_ms
    expect(v[6]).toBe(0); // iterations
    expect(v[7]).toBeNull(); // error_message
    expect(v[8]).toBeNull(); // tone_mode
    expect(v[9]).toBe("{}"); // metadata patch
  });

  it("passes through supplied fields verbatim", async () => {
    const { pool, calls } = makeFakePool([]);
    await finalizeInvocation(pool, {
      invocationId: 8,
      status: "error",
      assistantResponse: "sorry, failed",
      toolCalls: [
        {
          tool: "pause_workflow",
          input: {},
          output_chars: 12,
          output_preview: "ok",
          status: "ok",
          duration_ms: 5,
        },
      ],
      costUsd: 0.42,
      durationMs: 1234,
      iterations: 3,
      errorMessage: "rate_limited",
      toneMode: "direct",
      metadataPatch: { retried: true },
    });
    const v = calls[0]?.values ?? [];
    expect(v[2]).toBe("sorry, failed");
    expect(v[3]).toBe(
      JSON.stringify([
        {
          tool: "pause_workflow",
          input: {},
          output_chars: 12,
          output_preview: "ok",
          status: "ok",
          duration_ms: 5,
        },
      ]),
    );
    expect(v[4]).toBe(0.42);
    expect(v[5]).toBe(1234);
    expect(v[6]).toBe(3);
    expect(v[7]).toBe("rate_limited");
    expect(v[8]).toBe("direct");
    expect(v[9]).toBe(JSON.stringify({ retried: true }));
  });
});

describe("getDailyCostUsd", () => {
  it("parses the COALESCE(SUM) text total to a float", async () => {
    const { pool, calls } = makeFakePool([{ total: "12.5000" }]);
    const total = await getDailyCostUsd(pool, "user-1", "Europe/Kyiv");
    expect(total).toBe(12.5);
    expect(calls[0]?.text).toMatch(/FROM openclaw_invocations/);
    expect(calls[0]?.values).toEqual(["user-1", "Europe/Kyiv"]);
  });

  it("defaults to 0 when no row is returned", async () => {
    const { pool } = makeFakePool([]);
    const total = await getDailyCostUsd(pool, "user-1", "Europe/Kyiv");
    expect(total).toBe(0);
  });
});

describe("insertDecision", () => {
  it("INSERTs into openclaw_decisions and coerces id to number", async () => {
    const { pool, calls } = makeFakePool([{ id: "55" }]);
    const id = await insertDecision(pool, baseDecisionInput());
    expect(id).toBe(55);
    expect(calls[0]?.text).toMatch(/INSERT INTO openclaw_decisions/);
  });

  it("nullifies alternatives/invocationId when not supplied", async () => {
    const { pool, calls } = makeFakePool([{ id: "1" }]);
    await insertDecision(pool, baseDecisionInput());
    const v = calls[0]?.values ?? [];
    expect(v[5]).toBeNull(); // alternatives
    expect(v[6]).toBeNull(); // invocation_id
  });

  it("throws if INSERT…RETURNING produced no rows", async () => {
    const { pool } = makeFakePool([]);
    await expect(insertDecision(pool, baseDecisionInput())).rejects.toThrow(
      /insertDecision: INSERT RETURNING returned no rows/,
    );
  });
});

describe("attachDecisionPrUrl", () => {
  it("UPDATEs git_pr_url for the decision id", async () => {
    const { pool, calls } = makeFakePool([]);
    await attachDecisionPrUrl(pool, 42, "https://github.com/o/r/pull/1");
    expect(calls[0]?.text).toMatch(
      /UPDATE openclaw_decisions SET git_pr_url = \$2 WHERE id = \$1/,
    );
    expect(calls[0]?.values).toEqual([42, "https://github.com/o/r/pull/1"]);
  });

  it("allows a NULL update for retry-flow", async () => {
    const { pool, calls } = makeFakePool([]);
    await attachDecisionPrUrl(pool, 42, null);
    expect(calls[0]?.values).toEqual([42, null]);
  });
});

describe("listRecentDecisions", () => {
  it("SELECTs from openclaw_decisions ordered newest-first, clamping limit", async () => {
    const { pool, calls } = makeFakePool([]);
    await listRecentDecisions(pool, "user-1", 9_999);
    expect(calls[0]?.text).toMatch(/FROM openclaw_decisions/);
    expect(calls[0]?.text).toMatch(/ORDER BY decided_at DESC/);
    expect(calls[0]?.values).toEqual(["user-1", 50]);
  });

  it("clamps limit to at least 1", async () => {
    const { pool, calls } = makeFakePool([]);
    await listRecentDecisions(pool, "user-1", -3);
    expect(calls[0]?.values).toEqual(["user-1", 1]);
  });

  it("normalises row shape — bigint→number, Date→ISO, nullable invocation_id", async () => {
    const decidedAt = new Date("2026-04-01T12:00:00.000Z");
    const { pool } = makeFakePool([
      {
        id: "3",
        decided_at: decidedAt,
        founder_user_id: "user-1",
        topic: "pricing",
        context: "ctx",
        decision: "raise price",
        rationale: "costs",
        alternatives: null,
        git_pr_url: null,
        invocation_id: "9",
        metadata: null,
      },
    ]);
    const out = await listRecentDecisions(pool, "user-1", 10);
    const r = out[0]!;
    expect(r.id).toBe(3);
    expect(typeof r.id).toBe("number");
    expect(r.decided_at).toBe("2026-04-01T12:00:00.000Z");
    expect(r.invocation_id).toBe(9);
    expect(r.metadata).toEqual({});
  });

  it("passes through invocation_id null and a string decided_at as-is", async () => {
    const { pool } = makeFakePool([
      {
        id: "1",
        decided_at: "2026-04-01T12:00:00.000Z",
        founder_user_id: "user-1",
        topic: "t",
        context: "c",
        decision: "d",
        rationale: "r",
        alternatives: "alt",
        git_pr_url: "https://example.com/pr/1",
        invocation_id: null,
        metadata: { a: 1 },
      },
    ]);
    const out = await listRecentDecisions(pool, "user-1", 10);
    const r = out[0]!;
    expect(r.decided_at).toBe("2026-04-01T12:00:00.000Z");
    expect(r.invocation_id).toBeNull();
    expect(r.alternatives).toBe("alt");
    expect(r.git_pr_url).toBe("https://example.com/pr/1");
    expect(r.metadata).toEqual({ a: 1 });
  });
});

describe("listRecentInvocations", () => {
  it("SELECTs from openclaw_invocations ordered newest-first, clamping limit", async () => {
    const { pool, calls } = makeFakePool([]);
    await listRecentInvocations(pool, "user-1", 500);
    expect(calls[0]?.text).toMatch(/FROM openclaw_invocations/);
    expect(calls[0]?.text).toMatch(/ORDER BY invoked_at DESC/);
    expect(calls[0]?.values).toEqual(["user-1", 100]);
  });

  it("clamps limit to at least 1", async () => {
    const { pool, calls } = makeFakePool([]);
    await listRecentInvocations(pool, "user-1", 0);
    expect(calls[0]?.values).toEqual(["user-1", 1]);
  });

  it("normalises row shape — bigint→number, Date→ISO, cost_usd parsed as float", async () => {
    const invokedAt = new Date("2026-04-02T08:00:00.000Z");
    const { pool } = makeFakePool([
      {
        id: "11",
        invoked_at: invokedAt,
        trigger: "dm",
        user_message: "hi",
        status: "success",
        cost_usd: "0.0850",
        duration_ms: "1200",
        iterations: "2",
        tone_mode: "direct",
      },
    ]);
    const out = await listRecentInvocations(pool, "user-1", 5);
    const r = out[0]!;
    expect(r.id).toBe(11);
    expect(r.invoked_at).toBe("2026-04-02T08:00:00.000Z");
    expect(r.cost_usd).toBeCloseTo(0.085);
    expect(r.duration_ms).toBe(1200);
    expect(r.iterations).toBe(2);
    expect(r.tone_mode).toBe("direct");
  });

  it("defaults duration_ms/iterations to 0 when missing and preserves string invoked_at", async () => {
    const { pool } = makeFakePool([
      {
        id: "12",
        invoked_at: "2026-04-02T08:00:00.000Z",
        trigger: "monthly_okr",
        user_message: "digest",
        status: "allowlist_fail",
        cost_usd: null,
        duration_ms: null,
        iterations: null,
        tone_mode: null,
      },
    ]);
    const out = await listRecentInvocations(pool, "user-1", 5);
    const r = out[0]!;
    expect(r.invoked_at).toBe("2026-04-02T08:00:00.000Z");
    expect(r.duration_ms).toBe(0);
    expect(r.iterations).toBe(0);
    expect(r.cost_usd).toBe(0);
    expect(r.tone_mode).toBeNull();
  });
});
