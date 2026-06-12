// @vitest-environment node
//
// Consumer contract: `POST /api/v2/sync/push` + `GET /api/v2/sync/pull`
// — per-row op-log sync (all personas that use synced tables).
//
// Why this contract:
//   - `SyncV2PushResponse.last_op_id` is BIGSERIAL-backed → number on
//     the wire (Hard Rule #1). A string would break the pull cursor
//     arithmetic on the client (`since` query param must be a number).
//   - `SyncV2PullOp.id` has the same BIGSERIAL constraint.
//   - `next_cursor: null` on the final pull page must not accidentally
//     become `0` or `undefined` (the client's poll loop terminates on
//     `null`, not on falsy).
//   - `status: "duplicate"` on idempotent replay must not be confused
//     with `"rejected"` — the client uses status to decide whether to
//     dequeue the op from the outbox.
//
// Covered here:
//   - push: all-applied (normal path)
//   - push: partial-reject (engine engine-level table_not_allowed)
//   - push: full-duplicate (idempotent replay)
//   - pull: first page (next_cursor is set)
//   - pull: last page (next_cursor: null)
//   - pull: empty page (since ahead of log)
//
// Types live in `packages/api-client/src/endpoints/syncV2.ts`.

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { PactV4 } from "@pact-foundation/pact";

import { createHttpClient } from "../../httpClient";
import { createSyncV2Endpoints } from "../../endpoints/syncV2";
import { CONTRACT_SUITE_OPTIONS, createPact } from "./_pact";

describe("contract @ POST /api/v2/sync/push", CONTRACT_SUITE_OPTIONS, () => {
  let pact: PactV4;
  beforeAll(() => {
    pact = createPact();
  });
  afterAll(() => {});

  it("returns SyncV2PushResponse with all ops applied (normal push)", async () => {
    await pact
      .addInteraction()
      .given(
        "authenticated user-pact-001 with an empty op-log; two routine_entries insert ops are valid",
      )
      .uponReceiving(
        "a POST /api/v2/sync/push with two new routine_entries insert ops",
      )
      // applyApiPrefix leaves already-versioned paths (/api/v2/...)
      // untouched, so the wire path matches the server's v2 mount
      // directly. Pact sees the wire path the client actually sends.
      .withRequest("POST", "/api/v2/sync/push", (req) => {
        req.headers({
          accept: "application/json",
          "content-type": "application/json",
        });
        req.jsonBody({
          ops: [
            {
              table: "routine_entries",
              op: "insert",
              row: {
                id: "entry_pact_001",
                user_id: "user-pact-001",
                routine_id: "routine_001",
                completed_at: "2026-05-13T08:00:00.000Z",
              },
              client_ts: "2026-05-13T08:00:00.000Z",
              idempotency_key: "01HZ000000000000000000000A",
            },
            {
              table: "routine_entries",
              op: "insert",
              row: {
                id: "entry_pact_002",
                user_id: "user-pact-001",
                routine_id: "routine_002",
                completed_at: "2026-05-12T09:30:00.000Z",
              },
              client_ts: "2026-05-12T09:30:00.000Z",
              idempotency_key: "01HZ000000000000000000000B",
            },
          ],
        });
      })
      .willRespondWith(200, (res) => {
        res.headers({ "content-type": "application/json" });
        res.jsonBody({
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
        });
      })
      .executeTest(async (mockServer) => {
        const http = createHttpClient({ baseUrl: mockServer.url });
        const sync = createSyncV2Endpoints(http);
        const out = await sync.pushV2([
          {
            table: "routine_entries",
            op: "insert",
            row: {
              id: "entry_pact_001",
              user_id: "user-pact-001",
              routine_id: "routine_001",
              completed_at: "2026-05-13T08:00:00.000Z",
            },
            client_ts: "2026-05-13T08:00:00.000Z",
            idempotency_key: "01HZ000000000000000000000A",
          },
          {
            table: "routine_entries",
            op: "insert",
            row: {
              id: "entry_pact_002",
              user_id: "user-pact-001",
              routine_id: "routine_002",
              completed_at: "2026-05-12T09:30:00.000Z",
            },
            client_ts: "2026-05-12T09:30:00.000Z",
            idempotency_key: "01HZ000000000000000000000B",
          },
        ]);

        expect(out.accepted).toBe(2);
        // Hard Rule #1: BIGSERIAL must arrive as a number, not a string.
        expect(typeof out.last_op_id).toBe("number");
        expect(out.last_op_id).toBe(1042);
        expect(out.results).toHaveLength(2);
        expect(out.results[0]!.status).toBe("applied");
        expect(out.results[1]!.status).toBe("applied");
      });
  });

  it("returns partial-reject when an op targets a non-whitelisted table", async () => {
    await pact
      .addInteraction()
      .given(
        "authenticated user-pact-001; first op targets routine_entries (allowed), second targets non_whitelisted_table (not allowed)",
      )
      .uponReceiving(
        "a POST /api/v2/sync/push where one op is table_not_allowed",
      )
      .withRequest("POST", "/api/v2/sync/push", (req) => {
        req.headers({
          accept: "application/json",
          "content-type": "application/json",
        });
        req.jsonBody({
          ops: [
            {
              table: "routine_entries",
              op: "insert",
              row: {
                id: "entry_pact_003",
                user_id: "user-pact-001",
                routine_id: "routine_003",
                completed_at: "2026-05-14T08:00:00.000Z",
              },
              client_ts: "2026-05-14T08:00:00.000Z",
              idempotency_key: "01HZ000000000000000000000C",
            },
            {
              table: "non_whitelisted_table",
              op: "insert",
              row: { id: "row_pact_001", user_id: "user-pact-001" },
              client_ts: "2026-05-14T08:00:01.000Z",
              idempotency_key: "01HZ000000000000000000000D",
            },
          ],
        });
      })
      .willRespondWith(200, (res) => {
        res.headers({ "content-type": "application/json" });
        res.jsonBody({
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
        });
      })
      .executeTest(async (mockServer) => {
        const http = createHttpClient({ baseUrl: mockServer.url });
        const sync = createSyncV2Endpoints(http);
        const out = await sync.pushV2([
          {
            table: "routine_entries",
            op: "insert",
            row: {
              id: "entry_pact_003",
              user_id: "user-pact-001",
              routine_id: "routine_003",
              completed_at: "2026-05-14T08:00:00.000Z",
            },
            client_ts: "2026-05-14T08:00:00.000Z",
            idempotency_key: "01HZ000000000000000000000C",
          },
          {
            table: "non_whitelisted_table",
            op: "insert",
            row: { id: "row_pact_001", user_id: "user-pact-001" },
            client_ts: "2026-05-14T08:00:01.000Z",
            idempotency_key: "01HZ000000000000000000000D",
          },
        ]);

        expect(out.accepted).toBe(1);
        expect(typeof out.last_op_id).toBe("number");
        expect(out.results[0]!.status).toBe("applied");
        expect(out.results[1]!.status).toBe("rejected");
        expect(out.results[1]!.reason).toBe("table_not_allowed");
      });
  });

  it("returns duplicate status on idempotent replay of an already-applied op", async () => {
    await pact
      .addInteraction()
      .given(
        "authenticated user-pact-001; idempotency_key 01HZ000000000000000000000A is already in sync_op_log as applied",
      )
      .uponReceiving(
        "a POST /api/v2/sync/push replaying an already-applied idempotency_key",
      )
      .withRequest("POST", "/api/v2/sync/push", (req) => {
        req.headers({
          accept: "application/json",
          "content-type": "application/json",
        });
        req.jsonBody({
          ops: [
            {
              table: "routine_entries",
              op: "insert",
              row: {
                id: "entry_pact_001",
                user_id: "user-pact-001",
                routine_id: "routine_001",
                completed_at: "2026-05-13T08:00:00.000Z",
              },
              client_ts: "2026-05-13T08:00:00.000Z",
              idempotency_key: "01HZ000000000000000000000A",
            },
          ],
        });
      })
      .willRespondWith(200, (res) => {
        res.headers({ "content-type": "application/json" });
        res.jsonBody({
          accepted: 0,
          last_op_id: 1040,
          results: [
            {
              idempotency_key: "01HZ000000000000000000000A",
              status: "duplicate",
            },
          ],
        });
      })
      .executeTest(async (mockServer) => {
        const http = createHttpClient({ baseUrl: mockServer.url });
        const sync = createSyncV2Endpoints(http);
        const out = await sync.pushV2([
          {
            table: "routine_entries",
            op: "insert",
            row: {
              id: "entry_pact_001",
              user_id: "user-pact-001",
              routine_id: "routine_001",
              completed_at: "2026-05-13T08:00:00.000Z",
            },
            client_ts: "2026-05-13T08:00:00.000Z",
            idempotency_key: "01HZ000000000000000000000A",
          },
        ]);

        // "duplicate" means the op was already applied — the outbox must dequeue
        // it the same way as "applied", not retry it.
        expect(out.accepted).toBe(0);
        expect(out.results[0]!.status).toBe("duplicate");
        // last_op_id still points to the cached log entry (bigint → number).
        expect(typeof out.last_op_id).toBe("number");
      });
  });
});

describe("contract @ GET /api/v2/sync/pull", CONTRACT_SUITE_OPTIONS, () => {
  let pact: PactV4;
  beforeAll(() => {
    pact = createPact();
  });
  afterAll(() => {});

  it("returns a first SyncV2PullResponse page with next_cursor set (more data available)", async () => {
    await pact
      .addInteraction()
      .given(
        "authenticated user-pact-001 with 3 ops in sync_op_log since id=0; page size is 2",
      )
      .uponReceiving(
        "a GET /api/v2/sync/pull?since=0&limit=2 request (first page, more data)",
      )
      .withRequest("GET", "/api/v2/sync/pull", (req) => {
        req.headers({ accept: "application/json" });
        req.query({ since: "0", limit: "2" });
      })
      .willRespondWith(200, (res) => {
        res.headers({ "content-type": "application/json" });
        res.jsonBody({
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
        });
      })
      .executeTest(async (mockServer) => {
        const http = createHttpClient({ baseUrl: mockServer.url });
        const sync = createSyncV2Endpoints(http);
        const out = await sync.pullV2(0, { limit: 2 });

        expect(out.ops).toHaveLength(2);
        // Hard Rule #1: BIGSERIAL op.id → number.
        expect(typeof out.ops[0]!.id).toBe("number");
        expect(out.ops[0]!.id).toBe(1001);
        expect(out.ops[0]!.table).toBe("routine_entries");
        expect(out.ops[0]!.op).toBe("insert");
        expect(out.ops[1]!.origin_device_id).toBeNull();
        // next_cursor is set → more data available; client must issue another pull.
        expect(typeof out.next_cursor).toBe("number");
        expect(out.next_cursor).toBe(1002);
      });
  });

  it("returns SyncV2PullResponse with next_cursor: null on the final page", async () => {
    await pact
      .addInteraction()
      .given(
        "authenticated user-pact-001 with exactly one op since id=1002 (the last page)",
      )
      .uponReceiving(
        "a GET /api/v2/sync/pull?since=1002 request (last page, no more data)",
      )
      .withRequest("GET", "/api/v2/sync/pull", (req) => {
        req.headers({ accept: "application/json" });
        req.query({ since: "1002" });
      })
      .willRespondWith(200, (res) => {
        res.headers({ "content-type": "application/json" });
        res.jsonBody({
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
        });
      })
      .executeTest(async (mockServer) => {
        const http = createHttpClient({ baseUrl: mockServer.url });
        const sync = createSyncV2Endpoints(http);
        const out = await sync.pullV2(1002);

        expect(out.ops).toHaveLength(1);
        expect(out.ops[0]!.id).toBe(1003);
        expect(out.ops[0]!.table).toBe("routine_streaks");
        // next_cursor: null terminates the poll loop — must be exactly null,
        // not 0 / undefined / false.
        expect(out.next_cursor).toBeNull();
      });
  });

  it("returns empty ops when since is ahead of the log (nothing to pull)", async () => {
    await pact
      .addInteraction()
      .given(
        "authenticated user-pact-001 with no ops in sync_op_log since id=9999",
      )
      .uponReceiving(
        "a GET /api/v2/sync/pull?since=9999 request (since ahead of log)",
      )
      .withRequest("GET", "/api/v2/sync/pull", (req) => {
        req.headers({ accept: "application/json" });
        req.query({ since: "9999" });
      })
      .willRespondWith(200, (res) => {
        res.headers({ "content-type": "application/json" });
        res.jsonBody({
          ops: [],
          next_cursor: null,
        });
      })
      .executeTest(async (mockServer) => {
        const http = createHttpClient({ baseUrl: mockServer.url });
        const sync = createSyncV2Endpoints(http);
        const out = await sync.pullV2(9999);

        expect(out.ops).toHaveLength(0);
        expect(out.next_cursor).toBeNull();
      });
  });
});
