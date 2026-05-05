import { describe, it, expect, vi } from "vitest";

import { ApiError } from "../ApiError";

import type { SyncV2OpKind, SyncV2PushOp, SyncV2PushResponse } from "./syncV2";

import {
  describePushError,
  mapDrainedRowToSyncV2PushOp,
  runSyncEnginePushOnce,
  type DrainSyncOpOutboxFn,
  type DrainedOutboxRowShape,
  type MarkOutboxRejectedFn,
  type MarkOutboxRetryFn,
  type MarkOutboxSuccessFn,
  type PlanRetryFn,
  type SyncEnginePushDeps,
  type SyncOpRetryPlanShape,
  type SyncV2PushFn,
} from "./syncV2.pushLoop";

// Stage 5 PR #042e-pushloop (`docs/planning/storage-roadmap.md`).
//
// `runSyncEnginePushOnce` is the top-level orchestrator that ties
// together five DI primitives (drain → push → markSuccess /
// markRetry / markRejected) plus a clock and a planRetry policy.
// These tests pin the dispatch table:
//
//   - Each result-status route (`applied` / `duplicate` / `rejected`)
//     hits the correct lifecycle helper exactly once per row.
//   - Transport errors send the entire batch to retry with a stable
//     `last_error` label.
//   - The clock is sampled exactly once per tick and threaded into
//     both `drain` and every `planRetry` call.
//   - Drift-tripwires guard the camelCase ↔ snake_case mapping
//     (`mapDrainedRowToSyncV2PushOp`) and the error-classification
//     bucket scheme (`describePushError`).
//
// The orchestrator is pure — no SQLite, no real fetch — so tests
// stub every dependency with `vi.fn()` and assert the call-graph.

// Plain fixture string used for `idempotencyKey` everywhere in this
// file. Same gitleaks-allow rationale as in
// `syncV2.increment.submit.test.ts`: a constant whose name ends in
// `KEY` matches the `generic-api-key` heuristic regardless of entropy,
// so we use a non-`KEY` suffix here.
const IDEM_A = "fixture-pushloop-001"; // gitleaks:allow
const IDEM_B = "fixture-pushloop-002"; // gitleaks:allow
const IDEM_C = "fixture-pushloop-003"; // gitleaks:allow

const NOW = new Date("2026-05-05T12:00:00.000Z");

function makeRow(
  partial: Partial<DrainedOutboxRowShape> & {
    readonly id: number;
    readonly idempotencyKey: string;
  },
): DrainedOutboxRowShape {
  return {
    id: partial.id,
    table: partial.table ?? "routine_streaks",
    op: partial.op ?? ("increment" as SyncV2OpKind),
    row: partial.row ?? { delta: 1 },
    clientTs: partial.clientTs ?? "2026-05-05T11:59:00.000Z",
    idempotencyKey: partial.idempotencyKey,
    attempts: partial.attempts ?? 0,
    nextRetryAt: partial.nextRetryAt ?? null,
    lastError: partial.lastError ?? null,
    createdAt: partial.createdAt ?? "2026-05-05T11:58:00.000Z",
  };
}

function makeDeps(overrides: Partial<SyncEnginePushDeps> = {}): {
  deps: SyncEnginePushDeps;
  drain: ReturnType<typeof vi.fn> & DrainSyncOpOutboxFn;
  push: ReturnType<typeof vi.fn> & SyncV2PushFn;
  markSuccess: ReturnType<typeof vi.fn> & MarkOutboxSuccessFn;
  markRetry: ReturnType<typeof vi.fn> & MarkOutboxRetryFn;
  markRejected: ReturnType<typeof vi.fn> & MarkOutboxRejectedFn;
  planRetry: ReturnType<typeof vi.fn> & PlanRetryFn;
  now: ReturnType<typeof vi.fn> & (() => Date);
} {
  const drain = vi.fn(async () => [] as readonly DrainedOutboxRowShape[]);
  const push = vi.fn(
    async () =>
      ({
        accepted: 0,
        last_op_id: 0,
        results: [],
      }) as SyncV2PushResponse,
  );
  const markSuccess = vi.fn(async () => {});
  const markRetry = vi.fn(async () => {});
  const markRejected = vi.fn(async () => {});
  const planRetry = vi.fn(
    (previousAttempts: number, _now: Date, lastError: string) => ({
      attempts: previousAttempts + 1,
      status: "pending" as const,
      nextRetryAt: "2026-05-05T12:01:00.000Z",
      lastError,
    }),
  );
  const now = vi.fn(() => NOW);

  const deps: SyncEnginePushDeps = {
    drain: overrides.drain ?? (drain as unknown as DrainSyncOpOutboxFn),
    push: overrides.push ?? (push as unknown as SyncV2PushFn),
    markSuccess:
      overrides.markSuccess ?? (markSuccess as unknown as MarkOutboxSuccessFn),
    markRetry:
      overrides.markRetry ?? (markRetry as unknown as MarkOutboxRetryFn),
    markRejected:
      overrides.markRejected ??
      (markRejected as unknown as MarkOutboxRejectedFn),
    planRetry: overrides.planRetry ?? (planRetry as unknown as PlanRetryFn),
    now: overrides.now ?? (now as unknown as () => Date),
  };

  return {
    deps,
    drain: drain as ReturnType<typeof vi.fn> & DrainSyncOpOutboxFn,
    push: push as ReturnType<typeof vi.fn> & SyncV2PushFn,
    markSuccess: markSuccess as ReturnType<typeof vi.fn> & MarkOutboxSuccessFn,
    markRetry: markRetry as ReturnType<typeof vi.fn> & MarkOutboxRetryFn,
    markRejected: markRejected as ReturnType<typeof vi.fn> &
      MarkOutboxRejectedFn,
    planRetry: planRetry as ReturnType<typeof vi.fn> & PlanRetryFn,
    now: now as ReturnType<typeof vi.fn> & (() => Date),
  };
}

describe("runSyncEnginePushOnce — empty drain short-circuits", () => {
  it("returns zeros without calling push or any lifecycle helper", async () => {
    const { deps, drain, push, markSuccess, markRetry, markRejected } =
      makeDeps();
    drain.mockResolvedValueOnce([]);

    const result = await runSyncEnginePushOnce(deps, { limit: 100 });

    expect(result).toEqual({
      drained: 0,
      pushed: 0,
      retried: 0,
      rejected: 0,
    });
    expect(push).not.toHaveBeenCalled();
    expect(markSuccess).not.toHaveBeenCalled();
    expect(markRetry).not.toHaveBeenCalled();
    expect(markRejected).not.toHaveBeenCalled();
  });

  it("forwards the pinned clock and limit verbatim to drain", async () => {
    const { deps, drain } = makeDeps();
    drain.mockResolvedValueOnce([]);

    await runSyncEnginePushOnce(deps, { limit: 17 });

    expect(drain).toHaveBeenCalledTimes(1);
    expect(drain).toHaveBeenCalledWith({ limit: 17, now: NOW });
  });
});

describe("runSyncEnginePushOnce — happy path: applied + duplicate", () => {
  it("DELETEs each acknowledged row exactly once", async () => {
    const { deps, drain, push, markSuccess, markRetry, markRejected } =
      makeDeps();
    drain.mockResolvedValueOnce([
      makeRow({ id: 1, idempotencyKey: IDEM_A }),
      makeRow({ id: 2, idempotencyKey: IDEM_B }),
    ]);
    push.mockResolvedValueOnce({
      accepted: 2,
      last_op_id: 99,
      results: [
        { idempotency_key: IDEM_A, status: "applied" },
        { idempotency_key: IDEM_B, status: "duplicate" },
      ],
    });

    const result = await runSyncEnginePushOnce(deps, { limit: 100 });

    expect(result).toEqual({
      drained: 2,
      pushed: 2,
      retried: 0,
      rejected: 0,
    });
    expect(markSuccess).toHaveBeenCalledTimes(2);
    expect(markSuccess).toHaveBeenNthCalledWith(1, 1);
    expect(markSuccess).toHaveBeenNthCalledWith(2, 2);
    expect(markRetry).not.toHaveBeenCalled();
    expect(markRejected).not.toHaveBeenCalled();
  });

  it("forwards the camelCase→snake_case wire shape verbatim", async () => {
    const { deps, drain, push } = makeDeps();
    drain.mockResolvedValueOnce([
      makeRow({
        id: 7,
        idempotencyKey: IDEM_A,
        table: "routine_streaks",
        op: "increment" as SyncV2OpKind,
        row: { delta: -3 },
        clientTs: "2026-05-05T11:30:00.000Z",
      }),
    ]);
    push.mockResolvedValueOnce({
      accepted: 1,
      last_op_id: 1,
      results: [{ idempotency_key: IDEM_A, status: "applied" }],
    });

    await runSyncEnginePushOnce(deps, { limit: 50 });

    expect(push).toHaveBeenCalledTimes(1);
    const [opsArg, optionsArg] = push.mock.calls[0]!;
    expect(opsArg).toEqual([
      {
        table: "routine_streaks",
        op: "increment",
        row: { delta: -3 },
        client_ts: "2026-05-05T11:30:00.000Z",
        idempotency_key: IDEM_A,
      },
    ]);
    // No originDeviceId → push is called with `undefined` opts.
    expect(optionsArg).toBeUndefined();
  });

  it("threads `originDeviceId` into push opts when present", async () => {
    const { deps, drain, push } = makeDeps();
    drain.mockResolvedValueOnce([makeRow({ id: 1, idempotencyKey: IDEM_A })]);
    push.mockResolvedValueOnce({
      accepted: 1,
      last_op_id: 1,
      results: [{ idempotency_key: IDEM_A, status: "applied" }],
    });

    await runSyncEnginePushOnce(deps, {
      limit: 50,
      originDeviceId: "device-abc",
    });

    expect(push.mock.calls[0]![1]).toEqual({ originDeviceId: "device-abc" });
  });
});

describe("runSyncEnginePushOnce — terminal reject path", () => {
  it("UPDATEs status='rejected' with the server-provided reason", async () => {
    const { deps, drain, push, markSuccess, markRetry, markRejected } =
      makeDeps();
    drain.mockResolvedValueOnce([makeRow({ id: 5, idempotencyKey: IDEM_A })]);
    push.mockResolvedValueOnce({
      accepted: 0,
      last_op_id: 0,
      results: [
        {
          idempotency_key: IDEM_A,
          status: "rejected",
          reason: "op_not_supported",
        },
      ],
    });

    const result = await runSyncEnginePushOnce(deps, { limit: 100 });

    expect(result).toEqual({
      drained: 1,
      pushed: 0,
      retried: 0,
      rejected: 1,
    });
    expect(markRejected).toHaveBeenCalledTimes(1);
    expect(markRejected).toHaveBeenCalledWith(5, "op_not_supported");
    expect(markSuccess).not.toHaveBeenCalled();
    expect(markRetry).not.toHaveBeenCalled();
  });

  it("falls back to 'unspecified' when reason is missing or empty", async () => {
    const { deps, drain, push, markRejected } = makeDeps();
    drain.mockResolvedValueOnce([
      makeRow({ id: 1, idempotencyKey: IDEM_A }),
      makeRow({ id: 2, idempotencyKey: IDEM_B }),
    ]);
    push.mockResolvedValueOnce({
      accepted: 0,
      last_op_id: 0,
      results: [
        { idempotency_key: IDEM_A, status: "rejected" },
        { idempotency_key: IDEM_B, status: "rejected", reason: "" },
      ],
    });

    await runSyncEnginePushOnce(deps, { limit: 100 });

    expect(markRejected).toHaveBeenCalledTimes(2);
    expect(markRejected).toHaveBeenNthCalledWith(1, 1, "unspecified");
    expect(markRejected).toHaveBeenNthCalledWith(2, 2, "unspecified");
  });
});

describe("runSyncEnginePushOnce — transport failure (whole batch retry)", () => {
  it("UPDATEs every drained row with a planRetry plan keyed on `network`", async () => {
    const {
      deps,
      drain,
      push,
      markSuccess,
      markRetry,
      markRejected,
      planRetry,
    } = makeDeps();
    drain.mockResolvedValueOnce([
      makeRow({ id: 10, idempotencyKey: IDEM_A, attempts: 0 }),
      makeRow({ id: 11, idempotencyKey: IDEM_B, attempts: 1 }),
    ]);
    push.mockRejectedValueOnce(
      new ApiError({
        kind: "network",
        message: "fetch failed",
        url: "https://api.example.com/api/v2/sync/push",
      }),
    );

    const result = await runSyncEnginePushOnce(deps, { limit: 100 });

    expect(result).toEqual({
      drained: 2,
      pushed: 0,
      retried: 2,
      rejected: 0,
    });
    expect(planRetry).toHaveBeenCalledTimes(2);
    expect(planRetry).toHaveBeenNthCalledWith(1, 0, NOW, "network");
    expect(planRetry).toHaveBeenNthCalledWith(2, 1, NOW, "network");
    expect(markRetry).toHaveBeenCalledTimes(2);
    // The plan returned by the stub has `attempts = previous + 1`,
    // status='pending', and a fixed nextRetryAt — the test pins the
    // shape passes through to markRetry verbatim.
    expect(markRetry).toHaveBeenNthCalledWith(1, 10, {
      attempts: 1,
      status: "pending",
      nextRetryAt: "2026-05-05T12:01:00.000Z",
      lastError: "network",
    });
    expect(markRetry).toHaveBeenNthCalledWith(2, 11, {
      attempts: 2,
      status: "pending",
      nextRetryAt: "2026-05-05T12:01:00.000Z",
      lastError: "network",
    });
    expect(markSuccess).not.toHaveBeenCalled();
    expect(markRejected).not.toHaveBeenCalled();
  });

  it("threads a `dead_letter` plan from planRetry through unchanged", async () => {
    // planRetry is the single source of truth for the dead-letter
    // flip (PR #042e-prep). The orchestrator must not second-guess
    // its decision — pass the plan to markRetry verbatim.
    const deadPlan: SyncOpRetryPlanShape = {
      attempts: 5,
      status: "dead_letter",
      nextRetryAt: null,
      lastError: "network",
    };
    const planRetry = vi.fn(() => deadPlan);
    const { deps, drain, push, markRetry } = makeDeps({
      planRetry: planRetry as unknown as PlanRetryFn,
    });
    drain.mockResolvedValueOnce([
      makeRow({ id: 1, idempotencyKey: IDEM_A, attempts: 4 }),
    ]);
    push.mockRejectedValueOnce(
      new ApiError({
        kind: "network",
        message: "fetch failed",
        url: "https://api.example.com/api/v2/sync/push",
      }),
    );

    await runSyncEnginePushOnce(deps, { limit: 100 });

    expect(markRetry).toHaveBeenCalledTimes(1);
    expect(markRetry).toHaveBeenCalledWith(1, deadPlan);
  });

  it("classifies HTTP 503 as `http_503`", async () => {
    const { deps, drain, push, planRetry } = makeDeps();
    drain.mockResolvedValueOnce([makeRow({ id: 1, idempotencyKey: IDEM_A })]);
    push.mockRejectedValueOnce(
      new ApiError({
        kind: "http",
        status: 503,
        message: "service unavailable",
        url: "https://api.example.com/api/v2/sync/push",
      }),
    );

    await runSyncEnginePushOnce(deps, { limit: 100 });

    expect(planRetry).toHaveBeenCalledWith(0, NOW, "http_503");
  });

  it("classifies HTTP 401 as `http_401` (transient — re-auth out of band)", async () => {
    const { deps, drain, push, planRetry } = makeDeps();
    drain.mockResolvedValueOnce([makeRow({ id: 1, idempotencyKey: IDEM_A })]);
    push.mockRejectedValueOnce(
      new ApiError({
        kind: "http",
        status: 401,
        message: "unauthorised",
        url: "https://api.example.com/api/v2/sync/push",
      }),
    );

    await runSyncEnginePushOnce(deps, { limit: 100 });

    expect(planRetry).toHaveBeenCalledWith(0, NOW, "http_401");
  });

  it("classifies an unknown thrown value as `unknown`", async () => {
    const { deps, drain, push, planRetry } = makeDeps();
    drain.mockResolvedValueOnce([makeRow({ id: 1, idempotencyKey: IDEM_A })]);
    push.mockRejectedValueOnce(new TypeError("boom"));

    await runSyncEnginePushOnce(deps, { limit: 100 });

    expect(planRetry).toHaveBeenCalledWith(0, NOW, "unknown");
  });
});

describe("runSyncEnginePushOnce — mixed batch", () => {
  it("dispatches each row to its own lifecycle helper and counts correctly", async () => {
    const { deps, drain, push, markSuccess, markRetry, markRejected } =
      makeDeps();
    drain.mockResolvedValueOnce([
      makeRow({ id: 1, idempotencyKey: IDEM_A }),
      makeRow({ id: 2, idempotencyKey: IDEM_B }),
      makeRow({ id: 3, idempotencyKey: IDEM_C }),
    ]);
    push.mockResolvedValueOnce({
      accepted: 1,
      last_op_id: 5,
      results: [
        { idempotency_key: IDEM_A, status: "applied" },
        {
          idempotency_key: IDEM_B,
          status: "rejected",
          reason: "tombstoned",
        },
        // No result for IDEM_C → row goes to retry with
        // `last_error="missing_result"`.
      ],
    });

    const result = await runSyncEnginePushOnce(deps, { limit: 100 });

    expect(result).toEqual({
      drained: 3,
      pushed: 1,
      retried: 1,
      rejected: 1,
    });
    expect(markSuccess).toHaveBeenCalledTimes(1);
    expect(markSuccess).toHaveBeenCalledWith(1);
    expect(markRejected).toHaveBeenCalledTimes(1);
    expect(markRejected).toHaveBeenCalledWith(2, "tombstoned");
    expect(markRetry).toHaveBeenCalledTimes(1);
    const [retriedId, retriedPlan] = markRetry.mock.calls[0]!;
    expect(retriedId).toBe(3);
    expect(retriedPlan.lastError).toBe("missing_result");
  });

  it("retries on an unknown forward-compat status with a labelled error", async () => {
    const { deps, drain, push, planRetry, markRetry } = makeDeps();
    drain.mockResolvedValueOnce([makeRow({ id: 1, idempotencyKey: IDEM_A })]);
    push.mockResolvedValueOnce({
      accepted: 0,
      last_op_id: 0,
      results: [
        // Cast through `unknown` to bypass the union narrowing — the
        // orchestrator must still dispatch sanely to retry.
        { idempotency_key: IDEM_A, status: "future_status" } as unknown as {
          idempotency_key: string;
          status: "applied" | "duplicate" | "rejected";
        },
      ],
    });

    await runSyncEnginePushOnce(deps, { limit: 100 });

    expect(planRetry).toHaveBeenCalledWith(
      0,
      NOW,
      "unknown_status:future_status",
    );
    expect(markRetry).toHaveBeenCalledTimes(1);
  });
});

describe("runSyncEnginePushOnce — clock invariants", () => {
  it("samples `now` exactly once per tick and threads it everywhere", async () => {
    const { deps, drain, push, planRetry, now } = makeDeps();
    drain.mockResolvedValueOnce([
      makeRow({ id: 1, idempotencyKey: IDEM_A }),
      makeRow({ id: 2, idempotencyKey: IDEM_B }),
    ]);
    push.mockRejectedValueOnce(
      new ApiError({
        kind: "network",
        message: "fetch failed",
        url: "https://api.example.com/api/v2/sync/push",
      }),
    );

    await runSyncEnginePushOnce(deps, { limit: 100 });

    expect(now).toHaveBeenCalledTimes(1);
    // drain receives the same `now` instance.
    expect(drain.mock.calls[0]![0]).toEqual({ limit: 100, now: NOW });
    // every planRetry call receives the same `now` instance.
    for (const call of planRetry.mock.calls) {
      expect(call[1]).toBe(NOW);
    }
  });
});

describe("mapDrainedRowToSyncV2PushOp — drift tripwire", () => {
  it("flattens camelCase → snake_case byte-aligned", () => {
    const row = makeRow({
      id: 7,
      idempotencyKey: IDEM_A,
      table: "routine_streaks",
      op: "increment" as SyncV2OpKind,
      row: { delta: 1 },
      clientTs: "2026-05-05T11:30:00.000Z",
    });

    const op: SyncV2PushOp = mapDrainedRowToSyncV2PushOp(row);

    expect(op).toEqual({
      table: "routine_streaks",
      op: "increment",
      row: { delta: 1 },
      client_ts: "2026-05-05T11:30:00.000Z",
      idempotency_key: IDEM_A,
    });
    // Drift-tripwire: confirm we did NOT thread local-only fields
    // (id / attempts / nextRetryAt / lastError / createdAt) into the
    // wire envelope. A regression here would leak DB internals.
    expect(Object.keys(op).sort()).toEqual([
      "client_ts",
      "idempotency_key",
      "op",
      "row",
      "table",
    ]);
  });

  it("passes `row` by reference (no copy / no key sort)", () => {
    const innerRow = { delta: 1, extra: "kept" };
    const row = makeRow({ id: 1, idempotencyKey: IDEM_A, row: innerRow });

    const op = mapDrainedRowToSyncV2PushOp(row);

    expect(op.row).toBe(innerRow);
  });

  it("supports each op kind without translation", () => {
    const kinds: ReadonlyArray<SyncV2OpKind> = [
      "insert",
      "update",
      "delete",
      "increment",
    ];
    for (const op of kinds) {
      const row = makeRow({ id: 1, idempotencyKey: IDEM_A, op });
      expect(mapDrainedRowToSyncV2PushOp(row).op).toBe(op);
    }
  });
});

describe("describePushError — bucket scheme", () => {
  it("maps each ApiError kind to its stable bucket", () => {
    expect(
      describePushError(
        new ApiError({
          kind: "aborted",
          message: "aborted",
          url: "https://example.com",
        }),
      ),
    ).toBe("aborted");
    expect(
      describePushError(
        new ApiError({
          kind: "network",
          message: "fetch failed",
          url: "https://example.com",
        }),
      ),
    ).toBe("network");
    expect(
      describePushError(
        new ApiError({
          kind: "parse",
          message: "bad json",
          url: "https://example.com",
        }),
      ),
    ).toBe("parse");
  });

  it("includes the HTTP status code for `kind=http`", () => {
    expect(
      describePushError(
        new ApiError({
          kind: "http",
          status: 500,
          message: "boom",
          url: "https://example.com",
        }),
      ),
    ).toBe("http_500");
    expect(
      describePushError(
        new ApiError({
          kind: "http",
          status: 429,
          message: "too many",
          url: "https://example.com",
        }),
      ),
    ).toBe("http_429");
  });

  it("falls back to `http_5xx` for `kind=http` with no status (status=0)", () => {
    // ApiError init w/o `status` → instance `status === 0`. We never
    // emit `http_0` — it would be misleading. Bucket as a generic 5xx.
    expect(
      describePushError(
        new ApiError({
          kind: "http",
          message: "no status set",
          url: "https://example.com",
        }),
      ),
    ).toBe("http_5xx");
  });

  it("classifies non-ApiError throwables as `unknown`", () => {
    expect(describePushError(new TypeError("boom"))).toBe("unknown");
    expect(describePushError("string error")).toBe("unknown");
    expect(describePushError(undefined)).toBe("unknown");
    expect(describePushError({ message: "shaped, but not an ApiError" })).toBe(
      "unknown",
    );
  });
});
