import { describe, expect, it, vi } from "vitest";
import type { Pool, PoolClient } from "pg";
import { ReminderPoller } from "./reminder-poller.js";

const FAKE_ROW = {
  id: "10",
  founder_user_id: "u_1",
  persona: "cofounder",
  topic: null,
  reminder_text: "ping",
  due_at: new Date("2026-05-15T09:00:00Z"),
  status: "pending" as const,
  source_invocation_id: null,
  channel: "telegram" as const,
  attempts: 1,
  last_attempted_at: new Date("2026-05-15T09:00:00Z"),
  sent_at: null,
  cancelled_at: null,
  metadata: {},
  created_at: new Date("2026-05-10T00:00:00Z"),
  updated_at: new Date("2026-05-10T00:00:00Z"),
};

interface FakeQuery {
  text: string;
  params: ReadonlyArray<unknown> | undefined;
}

interface ClientStub {
  client: PoolClient;
  queries: FakeQuery[];
}

function makeClient(claimRows: unknown[]): ClientStub {
  const queries: FakeQuery[] = [];
  const client = {
    async query(text: string, params?: ReadonlyArray<unknown>) {
      queries.push({ text, params });
      // Three claim queries: BEGIN, SELECT ... FOR UPDATE SKIP LOCKED,
      // UPDATE ... RETURNING, COMMIT. Return rows only for the actual
      // SELECT / UPDATE statements.
      if (/^SELECT id/.test(text)) {
        return {
          rows: claimRows.map((r) => ({
            id: (r as { id: string }).id,
          })),
          rowCount: claimRows.length,
        };
      }
      if (/^UPDATE openclaw_reminders/.test(text)) {
        return { rows: claimRows, rowCount: claimRows.length };
      }
      return { rows: [], rowCount: 0 };
    },
    release() {},
  } as unknown as PoolClient;
  return { client, queries };
}

interface PoolStub {
  pool: Pool;
  poolQueries: FakeQuery[];
  clientQueries: FakeQuery[];
}

function makePool(claimRows: unknown[]): PoolStub {
  const poolQueries: FakeQuery[] = [];
  const { client, queries: clientQueries } = makeClient(claimRows);
  const pool = {
    async connect() {
      return client;
    },
    async query(text: string, params?: ReadonlyArray<unknown>) {
      poolQueries.push({ text, params });
      return { rows: [{ ...FAKE_ROW }], rowCount: 1 };
    },
  } as unknown as Pool;
  return { pool, poolQueries, clientQueries };
}

describe("ReminderPoller.runOnce", () => {
  it("sends each claimed reminder and marks it sent on success", async () => {
    const { pool, poolQueries } = makePool([FAKE_ROW]);
    const dispatched: number[] = [];
    const poller = new ReminderPoller({
      pool,
      intervalMs: 0,
      maxAttempts: 3,
      batchSize: 5,
      dispatcher: (r) => {
        dispatched.push(r.id);
      },
    });

    const stats = await poller.runOnce();

    expect(stats.claimed).toBe(1);
    expect(stats.sent).toBe(1);
    expect(stats.failed).toBe(0);
    expect(dispatched).toEqual([10]);
    expect(
      poolQueries.some((q) =>
        /UPDATE openclaw_reminders\s+SET status\s*=\s*'sent'/.test(q.text),
      ),
    ).toBe(true);
  });

  it("marks failed when attempts >= maxAttempts and dispatcher throws", async () => {
    const exhausted = { ...FAKE_ROW, attempts: 3 };
    const { pool, poolQueries } = makePool([exhausted]);
    const poller = new ReminderPoller({
      pool,
      intervalMs: 0,
      maxAttempts: 3,
      batchSize: 5,
      dispatcher: () => {
        throw new Error("telegram offline");
      },
    });

    const stats = await poller.runOnce();
    expect(stats.failed).toBe(1);
    expect(stats.sent).toBe(0);
    expect(
      poolQueries.some((q) =>
        /UPDATE openclaw_reminders\s+SET status\s*=\s*'failed'/.test(q.text),
      ),
    ).toBe(true);
  });

  it("leaves in pending for retry when attempts < maxAttempts and dispatcher throws", async () => {
    const retryable = { ...FAKE_ROW, attempts: 1 };
    const { pool, poolQueries } = makePool([retryable]);
    const poller = new ReminderPoller({
      pool,
      intervalMs: 0,
      maxAttempts: 3,
      batchSize: 5,
      dispatcher: () => {
        throw new Error("transient");
      },
    });

    const stats = await poller.runOnce();
    expect(stats.failed).toBe(0);
    expect(stats.retried).toBe(1);
    // No further UPDATE openclaw_reminders SET status=... after attempt
    // counter bump.
    expect(
      poolQueries.some((q) =>
        /UPDATE openclaw_reminders\s+SET status\s*=/.test(q.text),
      ),
    ).toBe(false);
  });

  it("start/stop is idempotent", async () => {
    const { pool } = makePool([]);
    const poller = new ReminderPoller({
      pool,
      intervalMs: 0,
      dispatcher: () => undefined,
    });
    // intervalMs=0 → start is a no-op; stop is safe.
    poller.start();
    poller.start();
    await poller.stop();
    await poller.stop();
  });
});

// Mock obs logger so the lifecycle log lines don't pollute test output.
vi.mock("../../obs/logger.js", () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));
