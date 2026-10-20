import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import type { Pool } from "pg";
import { readFile } from "node:fs/promises";
import {
  bootIntegrationHarness,
  shutdownIntegrationHarness,
  INTEGRATION_TIMEOUT_MS,
} from "../../test/createIntegrationApp.js";
import type { GdprCleanupService } from "./cleanupQueue.js";

let pool: Pool;
let processBatch: typeof import("./cleanupWorker.js").processGdprCleanupQueueBatch;

beforeAll(async () => {
  pool = (await bootIntegrationHarness({ app: false })).pool;
  processBatch = (await import("./cleanupWorker.js"))
    .processGdprCleanupQueueBatch;
}, INTEGRATION_TIMEOUT_MS);

beforeEach(async () => {
  await pool.query("DELETE FROM gdpr_cleanup_queue");
  vi.stubEnv("STRIPE_SECRET_KEY", "test-stripe-key");
  vi.stubEnv("RESEND_API_KEY", "test-resend-key");
});
afterEach(() => vi.unstubAllEnvs());
afterAll(shutdownIntegrationHarness, INTEGRATION_TIMEOUT_MS);

async function enqueue(
  service: GdprCleanupService,
  attempts = 0,
): Promise<string> {
  const result = await pool.query<{ id: string }>(
    `INSERT INTO gdpr_cleanup_queue (user_id, email, stripe_customer_id, service, attempts)
     VALUES ('deleted-test-user', 'test@example.com', 'customer/one', $1, $2) RETURNING id`,
    [service, attempts],
  );
  return result.rows[0]!.id;
}

async function stored(id: string) {
  const result = await pool.query<{
    attempts: number;
    email: string | null;
    stripe_customer_id: string | null;
    last_error: string | null;
    completed_at: Date | null;
    next_at: string;
    future: boolean;
  }>(
    `SELECT attempts, email, stripe_customer_id, last_error, completed_at,
            next_attempt_at::text AS next_at, next_attempt_at > NOW() AS future
       FROM gdpr_cleanup_queue WHERE id = $1`,
    [id],
  );
  expect(result.rowCount).toBe(1);
  return result.rows[0]!;
}

describe("GDPR cleanup — real claim, retry and redaction SQL", () => {
  it("keeps a pending record's email mandatory after allowing completed-row redaction", async () => {
    await expect(
      pool.query(
        "INSERT INTO gdpr_cleanup_queue (user_id, email, service) VALUES ('missing-email', NULL, 'resend')",
      ),
    ).rejects.toMatchObject({
      code: "23514",
      constraint: "gdpr_cleanup_queue_pending_email",
    });
  });

  it("retries a rate limit and erases retained PII only after vendor confirmation", async () => {
    const id = await enqueue("stripe");
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response(null, { status: 429 }))
      .mockResolvedValueOnce(new Response(null, { status: 204 }));

    const first = await processBatch(pool, { fetchImpl });
    expect(first).toMatchObject({ processed: 1, failed: 1, completed: 0 });
    expect(await stored(id)).toMatchObject({
      attempts: 1,
      email: "test@example.com",
      stripe_customer_id: "customer/one",
      completed_at: null,
      last_error: "rate_limited",
      future: true,
    });
    expect((await processBatch(pool, { fetchImpl })).processed).toBe(0);
    expect(fetchImpl).toHaveBeenCalledTimes(1);

    await pool.query(
      "UPDATE gdpr_cleanup_queue SET next_attempt_at = NOW() - INTERVAL '1 second' WHERE id = $1",
      [id],
    );
    expect(await processBatch(pool, { fetchImpl })).toMatchObject({
      processed: 1,
      completed: 1,
      failed: 0,
    });
    expect(await stored(id)).toMatchObject({
      attempts: 1,
      email: null,
      stripe_customer_id: null,
      last_error: null,
      completed_at: expect.any(Date),
    });
    expect((await processBatch(pool, { fetchImpl })).processed).toBe(0);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("completes an already-missing contact and redacts its snapshot", async () => {
    const id = await enqueue("resend");
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response(null, { status: 404 }));
    expect(await processBatch(pool, { fetchImpl })).toMatchObject({
      processed: 1,
      completed: 1,
      failed: 0,
    });
    expect(await stored(id)).toMatchObject({
      email: null,
      stripe_customer_id: null,
      completed_at: expect.any(Date),
    });
    expect(fetchImpl).toHaveBeenCalledExactlyOnceWith(
      "https://api.resend.com/contacts/test%40example.com",
      expect.objectContaining({ method: "DELETE" }),
    );
  });

  it("keeps an unconfigured vendor pending without spending an attempt", async () => {
    const id = await enqueue("stripe", 3);
    vi.stubEnv("STRIPE_SECRET_KEY", "");
    const fetchImpl = vi.fn<typeof fetch>();
    expect(await processBatch(pool, { fetchImpl })).toMatchObject({
      processed: 1,
      waitingOnConfig: 1,
      completed: 0,
      failed: 0,
    });
    expect(await stored(id)).toMatchObject({
      attempts: 3,
      email: "test@example.com",
      completed_at: null,
      future: true,
    });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("parks the tenth failed attempt at infinity so later batches cannot retry it", async () => {
    const id = await enqueue("stripe", 9);
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response("unavailable", { status: 503 }));
    expect(await processBatch(pool, { fetchImpl })).toMatchObject({
      processed: 1,
      exhausted: 1,
      failed: 1,
    });
    expect(await stored(id)).toMatchObject({
      attempts: 10,
      next_at: "infinity",
      last_error: "max_attempts_exhausted: stripe returned 503",
      completed_at: null,
    });
    expect((await processBatch(pool, { fetchImpl })).processed).toBe(0);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("does not let a second batch dispatch the same leased row while the first awaits HTTP", async () => {
    const id = await enqueue("resend");
    let signalStarted!: () => void;
    let releaseRequest!: () => void;
    const started = new Promise<void>((resolve) => {
      signalStarted = resolve;
    });
    const responseReady = new Promise<void>((resolve) => {
      releaseRequest = resolve;
    });
    const fetchImpl = vi.fn<typeof fetch>().mockImplementation(async () => {
      signalStarted();
      await responseReady;
      return new Response(null, { status: 204 });
    });
    const first = processBatch(pool, { fetchImpl, limit: 1 });
    await started;
    try {
      expect(await stored(id)).toMatchObject({
        future: true,
        completed_at: null,
      });
      expect(await processBatch(pool, { fetchImpl, limit: 1 })).toMatchObject({
        processed: 0,
        completed: 0,
      });
      expect(fetchImpl).toHaveBeenCalledTimes(1);
    } finally {
      releaseRequest();
    }
    expect(await first).toMatchObject({ processed: 1, completed: 1 });
    expect(await stored(id)).toMatchObject({
      email: null,
      completed_at: expect.any(Date),
    });
  });

  it("rolls back and reapplies migration 160 without restoring erased PII", async () => {
    const id = await enqueue("resend");
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response(null, { status: 204 }));
    expect((await processBatch(pool, { fetchImpl })).completed).toBe(1);
    expect((await stored(id)).email).toBeNull();
    const up = await readFile(
      new URL(
        "../../migrations/160_gdpr_cleanup_email_redaction.sql",
        import.meta.url,
      ),
      "utf8",
    );
    const down = await readFile(
      new URL(
        "../../migrations/160_gdpr_cleanup_email_redaction.down.sql",
        import.meta.url,
      ),
      "utf8",
    );
    try {
      await pool.query(down);
      expect(await stored(id)).toMatchObject({
        email: "",
        completed_at: expect.any(Date),
      });
      const nullable = await pool.query<{ is_nullable: string }>(
        "SELECT is_nullable FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'gdpr_cleanup_queue' AND column_name = 'email'",
      );
      expect(nullable.rows).toEqual([{ is_nullable: "NO" }]);
    } finally {
      await pool.query(up);
    }
    expect(await stored(id)).toMatchObject({
      email: "",
      completed_at: expect.any(Date),
    });
    expect((await processBatch(pool, { fetchImpl })).processed).toBe(0);
  });
});
