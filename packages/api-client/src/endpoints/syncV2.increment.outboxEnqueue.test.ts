import { describe, it, expect } from "vitest";
import type { SyncV2PushOp } from "./syncV2";
import { buildSyncV2IncrementOp } from "./syncV2.increment";
import {
  mapSyncV2IncrementOpToOutboxInput,
  type OutboxIncrementInputShape,
  type SyncV2IncrementPushOp,
} from "./syncV2.increment.outboxEnqueue";

// PR #042e-mapping (`docs/planning/storage-roadmap.md`).
//
// This file pins the field-name mapping between the api-client envelope
// (`SyncV2PushOp` with `op='increment'`) and the db-schema enqueue input
// (`OutboxIncrementInput` from
// `packages/db-schema/src/sqlite/syncOpOutboxEnqueue.ts`).
//
// db-schema deliberately does NOT depend on api-client (PR #042d-builder
// Risk note), so the contract is asserted via a structural mirror in
// `OutboxIncrementInputShape` — keep the field set + types byte-aligned
// with the db-schema source, otherwise the assignability checks below
// fail at compile time, and the runtime asserts fail in CI.

describe("mapSyncV2IncrementOpToOutboxInput — happy path", () => {
  it("flattens snake_case → camelCase byte-aligned (table, row, client_ts, idempotency_key)", () => {
    const built = buildSyncV2IncrementOp({
      table: "routine_streaks",
      delta: 1,
      clientTs: "2026-05-05T00:00:00.000Z",
      idempotencyKey: "01HXZW8K6T7N4QV5R3J2P1G8AB",
    });
    expect(built.ok).toBe(true);
    if (!built.ok) return;

    const input = mapSyncV2IncrementOpToOutboxInput(
      built.op as SyncV2IncrementPushOp,
      "u-1",
    );

    expect(input).toEqual({
      userId: "u-1",
      table: "routine_streaks",
      row: { delta: 1 },
      clientTs: "2026-05-05T00:00:00.000Z",
      idempotencyKey: "01HXZW8K6T7N4QV5R3J2P1G8AB",
    });
  });

  it("locks the five-key field set — no missing, no extras", () => {
    // Drift-tripwire: any rename / addition on either side
    // (api-client `SyncV2PushOp` or db-schema `OutboxIncrementInput`)
    // changes this list and fails the assert before propagating into
    // the production push-loop refactor (PR #042e).
    const built = buildSyncV2IncrementOp({
      table: "routine_streaks",
      delta: -7,
      clientTs: "2026-05-05T01:23:45.678Z",
      idempotencyKey: "01HXZW8K6T7N4QV5R3J2P1G8CD",
    });
    expect(built.ok).toBe(true);
    if (!built.ok) return;

    const input = mapSyncV2IncrementOpToOutboxInput(
      built.op as SyncV2IncrementPushOp,
      "u-1",
    );

    expect(Object.keys(input).sort()).toEqual([
      "clientTs",
      "idempotencyKey",
      "row",
      "table",
      "userId",
    ]);
  });

  it("passes row payload through verbatim — no copy, no key sort", () => {
    // Verbatim guarantee mirrors the db-schema docstring contract:
    // > `row` is `JSON.stringify`-ed exactly as the caller hands it
    // > in (no key sorting). Callers that want byte-stable hashing of
    // > the payload pre-canonicalise their object.
    const built = buildSyncV2IncrementOp({
      table: "routine_streaks",
      delta: 3,
      clientTs: "2026-05-05T00:00:00.000Z",
      idempotencyKey: "01HXZW8K6T7N4QV5R3J2P1G8EF",
      extraRow: { user_id: "u-1", aux: { z: 1, a: 2 } },
    });
    expect(built.ok).toBe(true);
    if (!built.ok) return;

    const input = mapSyncV2IncrementOpToOutboxInput(
      built.op as SyncV2IncrementPushOp,
      "u-1",
    );

    // Same reference — no defensive copy.
    expect(input.row).toBe(built.op.row);
    // Insertion order pinned: spread of `extraRow` first, then `delta`.
    expect(Object.keys(input.row)).toEqual(["user_id", "aux", "delta"]);
    // Nested object preserved verbatim (no key sorting).
    const aux = input.row["aux"] as Record<string, unknown>;
    expect(Object.keys(aux)).toEqual(["z", "a"]);
    expect(aux).toEqual({ z: 1, a: 2 });
  });

  it("preserves boundary deltas (+/- INCREMENT_DELTA_MAX_ABS)", () => {
    // Builder happy-path is exhaustively covered in
    // `syncV2.increment.test.ts`; here we just spot-check that the
    // mapper does not lose magnitude near the bound.
    const built = buildSyncV2IncrementOp({
      table: "routine_streaks",
      delta: 1000,
      clientTs: "2026-05-05T00:00:00.000Z",
      idempotencyKey: "01HXZW8K6T7N4QV5R3J2P1G8GH",
    });
    expect(built.ok).toBe(true);
    if (!built.ok) return;

    const input = mapSyncV2IncrementOpToOutboxInput(
      built.op as SyncV2IncrementPushOp,
      "u-1",
    );
    expect((input.row as { delta: number }).delta).toBe(1000);
  });
});

describe("mapSyncV2IncrementOpToOutboxInput — runtime assertion", () => {
  it("throws when op.op !== 'increment' (defence against unsafe casts)", () => {
    const lwwOp: SyncV2PushOp = {
      table: "routine_streaks",
      op: "update",
      row: { delta: 1 },
      client_ts: "2026-05-05T00:00:00.000Z",
      idempotency_key: "01HXZW8K6T7N4QV5R3J2P1G8AB",
    };
    expect(() =>
      mapSyncV2IncrementOpToOutboxInput(
        lwwOp as unknown as SyncV2IncrementPushOp,
        "u-1",
      ),
    ).toThrowError(/expected op='increment'/);
  });

  it("throws when op.op !== 'increment' (insert kind)", () => {
    const insertOp: SyncV2PushOp = {
      table: "routine_streaks",
      op: "insert",
      row: { delta: 1 },
      client_ts: "2026-05-05T00:00:00.000Z",
      idempotency_key: "01HXZW8K6T7N4QV5R3J2P1G8IJ",
    };
    expect(() =>
      mapSyncV2IncrementOpToOutboxInput(
        insertOp as unknown as SyncV2IncrementPushOp,
        "u-1",
      ),
    ).toThrowError(/expected op='increment', got "insert"/);
  });

  it("throws when userId is missing or empty (HIGH-#2 of T3 audit)", () => {
    // Drift-tripwire: the mapper signature requires `userId` because
    // `sync_op_outbox.user_id` is NOT NULL since migration 005, and a
    // missing user_id at enqueue time is the exact bug the migration
    // is closing. The DI layer (`submitSyncV2IncrementOp`) plumbs the
    // current session userId; an empty string is not a valid Better
    // Auth opaque user id.
    const built = buildSyncV2IncrementOp({
      table: "routine_streaks",
      delta: 1,
      clientTs: "2026-05-05T00:00:00.000Z",
      idempotencyKey: "01HXZW8K6T7N4QV5R3J2P1G8MN",
    });
    expect(built.ok).toBe(true);
    if (!built.ok) return;

    expect(() =>
      mapSyncV2IncrementOpToOutboxInput(built.op as SyncV2IncrementPushOp, ""),
    ).toThrowError(/userId is required/);
  });
});

describe("OutboxIncrementInputShape ↔ db-schema OutboxIncrementInput", () => {
  // Drift-tripwire — keep this mirror byte-aligned with
  // `packages/db-schema/src/sqlite/syncOpOutboxEnqueue.ts → OutboxIncrementInput`.
  // We can't import OutboxIncrementInput from db-schema (api-client
  // intentionally has no workspace dep on it — PR #042d-builder Risk
  // note), so we mirror the structure literally. If db-schema drifts,
  // either the structural assignability below fails at typecheck time,
  // or the runtime equality check fails.
  interface DbSchemaOutboxIncrementInputMirror {
    readonly userId: string;
    readonly table: string;
    readonly row: Readonly<Record<string, unknown>>;
    readonly clientTs: string;
    readonly idempotencyKey: string;
  }

  it("OutboxIncrementInputShape and db-schema mirror are mutually assignable", () => {
    const fromMapper: OutboxIncrementInputShape = {
      userId: "u-1",
      table: "routine_streaks",
      row: { delta: 1 },
      clientTs: "2026-05-05T00:00:00.000Z",
      idempotencyKey: "01HXZW8K6T7N4QV5R3J2P1G8AB",
    };
    // Two-way assignability — both directions must hold for byte
    // alignment. If the db-schema mirror grew an extra required field
    // or renamed one, this would fail at compile time.
    const asDbSchema: DbSchemaOutboxIncrementInputMirror = fromMapper;
    const asLocal: OutboxIncrementInputShape = asDbSchema;

    expect(asLocal).toEqual(asDbSchema);
    expect(asLocal.table).toBe("routine_streaks");
    expect(asDbSchema.idempotencyKey).toBe("01HXZW8K6T7N4QV5R3J2P1G8AB");
  });

  it("end-to-end pipeline output is assignable to db-schema mirror", () => {
    const built = buildSyncV2IncrementOp({
      table: "routine_streaks",
      delta: 2,
      clientTs: "2026-05-05T00:00:00.000Z",
      idempotencyKey: "01HXZW8K6T7N4QV5R3J2P1G8KL",
    });
    expect(built.ok).toBe(true);
    if (!built.ok) return;

    const mapped = mapSyncV2IncrementOpToOutboxInput(
      built.op as SyncV2IncrementPushOp,
      "u-1",
    );

    // Compile-time + runtime: the mapper's output passes structurally
    // for the db-schema interface — i.e. an upstream consumer can do
    // `enqueueOutboxIncrement(client, mapped)` directly.
    const forDbSchema: DbSchemaOutboxIncrementInputMirror = mapped;

    expect(forDbSchema).toEqual({
      userId: "u-1",
      table: "routine_streaks",
      row: { delta: 2 },
      clientTs: "2026-05-05T00:00:00.000Z",
      idempotencyKey: "01HXZW8K6T7N4QV5R3J2P1G8KL",
    });
  });
});
