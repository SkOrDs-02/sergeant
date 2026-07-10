/**
 * Integration tests for `POST /api/ai-memory/ingest` (ingestRoute.ts).
 *
 * Strategy: boot a real Postgres container (pgvector/pg17 for ai_memories
 * partition + halfvec type), then call the handler directly with a mocked
 * `enqueueMemoryIngest` that writes to the real DB using a synthetic
 * 1024-dim embedding. Voyage API is never called.
 *
 * Tests:
 *   1. Valid request → ai_memories row is written for the correct user.
 *   2. User isolation: two users ingest separately; each gets their own row.
 *   3. AI_MEMORY_ENABLED=false → 503 (feature flag respected).
 */

import {
  describe,
  it,
  expect,
  beforeAll,
  afterAll,
  beforeEach,
  vi,
} from "vitest";
import type { Request, Response } from "express";
import {
  bootIntegrationHarness,
  shutdownIntegrationHarness,
  seedIntegrationUser,
  truncateIntegrationTables,
  INTEGRATION_TIMEOUT_MS,
  type IntegrationHarness,
} from "../../test/createIntegrationApp.js";

let harness: IntegrationHarness;
let dockerAvailable = false;

let ingestMemoryHandlerFn: (req: Request, res: Response) => Promise<void>;
let envRef: { AI_MEMORY_ENABLED: boolean };

const USER_A = "u_ingest_intg_a";
const USER_B = "u_ingest_intg_b";

/** Builds a 1024-dim unit vector as a pgvector string literal. */
function fakeEmbeddingStr(): string {
  const dim = 1024;
  const val = 1 / Math.sqrt(dim);
  return `[${Array.from({ length: dim }, () => val.toFixed(6)).join(",")}]`;
}

interface TestRes {
  statusCode: number;
  body: unknown;
  status(code: number): TestRes;
  json(payload: unknown): TestRes;
}

function makeRes(): TestRes & Response {
  const res: TestRes = {
    statusCode: 200,
    body: {},
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    },
  };
  return res as TestRes & Response;
}

function makeReq(userId: string, body: Record<string, unknown>): Request {
  return {
    method: "POST",
    body,
    user: { id: userId },
  } as unknown as Request;
}

beforeAll(async () => {
  // Set AI_MEMORY_ENABLED before any module import so env singleton picks it up.
  process.env["AI_MEMORY_ENABLED"] = "true";

  try {
    harness = await bootIntegrationHarness({ app: false });
    dockerAvailable = true;
  } catch (e) {
    if (process.env["CI"]) throw e;
    console.warn(
      "[ingestRoute integration] Skipping:",
      e instanceof Error ? e.message : String(e),
    );
    return;
  }

  vi.doMock("../../obs/logger.js", () => ({
    logger: {
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      fatal: vi.fn(),
    },
    serializeError: vi.fn((e: unknown) => ({ msg: String(e) })),
  }));

  // Mock enqueueMemoryIngest: instead of going through BullMQ → Voyage,
  // directly INSERT into ai_memories using the real test pool and a
  // synthetic embedding. This is the "mock Voyage embed" strategy.
  vi.doMock("./ingestQueue.js", () => ({
    enqueueMemoryIngest: vi.fn(
      async (payload: {
        userId: string;
        source: string;
        sourceRef: string | null;
        content: string;
        metadata?: Record<string, unknown>;
      }) => {
        await harness.pool.query(
          `INSERT INTO ai_memories
             (user_id, source, source_ref, content, embedding,
              embedding_provider, embedding_model, embedding_version, metadata)
           VALUES ($1, $2, $3, $4, $5::halfvec,
                   'voyage', 'voyage-3.5-lite', '1', $6::jsonb)`,
          [
            payload.userId,
            payload.source,
            payload.sourceRef,
            payload.content,
            fakeEmbeddingStr(),
            JSON.stringify(payload.metadata ?? {}),
          ],
        );
      },
    ),
  }));

  const [mod, envMod] = await Promise.all([
    import("./ingestRoute.js"),
    import("../../env.js"),
  ]);
  ingestMemoryHandlerFn = mod.ingestMemoryHandler;
  envRef = envMod.env as unknown as { AI_MEMORY_ENABLED: boolean };
}, INTEGRATION_TIMEOUT_MS);

afterAll(async () => {
  await shutdownIntegrationHarness();
}, INTEGRATION_TIMEOUT_MS);

beforeEach(async () => {
  if (!dockerAvailable) return;
  // Restore the flag before each test (test 3 disables it).
  (envRef as unknown as { AI_MEMORY_ENABLED: boolean }).AI_MEMORY_ENABLED =
    true;
  await truncateIntegrationTables(harness.pool);
  await seedIntegrationUser(harness.pool, USER_A);
  await seedIntegrationUser(harness.pool, USER_B);
});

describe("ingestRoute — integration (real Postgres, mocked Voyage)", () => {
  it(
    "POST /api/ai-memory/ingest → ai_memories row written for user",
    async (ctx) => {
      if (!dockerAvailable) return ctx.skip();

      const res = makeRes();
      await ingestMemoryHandlerFn(
        makeReq(USER_A, {
          source: "nutrition",
          content: "I ate 500 kcal of salad today",
        }),
        res,
      );

      expect(res.statusCode).toBe(202);
      expect(res.body).toMatchObject({ ok: true, source: "nutrition" });

      const { rows } = await harness.pool.query<{
        user_id: string;
        source: string;
        content: string;
      }>(
        `SELECT user_id, source, content FROM ai_memories WHERE user_id = $1`,
        [USER_A],
      );
      expect(rows).toHaveLength(1);
      expect(rows[0]!.user_id).toBe(USER_A);
      expect(rows[0]!.source).toBe("nutrition");
      expect(rows[0]!.content).toBe("I ate 500 kcal of salad today");
    },
    INTEGRATION_TIMEOUT_MS,
  );

  it(
    "user isolation: two users ingest separately — each has their own row only",
    async (ctx) => {
      if (!dockerAvailable) return ctx.skip();

      // Ingest for User A.
      await ingestMemoryHandlerFn(
        makeReq(USER_A, {
          source: "journal",
          content: "User A private journal entry",
        }),
        makeRes(),
      );

      // Ingest for User B.
      await ingestMemoryHandlerFn(
        makeReq(USER_B, {
          source: "fizruk",
          content: "User B workout summary",
        }),
        makeRes(),
      );

      const { rows: rowsA } = await harness.pool.query<{ user_id: string }>(
        `SELECT user_id FROM ai_memories WHERE user_id = $1`,
        [USER_A],
      );
      const { rows: rowsB } = await harness.pool.query<{ user_id: string }>(
        `SELECT user_id FROM ai_memories WHERE user_id = $1`,
        [USER_B],
      );

      expect(rowsA).toHaveLength(1);
      expect(rowsB).toHaveLength(1);
      // Cross-check: User A's rows are not User B's and vice versa.
      expect(rowsA[0]!.user_id).toBe(USER_A);
      expect(rowsB[0]!.user_id).toBe(USER_B);
    },
    INTEGRATION_TIMEOUT_MS,
  );

  it(
    "AI_MEMORY_ENABLED=false → 503 AI_MEMORY_DISABLED",
    async (ctx) => {
      if (!dockerAvailable) return ctx.skip();

      // Disable the feature flag at runtime (same pattern as audit.test.ts
      // uses for SYNC_AUDIT_ADMIN_USER_IDS — env is a plain object at runtime).
      (envRef as unknown as { AI_MEMORY_ENABLED: boolean }).AI_MEMORY_ENABLED =
        false;

      const res = makeRes();
      await ingestMemoryHandlerFn(
        makeReq(USER_A, {
          source: "routine",
          content: "Completed morning habits",
        }),
        res,
      );

      expect(res.statusCode).toBe(503);
      expect((res.body as Record<string, unknown>)["code"]).toBe(
        "AI_MEMORY_DISABLED",
      );

      // No row must be written.
      const { rows } = await harness.pool.query<{ c: string }>(
        `SELECT COUNT(*)::text AS c FROM ai_memories WHERE user_id = $1`,
        [USER_A],
      );
      expect(Number(rows[0]!.c)).toBe(0);
    },
    INTEGRATION_TIMEOUT_MS,
  );
});
