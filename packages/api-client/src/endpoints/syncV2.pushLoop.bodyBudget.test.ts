import { describe, expect, it, vi } from "vitest";
import type { SyncV2PushOp } from "./syncV2";
import {
  runSyncEnginePushOnce,
  mapDrainedRowToSyncV2PushOp,
  type DrainedOutboxRowShape,
  type SyncEnginePushDeps,
} from "./syncV2.pushLoop";

function fixture() {
  const rows: DrainedOutboxRowShape[] = [1, 2, 3].map((id) => ({
    id,
    table: "finyk_budgets",
    op: "insert",
    row: { id, note: "Їжак 🍵".repeat(20) },
    clientTs: "2026-10-13T00:00:00.000Z",
    idempotencyKey: `body-budget-${id}`,
    attempts: 0,
    nextRetryAt: null,
    lastError: null,
    createdAt: "2026-10-13T00:00:00.000Z",
  }));
  const deps: SyncEnginePushDeps = {
    drain: vi.fn(async () => rows),
    push: vi.fn(async (ops: readonly SyncV2PushOp[]) => ({
      accepted: ops.length,
      last_op_id: ops.length,
      results: ops.map((op) => ({
        idempotency_key: op.idempotency_key,
        status: "applied" as const,
      })),
    })),
    markSuccess: vi.fn(async () => {}),
    markRetry: vi.fn(async () => {}),
    markRejected: vi.fn(async () => {}),
    planRetry: () => ({
      status: "pending",
      attempts: 1,
      nextRetryAt: null,
      lastError: "network",
    }),
    now: () => new Date(),
  };
  return { deps, rows };
}

describe("push batch UTF-8 body budget", () => {
  it("batch-deletes only rows with applied or duplicate receipts", async () => {
    const { deps } = fixture();
    const markSuccessBatch = vi.fn(async (_ids: readonly number[]) => {});
    const push = vi.fn(async (ops: readonly SyncV2PushOp[]) => ({
      accepted: 2,
      last_op_id: 2,
      results: [
        {
          idempotency_key: ops[0]!.idempotency_key,
          status: "applied" as const,
        },
        {
          idempotency_key: ops[1]!.idempotency_key,
          status: "duplicate" as const,
        },
      ],
    }));
    const result = await runSyncEnginePushOnce(
      { ...deps, push, markSuccessBatch },
      { limit: 200 },
    );
    expect(markSuccessBatch).toHaveBeenCalledExactlyOnceWith([1, 2]);
    expect(deps.markSuccess).not.toHaveBeenCalled();
    expect(deps.markRetry).toHaveBeenCalledOnce();
    expect(result).toMatchObject({ pushed: 2, retried: 1 });
  });
  it("sends a fitting prefix and leaves its neighbours untouched, while indicating more work", async () => {
    const { deps, rows } = fixture();
    const maxBodyBytes = new TextEncoder().encode(
      JSON.stringify({ ops: [mapDrainedRowToSyncV2PushOp(rows[0]!)] }),
    ).byteLength;
    const result = await runSyncEnginePushOnce(deps, {
      limit: 200,
      maxBodyBytes,
    });
    const sent = vi.mocked(deps.push).mock.calls[0]![0];
    expect(
      new TextEncoder().encode(JSON.stringify({ ops: sent })).byteLength,
    ).toBeLessThanOrEqual(maxBodyBytes);
    expect(sent).toHaveLength(1);
    expect(deps.markSuccess).toHaveBeenCalledExactlyOnceWith(1);
    expect(deps.markRetry).not.toHaveBeenCalled();
    expect(deps.markRejected).not.toHaveBeenCalled();
    expect(result).toMatchObject({ drained: 1, pushed: 1, hasMore: true });
  });

  it("sends an individually oversized row alone so a 413 cannot reject its neighbours", async () => {
    const { deps } = fixture();
    await runSyncEnginePushOnce(deps, { limit: 200, maxBodyBytes: 20 });
    expect(vi.mocked(deps.push).mock.calls[0]![0]).toHaveLength(1);
    expect(deps.markSuccess).toHaveBeenCalledExactlyOnceWith(1);
  });
});
