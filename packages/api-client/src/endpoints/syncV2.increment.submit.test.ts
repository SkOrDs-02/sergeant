import { describe, it, expect, vi } from "vitest";

import {
  submitSyncV2IncrementOp,
  type SubmitSyncV2IncrementOpFn,
} from "./syncV2.increment.submit";
import type { OutboxIncrementInputShape } from "./syncV2.increment.outboxEnqueue";

// Stage 5 PR #042e (`docs/planning/storage-roadmap.md`).
//
// `submitSyncV2IncrementOp` composes three already-landed building
// blocks:
//
//   - `buildSyncV2IncrementOp`              (PR #042c)
//   - `mapSyncV2IncrementOpToOutboxInput`   (PR #042e-mapping)
//   - injected `submit`                     (mirrors `enqueueOutboxIncrement`,
//                                            PR #042d-builder)
//
// The tests here lock the contract of the composition itself — that
// the upstream reject reasons propagate 1:1, that the build-side
// short-circuits the `submit` call, and that the field-name mapping
// on the way through is byte-aligned with the db-schema enqueue input
// (mirror already verified in `syncV2.increment.outboxEnqueue.test.ts`;
// here we just assert the helper does not perturb it).
//
// Builder-side validation is exhaustively covered in
// `syncV2.increment.test.ts` — we don't re-prove `INCREMENT_DELTA_MAX_ABS=1000`
// or the per-reason-string mapping; we just spot-check the routes
// stay wired correctly.

const HAPPY_INPUT = {
  table: "routine_streaks",
  delta: 1,
  clientTs: "2026-05-05T00:00:00.000Z",
  idempotencyKey: "01HXZW8K6T7N4QV5R3J2P1G8AB",
} as const;

function makeSubmitSpy(
  result: { id: number; inserted: boolean } = { id: 42, inserted: true },
): {
  submit: SubmitSyncV2IncrementOpFn;
  calls: OutboxIncrementInputShape[];
} {
  const calls: OutboxIncrementInputShape[] = [];
  const submit: SubmitSyncV2IncrementOpFn = vi.fn(
    async (input: OutboxIncrementInputShape) => {
      calls.push(input);
      return result;
    },
  );
  return { submit, calls };
}

describe("submitSyncV2IncrementOp — happy path", () => {
  it("builds → maps → enqueues with byte-aligned camelCase fields", async () => {
    const { submit, calls } = makeSubmitSpy({ id: 7, inserted: true });

    const result = await submitSyncV2IncrementOp(submit, HAPPY_INPUT);

    expect(result).toEqual({ ok: true, id: 7, inserted: true });
    expect(calls).toHaveLength(1);
    expect(calls[0]).toEqual({
      table: "routine_streaks",
      row: { delta: 1 },
      clientTs: "2026-05-05T00:00:00.000Z",
      idempotencyKey: "01HXZW8K6T7N4QV5R3J2P1G8AB",
    });
  });

  it("threads `inserted=false` through verbatim (idempotent replay)", async () => {
    // Replay-safety contract inherited from `enqueueOutboxIncrement`:
    // `inserted=false` means an existing row was found under the
    // same `idempotencyKey`. The helper must not flip it to a reject
    // — replay is a successful no-op, not an error.
    const { submit } = makeSubmitSpy({ id: 99, inserted: false });

    const result = await submitSyncV2IncrementOp(submit, HAPPY_INPUT);

    expect(result).toEqual({ ok: true, id: 99, inserted: false });
  });

  it("preserves `extraRow` fields with delta inserted last", async () => {
    // Builder guarantees `row` insertion order: spread of `extraRow`
    // first, then `delta`. The mapper passes `row` by reference, no
    // copy / no key sort — so the helper must preserve that pin.
    const { submit, calls } = makeSubmitSpy();

    await submitSyncV2IncrementOp(submit, {
      ...HAPPY_INPUT,
      extraRow: { user_id: "u-1", aux: { z: 1, a: 2 } },
    });

    expect(calls).toHaveLength(1);
    expect(Object.keys(calls[0]!.row)).toEqual(["user_id", "aux", "delta"]);
    expect(calls[0]!.row).toEqual({
      user_id: "u-1",
      aux: { z: 1, a: 2 },
      delta: 1,
    });
  });

  it("supports negative deltas at the magnitude boundary", async () => {
    const { submit, calls } = makeSubmitSpy({ id: 1, inserted: true });

    const result = await submitSyncV2IncrementOp(submit, {
      ...HAPPY_INPUT,
      delta: -1000,
    });

    expect(result).toEqual({ ok: true, id: 1, inserted: true });
    expect((calls[0]!.row as { delta: number }).delta).toBe(-1000);
  });
});

describe("submitSyncV2IncrementOp — short-circuits on builder reject", () => {
  it("propagates `op_not_supported` and does NOT call submit", async () => {
    const { submit, calls } = makeSubmitSpy();

    const result = await submitSyncV2IncrementOp(submit, {
      table: "routine_entries", // not in INCREMENT_OP_SUPPORTED_TABLES
      delta: 1,
      clientTs: HAPPY_INPUT.clientTs,
      idempotencyKey: HAPPY_INPUT.idempotencyKey,
    });

    expect(result).toEqual({ ok: false, reason: "op_not_supported" });
    expect(calls).toHaveLength(0);
    expect(submit).not.toHaveBeenCalled();
  });

  it("propagates `missing_delta` (delta=null) and does NOT call submit", async () => {
    const { submit, calls } = makeSubmitSpy();

    const result = await submitSyncV2IncrementOp(submit, {
      ...HAPPY_INPUT,
      delta: null,
    });

    expect(result).toEqual({ ok: false, reason: "missing_delta" });
    expect(calls).toHaveLength(0);
  });

  it("propagates `missing_delta` (delta=undefined) and does NOT call submit", async () => {
    const { submit, calls } = makeSubmitSpy();

    const result = await submitSyncV2IncrementOp(submit, {
      ...HAPPY_INPUT,
      delta: undefined,
    });

    expect(result).toEqual({ ok: false, reason: "missing_delta" });
    expect(calls).toHaveLength(0);
  });

  it("propagates `invalid_delta` for non-finite delta and does NOT call submit", async () => {
    const { submit, calls } = makeSubmitSpy();

    const result = await submitSyncV2IncrementOp(submit, {
      ...HAPPY_INPUT,
      delta: Number.POSITIVE_INFINITY,
    });

    expect(result).toEqual({ ok: false, reason: "invalid_delta" });
    expect(calls).toHaveLength(0);
  });

  it("propagates `invalid_delta` for non-integer delta", async () => {
    const { submit, calls } = makeSubmitSpy();

    const result = await submitSyncV2IncrementOp(submit, {
      ...HAPPY_INPUT,
      delta: 1.5,
    });

    expect(result).toEqual({ ok: false, reason: "invalid_delta" });
    expect(calls).toHaveLength(0);
  });

  it("propagates `invalid_delta` for delta beyond +/- INCREMENT_DELTA_MAX_ABS", async () => {
    const { submit, calls } = makeSubmitSpy();

    const result = await submitSyncV2IncrementOp(submit, {
      ...HAPPY_INPUT,
      delta: 1001,
    });

    expect(result).toEqual({ ok: false, reason: "invalid_delta" });
    expect(calls).toHaveLength(0);
  });
});

describe("submitSyncV2IncrementOp — error pass-through", () => {
  it("does NOT swallow errors thrown by the injected submit", async () => {
    // Storage-layer failures (FS disk full, unrelated CHECK
    // violations, etc.) are the caller's concern — the helper must
    // not convert them into a reject reason. That keeps the cardinality
    // of `sync_op_outbox_reject_total{reason}` bounded to the 3 build
    // reasons and lets transport-layer retry policy own everything else.
    const submit: SubmitSyncV2IncrementOpFn = vi.fn(async () => {
      throw new Error("sqlite disk full");
    });

    await expect(submitSyncV2IncrementOp(submit, HAPPY_INPUT)).rejects.toThrow(
      /sqlite disk full/,
    );
    expect(submit).toHaveBeenCalledOnce();
  });
});

describe("submitSyncV2IncrementOp — reject-reason cardinality lock", () => {
  it("only emits the three documented reject reasons", async () => {
    // Drift-tripwire: if the upstream `BuildSyncV2IncrementOpReason`
    // grows a new literal, this test must change in lockstep —
    // otherwise observability dashboards under
    // `sync_op_outbox_reject_total{reason}` silently get a 4th
    // bucket without anyone updating the legend.
    const reasons = new Set<string>();
    const cases = [
      { ...HAPPY_INPUT, table: "routine_entries" },
      { ...HAPPY_INPUT, delta: null },
      { ...HAPPY_INPUT, delta: 9001 },
    ];

    for (const input of cases) {
      const { submit } = makeSubmitSpy();
      const result = await submitSyncV2IncrementOp(submit, input);
      if (!result.ok) reasons.add(result.reason);
    }

    expect([...reasons].sort()).toEqual([
      "invalid_delta",
      "missing_delta",
      "op_not_supported",
    ]);
  });
});
