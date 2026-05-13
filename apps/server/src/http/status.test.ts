import { describe, it, expect, vi } from "vitest";
import {
  BOT_OPERATIONAL_WINDOW_MS,
  N8N_DEGRADED_THRESHOLD,
  N8N_RECENT_WINDOW_MS,
  buildStatusResponse,
  computeOverallStatus,
} from "./status.js";

/**
 * Unit tests for `/api/status` (PR-41).
 *
 * Covers:
 *   1. `computeOverallStatus` compound logic (any-down ⇒ down,
 *      any-degraded ⇒ degraded, all-operational ⇒ operational).
 *   2. `buildStatusResponse` per-component signal:
 *      - database probe `SELECT 1` success ⇒ operational, failure ⇒ down
 *      - n8n failure-event burst ⇒ degraded (>= threshold), single
 *        failure stays operational
 *      - console-bot last-invocation within 24 h ⇒ operational, older
 *        ⇒ degraded (idle).
 *   3. `lastIncident` is populated from the most recent
 *      `n8n_failure_events.created_at` in the 7-day lookback.
 *   4. L7 info-leak invariant: response shape MUST NOT contain
 *      `commit`/`sha`/`version`/`build`/`buildDate`/`buildSha`/
 *      `gitSha`/`release` keys at any depth.
 */

interface FakeQueryArgs {
  sql: string;
  params: unknown[];
}

interface FakeQueryRule {
  match: RegExp | string;
  rows?: Array<Record<string, unknown>>;
  reject?: Error;
}

// `DbPool` (in `status.ts`) carries a generic query-method, so the
// caller decides the row shape (`pool.query<{count: string}>(...)`).
// The fake mirrors that signature with an `unknown`-rowed default so
// strict-mode generic narrowing at each call-site type-checks.
interface FakePool {
  query<T extends Record<string, unknown> = Record<string, unknown>>(
    sql: string,
    params?: unknown[],
  ): Promise<{ rows: T[] }>;
  calls: FakeQueryArgs[];
}

function fakePool(rules: FakeQueryRule[]): FakePool {
  const calls: FakeQueryArgs[] = [];
  async function query<
    T extends Record<string, unknown> = Record<string, unknown>,
  >(sql: string, params: unknown[] = []): Promise<{ rows: T[] }> {
    calls.push({ sql, params });
    for (const rule of rules) {
      const matched =
        rule.match instanceof RegExp
          ? rule.match.test(sql)
          : sql.includes(rule.match);
      if (matched) {
        if (rule.reject) throw rule.reject;
        return { rows: (rule.rows ?? []) as T[] };
      }
    }
    return { rows: [] };
  }
  return { calls, query: vi.fn(query) as FakePool["query"] };
}

const FIXED_NOW = new Date("2026-05-13T12:00:00.000Z");
const FORBIDDEN_KEYS = new Set([
  "commit",
  "sha",
  "version",
  "build",
  "buildDate",
  "buildSha",
  "gitSha",
  "release",
]);

function assertNoForbiddenKeys(value: unknown, path: string[] = []): void {
  if (Array.isArray(value)) {
    value.forEach((v, i) => assertNoForbiddenKeys(v, [...path, `[${i}]`]));
    return;
  }
  if (value && typeof value === "object") {
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      expect(
        FORBIDDEN_KEYS.has(k),
        `forbidden key "${k}" present at ${[...path, k].join(".")}`,
      ).toBe(false);
      assertNoForbiddenKeys(v, [...path, k]);
    }
  }
}

describe("computeOverallStatus", () => {
  it("returns operational when every component is operational", () => {
    expect(
      computeOverallStatus([
        { status: "operational" },
        { status: "operational" },
        { status: "operational" },
      ]),
    ).toBe("operational");
  });

  it("returns degraded when at least one component is degraded and none are down", () => {
    expect(
      computeOverallStatus([
        { status: "operational" },
        { status: "degraded" },
        { status: "operational" },
      ]),
    ).toBe("degraded");
  });

  it("returns down when at least one component is down regardless of others", () => {
    expect(
      computeOverallStatus([
        { status: "operational" },
        { status: "degraded" },
        { status: "down" },
      ]),
    ).toBe("down");
    expect(
      computeOverallStatus([{ status: "down" }, { status: "operational" }]),
    ).toBe("down");
  });

  it("handles empty input", () => {
    expect(computeOverallStatus([])).toBe("operational");
  });
});

describe("buildStatusResponse", () => {
  it("returns all-operational shape when DB ping succeeds, no n8n bursts, recent bot activity", async () => {
    const recentBot = new Date(FIXED_NOW.getTime() - 60_000).toISOString();
    const pool = fakePool([
      { match: "SELECT 1", rows: [{ ok: 1 }] },
      { match: /COUNT\(\*\)/, rows: [{ count: "0" }] },
      { match: /FROM n8n_failure_events/i, rows: [] },
      {
        match: /FROM openclaw_invocations/i,
        rows: [{ invoked_at: recentBot }],
      },
    ]);

    const body = await buildStatusResponse(pool, { now: FIXED_NOW });

    expect(body.status).toBe("operational");
    expect(body.timestamp).toBe(FIXED_NOW.toISOString());
    expect(body.components.map((c) => c.id)).toEqual([
      "server",
      "database",
      "n8n",
      "console-bot",
    ]);
    expect(body.components.every((c) => c.status === "operational")).toBe(true);
    expect(body.lastIncident).toBeNull();
  });

  it("marks database down when SELECT 1 throws", async () => {
    const pool = fakePool([
      { match: "SELECT 1", reject: new Error("connection refused") },
      { match: /COUNT\(\*\)/, rows: [{ count: "0" }] },
      { match: /FROM n8n_failure_events/i, rows: [] },
      { match: /FROM openclaw_invocations/i, rows: [] },
    ]);

    const body = await buildStatusResponse(pool, { now: FIXED_NOW });

    const dbRow = body.components.find((c) => c.id === "database");
    expect(dbRow?.status).toBe("down");
    expect(body.status).toBe("down");
  });

  it("marks n8n degraded once recent failure count crosses threshold", async () => {
    const recentBot = new Date(FIXED_NOW.getTime() - 60_000).toISOString();
    const pool = fakePool([
      { match: "SELECT 1", rows: [{ ok: 1 }] },
      {
        match: /COUNT\(\*\)/,
        rows: [{ count: String(N8N_DEGRADED_THRESHOLD) }],
      },
      {
        match: /FROM n8n_failure_events/i,
        rows: [
          {
            created_at: new Date(FIXED_NOW.getTime() - 1_000).toISOString(),
          },
        ],
      },
      {
        match: /FROM openclaw_invocations/i,
        rows: [{ invoked_at: recentBot }],
      },
    ]);

    const body = await buildStatusResponse(pool, { now: FIXED_NOW });
    const n8n = body.components.find((c) => c.id === "n8n");
    expect(n8n?.status).toBe("degraded");
    expect(body.status).toBe("degraded");
    expect(body.lastIncident?.component).toBe("n8n");
  });

  it("keeps n8n operational when a single failure was recorded (below threshold)", async () => {
    const recentBot = new Date(FIXED_NOW.getTime() - 60_000).toISOString();
    const olderIncident = new Date(
      FIXED_NOW.getTime() - N8N_RECENT_WINDOW_MS - 60_000,
    ).toISOString();
    const pool = fakePool([
      { match: "SELECT 1", rows: [{ ok: 1 }] },
      { match: /COUNT\(\*\)/, rows: [{ count: "1" }] },
      {
        match: /FROM n8n_failure_events/i,
        rows: [{ created_at: olderIncident }],
      },
      {
        match: /FROM openclaw_invocations/i,
        rows: [{ invoked_at: recentBot }],
      },
    ]);

    const body = await buildStatusResponse(pool, { now: FIXED_NOW });
    expect(body.components.find((c) => c.id === "n8n")?.status).toBe(
      "operational",
    );
    expect(body.status).toBe("operational");
    // Still surfaces the last incident timestamp.
    expect(body.lastIncident?.at).toBe(olderIncident);
  });

  it("marks console-bot degraded when last invocation is older than the operational window", async () => {
    const staleBot = new Date(
      FIXED_NOW.getTime() - BOT_OPERATIONAL_WINDOW_MS - 60_000,
    ).toISOString();
    const pool = fakePool([
      { match: "SELECT 1", rows: [{ ok: 1 }] },
      { match: /COUNT\(\*\)/, rows: [{ count: "0" }] },
      { match: /FROM n8n_failure_events/i, rows: [] },
      { match: /FROM openclaw_invocations/i, rows: [{ invoked_at: staleBot }] },
    ]);

    const body = await buildStatusResponse(pool, { now: FIXED_NOW });
    expect(body.components.find((c) => c.id === "console-bot")?.status).toBe(
      "degraded",
    );
    expect(body.status).toBe("degraded");
  });

  it("marks console-bot degraded when there are no invocations at all (table empty)", async () => {
    const pool = fakePool([
      { match: "SELECT 1", rows: [{ ok: 1 }] },
      { match: /COUNT\(\*\)/, rows: [{ count: "0" }] },
      { match: /FROM n8n_failure_events/i, rows: [] },
      { match: /FROM openclaw_invocations/i, rows: [] },
    ]);
    const body = await buildStatusResponse(pool, { now: FIXED_NOW });
    expect(body.components.find((c) => c.id === "console-bot")?.status).toBe(
      "degraded",
    );
  });

  it("L7 info-leak: response shape contains no commit/sha/version/build keys", async () => {
    const recentBot = new Date(FIXED_NOW.getTime() - 60_000).toISOString();
    const pool = fakePool([
      { match: "SELECT 1", rows: [{ ok: 1 }] },
      { match: /COUNT\(\*\)/, rows: [{ count: "0" }] },
      { match: /FROM n8n_failure_events/i, rows: [] },
      {
        match: /FROM openclaw_invocations/i,
        rows: [{ invoked_at: recentBot }],
      },
    ]);
    const body = await buildStatusResponse(pool, { now: FIXED_NOW });
    assertNoForbiddenKeys(body);
  });

  it("accepts Date objects (not only ISO strings) returned by pg", async () => {
    const recentBot = new Date(FIXED_NOW.getTime() - 60_000);
    const recentIncident = new Date(FIXED_NOW.getTime() - 2_000);
    const pool = fakePool([
      { match: "SELECT 1", rows: [{ ok: 1 }] },
      { match: /COUNT\(\*\)/, rows: [{ count: "0" }] },
      {
        match: /FROM n8n_failure_events/i,
        rows: [{ created_at: recentIncident }],
      },
      {
        match: /FROM openclaw_invocations/i,
        rows: [{ invoked_at: recentBot }],
      },
    ]);
    const body = await buildStatusResponse(pool, { now: FIXED_NOW });
    expect(body.components.find((c) => c.id === "console-bot")?.status).toBe(
      "operational",
    );
    expect(body.lastIncident?.at).toBe(recentIncident.toISOString());
  });
});
