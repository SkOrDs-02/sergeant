import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Mock query() з db.js — тести перевіряють DLQ-логіку без живого PG.
vi.mock("../../db.js", () => ({
  query: vi.fn().mockResolvedValue({ rows: [], rowCount: 0 }),
}));

vi.mock("../../obs/logger.js", () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
  serializeError: vi.fn((err: unknown) => ({
    message: err instanceof Error ? err.message : String(err),
  })),
  redactKeyNames: [],
}));

vi.mock("../../sentry.js", () => ({
  Sentry: { captureMessage: vi.fn() },
}));

import { query as _query } from "../../db.js";
import { Sentry as _Sentry } from "../../sentry.js";
import {
  __getDlqRateLimitState,
  __resetDlqRateLimit,
  listDlqRows,
  markDlqRowReplayed,
  recordIngestDlq,
} from "./dlq.js";
import type { MemoryIngestPayload } from "./ingestQueue.js";

const queryMock = _query as unknown as ReturnType<typeof vi.fn>;
const captureMessageMock = _Sentry.captureMessage as unknown as ReturnType<
  typeof vi.fn
>;

const sample: MemoryIngestPayload = {
  userId: "u1",
  source: "finyk",
  sourceRef: "tx-42",
  content: "txn snapshot",
  metadata: { amount: 100 },
};

describe("recordIngestDlq", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    __resetDlqRateLimit();
  });

  it("INSERT ON CONFLICT для row з sourceRef (idempotent INSERT)", async () => {
    queryMock.mockResolvedValueOnce({ rows: [], rowCount: 1 });

    await recordIngestDlq({
      payload: sample,
      errorMsg: "Voyage 400 Invalid input",
      attempts: 3,
    });

    expect(queryMock).toHaveBeenCalledTimes(1);
    const [sql, values] = queryMock.mock.calls[0]!;
    expect(sql).toContain("INSERT INTO ai_memory_ingest_failed");
    expect(sql).toContain("ON CONFLICT");
    expect(sql).toContain("DO UPDATE SET");
    expect(values).toEqual([
      "u1",
      "finyk",
      "tx-42",
      JSON.stringify(sample),
      "Voyage 400 Invalid input",
      3,
      expect.any(Date),
    ]);
  });

  it("plain INSERT (без ON CONFLICT) для row БЕЗ sourceRef", async () => {
    queryMock.mockResolvedValueOnce({ rows: [], rowCount: 1 });

    const payloadNoRef: MemoryIngestPayload = { ...sample, sourceRef: null };
    await recordIngestDlq({
      payload: payloadNoRef,
      errorMsg: "Voyage 400",
      attempts: 1,
    });

    expect(queryMock).toHaveBeenCalledTimes(1);
    const [sql] = queryMock.mock.calls[0]!;
    expect(sql).toContain("INSERT INTO ai_memory_ingest_failed");
    expect(sql).not.toContain("ON CONFLICT");
  });

  it("DB-error ковтається — НЕ throw", async () => {
    queryMock.mockRejectedValueOnce(new Error("PG connection refused"));

    await expect(
      recordIngestDlq({
        payload: sample,
        errorMsg: "boom",
        attempts: 1,
      }),
    ).resolves.toBeUndefined();
  });

  it("шле Sentry warning з error_signature='ai-memory-ingest-dlq'", async () => {
    queryMock.mockResolvedValue({ rows: [], rowCount: 1 });

    await recordIngestDlq({
      payload: sample,
      errorMsg: "Voyage 400",
      attempts: 3,
    });

    expect(captureMessageMock).toHaveBeenCalledTimes(1);
    const [summary, opts] = captureMessageMock.mock.calls[0]!;
    expect(summary).toContain("AI memory ingest DLQ");
    expect(opts.level).toBe("warning");
    expect(opts.tags.error_signature).toBe("ai-memory-ingest-dlq");
    expect(opts.tags.source).toBe("finyk");
    expect(opts.extra.user_id).toBe("u1");
  });

  it("rate-limit: 2 alerts within 60s → лише перший Sentry-fired", async () => {
    queryMock.mockResolvedValue({ rows: [], rowCount: 1 });
    const t0 = new Date("2026-05-15T12:00:00Z");
    const t1 = new Date("2026-05-15T12:00:30Z"); // +30s — у вікні

    await recordIngestDlq({
      payload: sample,
      errorMsg: "err1",
      attempts: 3,
      now: t0,
    });
    await recordIngestDlq({
      payload: sample,
      errorMsg: "err2",
      attempts: 3,
      now: t1,
    });

    expect(queryMock).toHaveBeenCalledTimes(2); // DB-write завжди
    expect(captureMessageMock).toHaveBeenCalledTimes(1); // Sentry rate-limited
    expect(__getDlqRateLimitState().suppressedCount).toBe(1);
  });

  it("rate-limit: 2 alerts >60s apart → обидва Sentry-fired", async () => {
    queryMock.mockResolvedValue({ rows: [], rowCount: 1 });
    const t0 = new Date("2026-05-15T12:00:00Z");
    const t1 = new Date("2026-05-15T12:01:01Z"); // +61s — поза вікном

    await recordIngestDlq({
      payload: sample,
      errorMsg: "err1",
      attempts: 3,
      now: t0,
    });
    await recordIngestDlq({
      payload: sample,
      errorMsg: "err2",
      attempts: 3,
      now: t1,
    });

    expect(captureMessageMock).toHaveBeenCalledTimes(2);
    expect(__getDlqRateLimitState().suppressedCount).toBe(0);
  });

  it("rate-limit: suppressed_count передається у наступний Sentry alert", async () => {
    queryMock.mockResolvedValue({ rows: [], rowCount: 1 });
    const t0 = new Date("2026-05-15T12:00:00Z");
    const t1 = new Date("2026-05-15T12:00:10Z");
    const t2 = new Date("2026-05-15T12:00:20Z");
    const t3 = new Date("2026-05-15T12:01:30Z"); // +1.5min

    await recordIngestDlq({
      payload: sample,
      errorMsg: "e",
      attempts: 1,
      now: t0,
    });
    await recordIngestDlq({
      payload: sample,
      errorMsg: "e",
      attempts: 1,
      now: t1,
    });
    await recordIngestDlq({
      payload: sample,
      errorMsg: "e",
      attempts: 1,
      now: t2,
    });
    await recordIngestDlq({
      payload: sample,
      errorMsg: "e",
      attempts: 1,
      now: t3,
    });

    expect(captureMessageMock).toHaveBeenCalledTimes(2);
    // 4th alert несе suppressed=2 (т1 + т2 у вікні після т0)
    const secondCall = captureMessageMock.mock.calls[1]![1];
    expect(secondCall.extra.suppressed_count).toBe(2);
    // Після fire-у counter скидається.
    expect(__getDlqRateLimitState().suppressedCount).toBe(0);
  });

  it("Sentry-capture-failure НЕ throw (fail-soft)", async () => {
    queryMock.mockResolvedValue({ rows: [], rowCount: 1 });
    captureMessageMock.mockImplementationOnce(() => {
      throw new Error("Sentry transport down");
    });

    await expect(
      recordIngestDlq({
        payload: sample,
        errorMsg: "boom",
        attempts: 1,
      }),
    ).resolves.toBeUndefined();
  });
});

describe("markDlqRowReplayed", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("bump replay_count, set replayed_at = NOW()", async () => {
    queryMock.mockResolvedValueOnce({ rows: [], rowCount: 1 });

    await markDlqRowReplayed(42);

    expect(queryMock).toHaveBeenCalledTimes(1);
    const [sql, values] = queryMock.mock.calls[0]!;
    expect(sql).toContain("UPDATE ai_memory_ingest_failed");
    expect(sql).toContain("replayed_at  = NOW()");
    expect(sql).toContain("replay_count = replay_count + 1");
    expect(values).toEqual([42]);
  });

  it("DB-error ковтається — НЕ throw", async () => {
    queryMock.mockRejectedValueOnce(new Error("PG down"));
    await expect(markDlqRowReplayed(42)).resolves.toBeUndefined();
  });
});

describe("listDlqRows", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("coerce id/attempts/replay_count як number (Hard Rule #1)", async () => {
    queryMock.mockResolvedValueOnce({
      rows: [
        {
          id: "42", // bigint як string
          user_id: "u1",
          source: "finyk",
          source_ref: "tx-1",
          payload_json: sample,
          error_msg: "Voyage 503",
          attempts: "5", // numeric як string
          last_attempt_at: new Date("2026-05-15T12:00:00Z"),
          replayed_at: null,
          replay_count: "0",
        },
      ],
      rowCount: 1,
    });

    const rows = await listDlqRows({ source: "finyk", limit: 100 });
    expect(rows).toHaveLength(1);
    expect(rows[0]!.id).toBe(42);
    expect(typeof rows[0]!.id).toBe("number");
    expect(rows[0]!.attempts).toBe(5);
    expect(typeof rows[0]!.attempts).toBe("number");
    expect(rows[0]!.replayCount).toBe(0);
  });

  it("default — лише active (replayed_at IS NULL)", async () => {
    queryMock.mockResolvedValueOnce({ rows: [], rowCount: 0 });

    await listDlqRows({ source: "finyk", limit: 10 });

    const [sql] = queryMock.mock.calls[0]!;
    expect(sql).toContain("replayed_at IS NULL");
    expect(sql).toContain("source = $");
  });

  it("includeReplayed=true — без WHERE replayed_at filter", async () => {
    queryMock.mockResolvedValueOnce({ rows: [], rowCount: 0 });

    await listDlqRows({ source: "finyk", limit: 10, includeReplayed: true });

    const [sql] = queryMock.mock.calls[0]!;
    expect(sql).not.toContain("replayed_at IS NULL");
  });

  it("ids фільтр — `id = ANY($N::bigint[])`, ignore source/since/includeReplayed", async () => {
    queryMock.mockResolvedValueOnce({ rows: [], rowCount: 0 });

    await listDlqRows({
      ids: [1, 2, 3],
      source: "finyk",
      limit: 10,
    });

    const [sql, values] = queryMock.mock.calls[0]!;
    expect(sql).toContain("id = ANY");
    expect(values).toEqual([[1, 2, 3], 10]);
  });
});

afterEach(() => {
  __resetDlqRateLimit();
});
