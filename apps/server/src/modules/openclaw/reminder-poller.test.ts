import { afterEach, describe, expect, it, vi } from "vitest";
import type { Pool, PoolClient } from "pg";
import { logOnlyDispatcher, ReminderPoller } from "./reminder-poller.js";

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

  it("passes nowIso through to the claim query when configured", async () => {
    const { pool, clientQueries } = makePool([FAKE_ROW]);
    const poller = new ReminderPoller({
      pool,
      intervalMs: 0,
      maxAttempts: 3,
      batchSize: 5,
      nowIso: "2026-06-01T00:00:00.000Z",
      dispatcher: () => undefined,
    });
    await poller.runOnce();
    const selectCall = clientQueries.find((q) => /^SELECT id/.test(q.text));
    expect(selectCall?.params?.[0]).toBe("2026-06-01T00:00:00.000Z");
  });

  it("returns zeroed stats and skips claiming when a tick is already in-flight", async () => {
    const { pool } = makePool([FAKE_ROW]);
    let releaseDispatch: (() => void) | undefined;
    const dispatchGate = new Promise<void>((resolve) => {
      releaseDispatch = resolve;
    });
    const poller = new ReminderPoller({
      pool,
      intervalMs: 0,
      maxAttempts: 3,
      batchSize: 5,
      dispatcher: async () => {
        await dispatchGate;
      },
    });

    const firstRun = poller.runOnce();
    // Give the first tick a chance to flip `running=true` before the second
    // call races it.
    await Promise.resolve();
    const secondRun = await poller.runOnce();
    expect(secondRun).toEqual({ claimed: 0, sent: 0, failed: 0, retried: 0 });

    releaseDispatch?.();
    const firstStats = await firstRun;
    expect(firstStats.claimed).toBe(1);
  });
});

describe("ReminderPoller: start/stop lifecycle with a real interval", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("fires runOnce on each tick and logs+swallows a rejected tick", async () => {
    vi.useFakeTimers();
    const failingPool = {
      async connect() {
        throw new Error("pool exhausted");
      },
    } as unknown as Pool;
    const poller = new ReminderPoller({
      pool: failingPool,
      intervalMs: 1_000,
      dispatcher: () => undefined,
    });

    poller.start();
    await vi.advanceTimersByTimeAsync(1_000);

    const loggerModule = await import("../../obs/logger.js");
    expect(loggerModule.logger.error).toHaveBeenCalledWith(
      expect.objectContaining({ msg: "openclaw_reminder_poller_tick_failed" }),
    );

    await poller.stop();
  });

  it("stop() waits for an in-flight tick before resolving", async () => {
    const { pool } = makePool([FAKE_ROW]);
    let releaseDispatch: (() => void) | undefined;
    const dispatchGate = new Promise<void>((resolve) => {
      releaseDispatch = resolve;
    });
    const poller = new ReminderPoller({
      pool,
      intervalMs: 0,
      dispatcher: async () => {
        await dispatchGate;
      },
    });

    const inFlight = poller.runOnce();
    await Promise.resolve();
    let stopResolved = false;
    const stopPromise = poller.stop().then(() => {
      stopResolved = true;
    });
    // stop() must still be waiting — the dispatcher hasn't resolved yet.
    await new Promise((r) => setTimeout(r, 30));
    expect(stopResolved).toBe(false);

    releaseDispatch?.();
    await inFlight;
    await stopPromise;
    expect(stopResolved).toBe(true);
  });
});

describe("logOnlyDispatcher", () => {
  it("logs the reminder without throwing (default no-op dispatcher)", async () => {
    const loggerModule = await import("../../obs/logger.js");
    vi.mocked(loggerModule.logger.info).mockClear();
    await logOnlyDispatcher({
      id: 10,
      founderUserId: "u_1",
      persona: "cofounder",
      topic: "pricing",
      reminderText: "ping",
      dueAt: "2026-05-15T09:00:00.000Z",
      status: "pending",
      sourceInvocationId: null,
      channel: "telegram",
      attempts: 0,
      lastAttemptedAt: null,
      sentAt: null,
      cancelledAt: null,
      metadata: {},
      createdAt: "2026-05-10T00:00:00.000Z",
      updatedAt: "2026-05-10T00:00:00.000Z",
    });
    expect(loggerModule.logger.info).toHaveBeenCalledWith(
      expect.objectContaining({
        msg: "openclaw_reminder_dispatch_stub",
        reminderId: 10,
        founderUserId: "u_1",
        channel: "telegram",
        persona: "cofounder",
        topic: "pricing",
      }),
    );
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
