/**
 * Canonical fixtures for `POST /api/v2/sync/push` and
 * `GET /api/v2/sync/pull?since=…`.
 *
 * The routes live in `apps/server/src/routes/sync.ts`, handled by
 * `apps/server/src/modules/sync/syncV2.ts`. Both sides derive their types
 * from `SyncV2PushResponse` / `SyncV2PullResponse` / `SyncV2PushOp` /
 * `SyncV2PullOp` in `packages/api-client/src/endpoints/syncV2.ts`.
 *
 * The `id` and `last_op_id` fields are BIGSERIAL-backed on the server but
 * coerced to `number` before serialisation (AGENTS.md Hard Rule #1 — no
 * raw bigint on the wire). Fixtures must use `number`, never string.
 *
 * Named cases:
 *
 * Push success:
 * - `pushAllApplied` — two ops, both applied; `accepted: 2`, `last_op_id` set.
 * - `pushPartialReject` — one applied, one rejected; `accepted: 1`, reject
 *   carries `reason` (engine-level `table_not_allowed`).
 * - `pushDuplicate` — idempotent replay; `accepted: 0`, `status: "duplicate"`.
 *
 * Pull success:
 * - `pullFirstPage` — first page with two ops and a non-null `next_cursor`
 *   (more data available).
 * - `pullLastPage` — final page with one op and `next_cursor: null`
 *   (nothing more to pull).
 * - `pullEmpty` — `since` is ahead of all known ops; `{ ops: [], next_cursor: null }`.
 *
 * Closes contract slice PR-T30 from
 * `docs/testing/2026-05-05-tests-pr-plan.md` (web `/api/v2/sync/*`
 * consumer contract).
 */

// NOTE: `packages/shared` must not import from `packages/api-client` (circular
// dependency). The inline types below mirror `SyncV2PushResponse`,
// `SyncV2PullResponse`, `SyncV2OpResult`, and `SyncV2PullOp` from
// `packages/api-client/src/endpoints/syncV2.ts`. They MUST stay in sync.
// When dedicated Zod schemas are added to `@sergeant/shared` for these
// response shapes, replace these inline types with `z.infer<>` re-exports.

/** Minimal inline type mirrors for SyncV2PushResponse / SyncV2PullResponse.
 *  These MUST stay in sync with the definitions in
 *  `packages/api-client/src/endpoints/syncV2.ts`. */
interface SyncV2OpResult {
  idempotency_key: string;
  status: "applied" | "duplicate" | "rejected";
  reason?: string;
}
interface SyncV2PushResponseShape {
  accepted: number;
  last_op_id: number;
  results: SyncV2OpResult[];
}

interface SyncV2PullOpShape {
  id: number;
  table: string;
  op: "insert" | "update" | "delete" | "increment";
  row: Record<string, unknown>;
  client_ts: string;
  server_ts: string;
  origin_device_id: string | null;
}
interface SyncV2PullResponseShape {
  ops: SyncV2PullOpShape[];
  next_cursor: number | null;
}

// ── Push fixtures ────────────────────────────────────────────────────────────

export const syncV2PushFixtures = {
  pushAllApplied: {
    accepted: 2,
    last_op_id: 1042,
    results: [
      {
        idempotency_key: "01HZ000000000000000000000A",
        status: "applied",
      },
      {
        idempotency_key: "01HZ000000000000000000000B",
        status: "applied",
      },
    ],
  },
  pushPartialReject: {
    accepted: 1,
    last_op_id: 1043,
    results: [
      {
        idempotency_key: "01HZ000000000000000000000C",
        status: "applied",
      },
      {
        idempotency_key: "01HZ000000000000000000000D",
        status: "rejected",
        reason: "table_not_allowed",
      },
    ],
  },
  pushDuplicate: {
    accepted: 0,
    last_op_id: 1040,
    results: [
      {
        idempotency_key: "01HZ000000000000000000000A",
        status: "duplicate",
      },
    ],
  },
} as const satisfies Record<string, SyncV2PushResponseShape>;

export type SyncV2PushFixtureCase = keyof typeof syncV2PushFixtures;

// ── Pull fixtures ────────────────────────────────────────────────────────────

export const syncV2PullFixtures = {
  pullFirstPage: {
    ops: [
      {
        id: 1001,
        table: "routine_entries",
        op: "insert",
        row: {
          id: "entry_pact_001",
          user_id: "user-pact-001",
          routine_id: "routine_001",
          completed_at: "2026-05-13T08:00:00.000Z",
          deleted_at: null,
        },
        client_ts: "2026-05-13T08:00:00.000Z",
        server_ts: "2026-05-13T08:00:01.234Z",
        origin_device_id: "device-pact-001",
      },
      {
        id: 1002,
        table: "routine_entries",
        op: "update",
        row: {
          id: "entry_pact_002",
          user_id: "user-pact-001",
          routine_id: "routine_002",
          completed_at: "2026-05-12T09:30:00.000Z",
          deleted_at: null,
        },
        client_ts: "2026-05-12T09:30:00.000Z",
        server_ts: "2026-05-12T09:30:02.100Z",
        origin_device_id: null,
      },
    ],
    next_cursor: 1002,
  },
  pullLastPage: {
    ops: [
      {
        id: 1003,
        table: "routine_streaks",
        op: "update",
        row: {
          id: "streak_pact_001",
          user_id: "user-pact-001",
          current_streak: 5,
          updated_at: "2026-05-13T08:01:00.000Z",
        },
        client_ts: "2026-05-13T08:01:00.000Z",
        server_ts: "2026-05-13T08:01:00.500Z",
        origin_device_id: "device-pact-001",
      },
    ],
    next_cursor: null,
  },
  pullEmpty: {
    ops: [],
    next_cursor: null,
  },
} as const satisfies Record<string, SyncV2PullResponseShape>;

export type SyncV2PullFixtureCase = keyof typeof syncV2PullFixtures;

/**
 * Raw `unknown`-typed views — for feeding into runtime parsers / schema checks.
 */
export const syncV2PushRawFixtures: Record<SyncV2PushFixtureCase, unknown> =
  syncV2PushFixtures;

export const syncV2PullRawFixtures: Record<SyncV2PullFixtureCase, unknown> =
  syncV2PullFixtures;

/**
 * Cheap self-check: validate the invariants documented in the api-client type
 * definitions. When dedicated Zod schemas are added for the sync v2 response
 * shapes, replace the manual checks with schema parse loops.
 */
export function assertSyncV2FixturesValid(): void {
  for (const [name, fixture] of Object.entries(syncV2PushFixtures)) {
    if (typeof fixture.accepted !== "number") {
      throw new Error(
        `Contract fixture "sync-v2.push.${name}": "accepted" must be a number`,
      );
    }
    if (typeof fixture.last_op_id !== "number") {
      throw new Error(
        `Contract fixture "sync-v2.push.${name}": "last_op_id" must be a number (Hard Rule #1 — bigint coercion)`,
      );
    }
    if (!Array.isArray(fixture.results)) {
      throw new Error(
        `Contract fixture "sync-v2.push.${name}": "results" must be an array`,
      );
    }
  }
  for (const [name, fixture] of Object.entries(syncV2PullFixtures)) {
    if (!Array.isArray(fixture.ops)) {
      throw new Error(
        `Contract fixture "sync-v2.pull.${name}": "ops" must be an array`,
      );
    }
    for (const op of fixture.ops) {
      if (typeof op.id !== "number") {
        throw new Error(
          `Contract fixture "sync-v2.pull.${name}": op.id must be a number (Hard Rule #1 — bigint coercion)`,
        );
      }
    }
    if (
      fixture.next_cursor !== null &&
      typeof fixture.next_cursor !== "number"
    ) {
      throw new Error(
        `Contract fixture "sync-v2.pull.${name}": "next_cursor" must be number or null (Hard Rule #1)`,
      );
    }
  }
}
