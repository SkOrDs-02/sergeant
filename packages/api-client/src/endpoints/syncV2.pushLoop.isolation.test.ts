import { describe, expect, it, vi } from "vitest";
import { ApiError } from "../ApiError";
import {
  runSyncEnginePushOnce,
  type DrainedOutboxRowShape,
  type SyncEnginePushDeps,
} from "./syncV2.pushLoop";
import type { SyncV2PushOp } from "./syncV2";

const now = new Date("2026-10-21T12:00:00.000Z");
const rows: DrainedOutboxRowShape[] = [1, 2, 3].map((id) => ({
  id,
  table: "routine_entries",
  op: "insert",
  row: { id, name: id === 2 ? "bad" : "good" },
  clientTs: "2026-10-21T11:00:00.000Z",
  idempotencyKey: `isolation-${id}`,
  attempts: 0,
  nextRetryAt: null,
  lastError: null,
  createdAt: "2026-10-21T11:00:00.000Z",
}));

function httpError(status: number): ApiError {
  return new ApiError({
    kind: "http",
    status,
    message: `HTTP ${status}`,
    url: "/api/v2/sync/push",
  });
}

describe("push batch isolation", () => {
  it.each([400, 413, 422])(
    "delivers good neighbours when one row causes HTTP %i",
    async (status) => {
      const push = vi.fn(async (ops: SyncV2PushOp[]) => {
        if (ops.some((op) => op.idempotency_key === "isolation-2"))
          throw httpError(status);
        return {
          accepted: ops.length,
          last_op_id: 1,
          results: ops.map((op) => ({
            idempotency_key: op.idempotency_key,
            status: "applied" as const,
          })),
        };
      });
      const markSuccessBatch = vi.fn(async (_ids: readonly number[]) => {});
      const markRejected = vi.fn(async () => {});
      const markRetry = vi.fn(async () => {});
      const deps: SyncEnginePushDeps = {
        drain: async () => rows,
        push,
        markSuccess: vi.fn(async () => {}),
        markSuccessBatch,
        markRejected,
        markRetry,
        planRetry: (attempts, _now, lastError) => ({
          attempts: attempts + 1,
          status: "pending",
          nextRetryAt: now.toISOString(),
          lastError,
        }),
        now: () => now,
      };

      const result = await runSyncEnginePushOnce(deps, { limit: 200 });

      expect(result).toEqual({
        drained: 3,
        pushed: 2,
        rejected: 1,
        retried: 0,
      });
      expect(markSuccessBatch).toHaveBeenCalledExactlyOnceWith([1, 3]);
      expect(markRejected).toHaveBeenCalledExactlyOnceWith(
        2,
        `http_${status}`,
        { table: "routine_entries", op: "insert" },
      );
      expect(markRetry).not.toHaveBeenCalled();
      expect(push).toHaveBeenCalledTimes(5);
    },
  );
  it("caps isolation requests and keeps unsent rows pending without burning attempts", async () => {
    const manyRows = Array.from({ length: 200 }, (_, index) => ({
      ...rows[0]!,
      id: index + 1,
      idempotencyKey: `isolation-many-${index + 1}`,
    }));
    const push = vi.fn(async () => {
      throw httpError(400);
    });
    const markRetry = vi.fn(
      async (
        _id: number,
        _plan: {
          attempts: number;
          status: "pending" | "dead_letter";
          nextRetryAt: string | null;
          lastError: string;
        },
      ) => {},
    );
    const markRejected = vi.fn(async () => {});
    const deps: SyncEnginePushDeps = {
      drain: async () => manyRows,
      push,
      markSuccess: vi.fn(async () => {}),
      markRetry,
      markRejected,
      planRetry: (attempts, _now, lastError) => ({
        attempts: attempts + 1,
        status: "pending",
        nextRetryAt: new Date(now.getTime() + 60_000).toISOString(),
        lastError,
      }),
      now: () => now,
    };

    const result = await runSyncEnginePushOnce(deps, { limit: 200 });

    expect(push).toHaveBeenCalledTimes(8);
    expect(result).toEqual({
      drained: 200,
      pushed: 0,
      rejected: 1,
      retried: 199,
    });
    expect(markRejected).toHaveBeenCalledTimes(1);
    expect(markRetry).toHaveBeenCalledTimes(199);
    for (const [, plan] of markRetry.mock.calls) {
      expect(plan).toMatchObject({
        attempts: 0,
        status: "pending",
        lastError: "batch_isolation",
      });
      expect(plan.nextRetryAt).not.toBeNull();
    }
  });

  it("makes progress across ticks when 256 rows all fail validation", async () => {
    let available = Array.from({ length: 256 }, (_, index) => ({
      ...rows[0]!,
      id: index + 1,
      idempotencyKey: `isolation-large-${index + 1}`,
    }));
    const push = vi.fn(async () => {
      throw httpError(400);
    });
    const markRejected = vi.fn(async (id: number) => {
      available = available.filter((row) => row.id !== id);
    });
    const markRetry = vi.fn(async () => {});
    const deps: SyncEnginePushDeps = {
      drain: async () => available,
      push,
      markSuccess: vi.fn(async () => {}),
      markRetry,
      markRejected,
      planRetry: (attempts, _now, lastError) => ({
        attempts: attempts + 1,
        status: "pending",
        nextRetryAt: now.toISOString(),
        lastError,
      }),
      now: () => now,
    };

    const first = await runSyncEnginePushOnce(deps, { limit: 256 });
    const second = await runSyncEnginePushOnce(deps, { limit: 256 });

    expect(first).toMatchObject({ rejected: 1, hasMore: true });
    expect(second.rejected).toBe(1);
    expect(markRejected.mock.calls.map(([id]) => id)).toEqual([1, 2]);
    expect(push).toHaveBeenCalledTimes(16);
    expect(markRetry).toHaveBeenCalledTimes(508);
  });

  it("stops splitting on 429 and honours Retry-After for unsent siblings", async () => {
    const push = vi.fn(async (ops: SyncV2PushOp[]) => {
      if (ops.length === 3) throw httpError(400);
      if (ops.length === 1)
        throw new ApiError({
          kind: "http",
          status: 429,
          retryAfterMs: 20_000,
          message: "rate limit",
          url: "/api/v2/sync/push",
        });
      throw new Error("Unsent sibling should not be pushed after 429");
    });
    const markRetry = vi.fn(
      async (
        _id: number,
        _plan: {
          attempts: number;
          status: "pending" | "dead_letter";
          nextRetryAt: string | null;
          lastError: string;
        },
      ) => {},
    );
    const deps: SyncEnginePushDeps = {
      drain: async () => rows,
      push,
      markSuccess: vi.fn(async () => {}),
      markRetry,
      markRejected: vi.fn(async () => {}),
      planRetry: (attempts, _now, lastError) => ({
        attempts: attempts + 1,
        status: "pending",
        nextRetryAt: null,
        lastError,
      }),
      now: () => now,
    };
    const result = await runSyncEnginePushOnce(deps, { limit: 200 });
    expect(result).toEqual({ drained: 3, pushed: 0, retried: 3, rejected: 0 });
    expect(push).toHaveBeenCalledTimes(2);
    expect(markRetry).toHaveBeenCalledTimes(3);
    for (const [, plan] of markRetry.mock.calls) {
      expect(plan).toMatchObject({
        attempts: 0,
        status: "pending",
        lastError: "http_429",
        nextRetryAt: new Date(now.getTime() + 20_000).toISOString(),
      });
    }
  });
});
