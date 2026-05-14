import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

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
  Sentry: {
    addBreadcrumb: vi.fn(),
    captureMessage: vi.fn(),
    captureException: vi.fn(),
  },
}));

import { runForgetCleanup } from "./forgetCleanup.js";
import { Sentry } from "../../sentry.js";

const breadcrumbMock = (
  Sentry as unknown as { addBreadcrumb: ReturnType<typeof vi.fn> }
).addBreadcrumb;
const captureMock = (
  Sentry as unknown as { captureException: ReturnType<typeof vi.fn> }
).captureException;

function makeFakePool(responses: number[]): {
  pool: { query: ReturnType<typeof vi.fn> };
  calls: Array<[string, unknown[]]>;
} {
  const queue = [...responses];
  const calls: Array<[string, unknown[]]> = [];
  const query = vi.fn(async (sql: string, params?: unknown[]) => {
    calls.push([sql, params ?? []]);
    const next = queue.shift();
    if (next === undefined) {
      throw new Error(`unexpected query: ${sql.slice(0, 60)}`);
    }
    return { rowCount: next, rows: [] };
  });
  return { pool: { query }, calls };
}

beforeEach(() => {
  breadcrumbMock.mockReset();
  captureMock.mockReset();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("runForgetCleanup", () => {
  it("hard-deletes single batch then exits", async () => {
    const { pool, calls } = makeFakePool([5]);
    const result = await runForgetCleanup(pool as never);

    expect(result).toEqual({ deletedCount: 5, batches: 1, drained: true });
    expect(calls).toHaveLength(1);
    expect(calls[0]?.[0]).toMatch(/DELETE FROM ai_memories/);
    expect(calls[0]?.[0]).toMatch(/deleted_at IS NOT NULL/);
    expect(breadcrumbMock).toHaveBeenCalledTimes(1);
  });

  it("loops через декілька batches доки rowCount < batch_size", async () => {
    const { pool, calls } = makeFakePool([1000, 1000, 250]);
    const result = await runForgetCleanup(pool as never);
    expect(result.batches).toBe(3);
    expect(result.deletedCount).toBe(2250);
    expect(result.drained).toBe(true);
    expect(calls).toHaveLength(3);
  });

  it("обриває loop за maxBatches без drain", async () => {
    const { pool } = makeFakePool([1000, 1000]);
    const result = await runForgetCleanup(pool as never, { maxBatches: 2 });
    expect(result.batches).toBe(2);
    expect(result.deletedCount).toBe(2000);
    expect(result.drained).toBe(false);
  });

  it("respects retentionDays параметр", async () => {
    const { pool, calls } = makeFakePool([0]);
    await runForgetCleanup(pool as never, { retentionDays: 14 });
    expect(calls[0]?.[1]?.[0]).toBe("14");
  });

  it("Sentry-captures на DB error", async () => {
    const dbErr = new Error("pg: connection terminated");
    const pool = {
      query: vi.fn(async () => {
        throw dbErr;
      }),
    };
    await expect(runForgetCleanup(pool as never)).rejects.toThrow(
      "pg: connection terminated",
    );
    expect(captureMock).toHaveBeenCalledTimes(1);
  });
});
