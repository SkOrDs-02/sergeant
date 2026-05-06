import { describe, it, expect, beforeEach, afterAll, vi } from "vitest";
import request from "supertest";

/**
 * PR-31 — `/health/workers` endpoint regression guard.
 *
 * Контракт відповіді (документований у `apps/server/src/http/health.ts ::
 * createWorkersHealthHandler`):
 *
 *   {
 *     status: 'healthy' | 'unhealthy',
 *     timestamp: string (ISO),
 *     workers: {
 *       aiMemoryIngest: { enabled, started, fallbackMode, concurrency,
 *                         attempts, jobCounts, error? },
 *       monoEnrichment: { enabled, intervalMs, queueDepth, error? },
 *       backgroundQueue: { status, size, processing, isShuttingDown },
 *     },
 *   }
 *
 * Status code:
 *   - 200 — обидві worker-sample-функції повернулися без `error`
 *   - 503 — хоч одна повернула `error` (DB/Redis incident)
 *
 * Ці тести закріплюють shape + status-code-mapping, щоб майбутні зміни не
 * зламали мовчки дашборди / runbook-и, які парсять цей JSON.
 */
const { mockPool, queryMock } = vi.hoisted(() => {
  const queryMock = vi.fn().mockResolvedValue({ rows: [{ "?column?": 1 }] });
  const mockPool = {
    query: queryMock,
    connect: vi.fn(),
    on: vi.fn(),
    totalCount: 0,
    idleCount: 0,
    waitingCount: 0,
  };
  return { mockPool, queryMock };
});

vi.mock("../db.js", () => ({
  default: mockPool,
  pool: mockPool,
  query: queryMock,
  ensureSchema: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../auth.js", () => ({
  auth: { handler: async () => new Response(null, { status: 404 }) },
  getSessionUser: vi.fn().mockResolvedValue(null),
  getSessionUserSoft: vi.fn().mockResolvedValue(null),
}));

import { createApp } from "../app.js";

const ENV_KEYS = [
  "AI_MEMORY_ENABLED",
  "MONO_ENRICHMENT_WORKER_ENABLED",
  "ANTHROPIC_API_KEY",
  "DATABASE_URL",
  "RATE_LIMIT_DISABLED",
];
const savedEnv: Record<string, string | undefined> = {};
for (const k of ENV_KEYS) savedEnv[k] = process.env[k];

beforeEach(() => {
  for (const k of ENV_KEYS) delete process.env[k];
  queryMock.mockReset();
});

afterAll(() => {
  for (const k of ENV_KEYS) {
    if (savedEnv[k] === undefined) delete process.env[k];
    else process.env[k] = savedEnv[k];
  }
});

describe("GET /health/workers — happy path (no Redis, mono queue empty)", () => {
  it("returns 200 + healthy with disabled flags and zero queueDepth", async () => {
    // Mono enrichment SQL: empty queue (0 rows). The handler swallows the
    // result via Promise.all so SELECT 1 isn't needed for healthz parity.
    queryMock.mockResolvedValue({ rows: [] });
    const app = createApp();
    const res = await request(app).get("/health/workers");
    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toMatch(/application\/json/);
    expect(res.body).toMatchObject({
      status: "healthy",
      timestamp: expect.any(String),
      workers: {
        aiMemoryIngest: {
          enabled: false,
          started: false,
          fallbackMode: false,
          concurrency: expect.any(Number),
          attempts: expect.any(Number),
          jobCounts: null,
        },
        monoEnrichment: {
          enabled: false,
          intervalMs: expect.any(Number),
          queueDepth: {
            pending: 0,
            processing: 0,
            done: 0,
            failed: 0,
            dead_letter: 0,
            total: 0,
          },
        },
        backgroundQueue: {
          status: expect.stringMatching(/^(healthy|shutting_down)$/),
          queued: expect.any(Number),
          running: expect.any(Number),
          concurrency: expect.any(Number),
          isShuttingDown: expect.any(Boolean),
        },
      },
    });
    // ISO 8601 timestamp.
    expect(new Date(res.body.timestamp).toISOString()).toBe(res.body.timestamp);
  });

  it("aggregates monoEnrichment queueDepth from grouped rows", async () => {
    queryMock.mockResolvedValue({
      rows: [
        { status: "pending", count: "5" },
        { status: "processing", count: 1 },
        { status: "done", count: "4242" },
        { status: "failed", count: "0" },
        { status: "dead_letter", count: 2 },
        // unknown statuses are tolerated (counted in `total` only).
        { status: "scheduled", count: "3" },
      ],
    });
    const app = createApp();
    const res = await request(app).get("/health/workers");
    expect(res.status).toBe(200);
    expect(res.body.workers.monoEnrichment.queueDepth).toEqual({
      pending: 5,
      processing: 1,
      done: 4242,
      failed: 0,
      dead_letter: 2,
      total: 5 + 1 + 4242 + 0 + 2 + 3,
    });
  });
});

describe("GET /health/workers — degraded paths", () => {
  it("returns 503 + queueDepth=null when Postgres rejects mono-enrichment query", async () => {
    queryMock.mockRejectedValue(new Error("ECONNREFUSED 127.0.0.1:5432"));
    const app = createApp();
    const res = await request(app).get("/health/workers");
    expect(res.status).toBe(503);
    expect(res.body.status).toBe("unhealthy");
    expect(res.body.workers.monoEnrichment.queueDepth).toBeNull();
    expect(res.body.workers.monoEnrichment.error).toMatch(/ECONNREFUSED/);
    // Без stack trace в response body — лише `message`. Це L7 invariant
    // (не leak-аємо file paths / dependency versions через error string).
    expect(res.body.workers.monoEnrichment).not.toHaveProperty("stack");
  });

  it("reflects MONO_ENRICHMENT_WORKER_ENABLED + ANTHROPIC_API_KEY env flags", async () => {
    process.env["MONO_ENRICHMENT_WORKER_ENABLED"] = "true";
    process.env["ANTHROPIC_API_KEY"] = "sk-ant-test";
    queryMock.mockResolvedValue({ rows: [] });
    const app = createApp();
    const res = await request(app).get("/health/workers");
    expect(res.status).toBe(200);
    expect(res.body.workers.monoEnrichment.enabled).toBe(true);
  });

  it("reports monoEnrichment.enabled=false when API key missing", async () => {
    process.env["MONO_ENRICHMENT_WORKER_ENABLED"] = "true";
    // ANTHROPIC_API_KEY absent → env-flag must collapse to false (matches
    // the index.ts conditional that decides whether to start the worker).
    queryMock.mockResolvedValue({ rows: [] });
    const app = createApp();
    const res = await request(app).get("/health/workers");
    expect(res.body.workers.monoEnrichment.enabled).toBe(false);
  });
});

describe("GET /health/workers — L7 audit invariants", () => {
  it("does not leak build identifiers (commit / sha / version / build*)", async () => {
    queryMock.mockResolvedValue({ rows: [] });
    const app = createApp();
    const res = await request(app).get("/health/workers");
    const seen = new Set<string>();
    const collect = (v: unknown): void => {
      if (v === null || typeof v !== "object") return;
      if (Array.isArray(v)) {
        for (const x of v) collect(x);
        return;
      }
      for (const [k, x] of Object.entries(v as Record<string, unknown>)) {
        seen.add(k);
        collect(x);
      }
    };
    collect(res.body);
    for (const k of [
      "commit",
      "sha",
      "version",
      "build",
      "buildDate",
      "buildSha",
      "gitSha",
      "release",
    ]) {
      expect(seen.has(k)).toBe(false);
    }
  });

  it("remains reachable without a session (UptimeRobot / openclaw)", async () => {
    queryMock.mockResolvedValue({ rows: [] });
    const app = createApp();
    const res = await request(app).get("/health/workers");
    expect([200, 503]).toContain(res.status);
  });
});
