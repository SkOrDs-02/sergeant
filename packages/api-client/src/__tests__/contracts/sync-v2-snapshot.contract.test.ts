// @vitest-environment node
//
// Consumer contract: `GET /api/v2/sync/snapshot` і `410 sync_cursor_expired`
// на `GET /api/v2/sync/pull` (ADR-0105 §3, аудит 2026-10-01 `rel-06`).
//
// Чому контракт:
//   - `as_of_op_id` - BIGINT -> number на дроті (Hard Rule #1): клієнт ставить
//     на нього курсор pull, рядок зламав би `since`-арифметику.
//   - `next_cursor` знімка - непрозорий РЯДОК, а не число, як у pull; `null`
//     завершує обхід.
//   - Оп-и знімка мають форму pull-опа (`op: "insert"`, `row` у формі колонок,
//     tombstone з `deleted_at`), бо застосовуються тим самим `applyPullOp`.
//   - 410 несе `code: "sync_cursor_expired"`: за ним (а не за статусом) клієнт
//     вирішує йти в snapshot.
//
// Типи: `packages/api-client/src/endpoints/syncV2.snapshot.ts`.

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { PactV4 } from "@pact-foundation/pact";

import { createHttpClient } from "../../httpClient";
import { createSyncV2Endpoints } from "../../endpoints/syncV2";
import { isSyncCursorExpiredError } from "../../endpoints/syncV2.snapshot";
import { isApiError } from "../../ApiError";
import { CONTRACT_SUITE_OPTIONS, createPact } from "./_pact";

describe(
  "contract @ GET /api/v2/sync/pull (expired cursor)",
  CONTRACT_SUITE_OPTIONS,
  () => {
    let pact: PactV4;
    beforeAll(() => {
      pact = createPact();
    });
    afterAll(() => {});

    it("rejects with 410 sync_cursor_expired when since is below the log floor", async () => {
      await pact
        .addInteraction()
        .given(
          "authenticated user-pact-001 whose sync_op_log_floor.floor_id is 5000",
        )
        .uponReceiving(
          "a GET /api/v2/sync/pull?since=0 request below the log floor",
        )
        .withRequest("GET", "/api/v2/sync/pull", (req) => {
          req.headers({ accept: "application/json" });
          req.query({ since: "0" });
        })
        .willRespondWith(410, (res) => {
          res.headers({ "content-type": "application/json" });
          res.jsonBody({
            error: "Курсор синхронізації застарів, потрібен повний знімок",
            message: "Курсор синхронізації застарів, потрібен повний знімок",
            code: "sync_cursor_expired",
            details: [{ floor_id: 5000 }],
          });
        })
        .executeTest(async (mockServer) => {
          const http = createHttpClient({ baseUrl: mockServer.url });
          const sync = createSyncV2Endpoints(http);

          let caught: unknown;
          try {
            await sync.pullV2(0);
          } catch (err) {
            caught = err;
          }

          expect(isApiError(caught)).toBe(true);
          expect(isSyncCursorExpiredError(caught)).toBe(true);
          if (!isApiError(caught)) return;
          expect(caught.status).toBe(410);
          expect(caught.body).toMatchObject({
            code: "sync_cursor_expired",
            details: [{ floor_id: 5000 }],
          });
        });
    });
  },
);

describe("contract @ GET /api/v2/sync/snapshot", CONTRACT_SUITE_OPTIONS, () => {
  let pact: PactV4;
  beforeAll(() => {
    pact = createPact();
  });
  afterAll(() => {});

  it("returns the first SyncV2SnapshotResponse page with as_of_op_id and a string next_cursor", async () => {
    await pact
      .addInteraction()
      .given(
        "authenticated user-pact-001 with SYNC_SNAPSHOT_ENABLED, two routine_entries rows (one tombstoned) and max sync_op_log id 5123; page size is 2",
      )
      .uponReceiving("a GET /api/v2/sync/snapshot?limit=2 request (first page)")
      .withRequest("GET", "/api/v2/sync/snapshot", (req) => {
        req.headers({ accept: "application/json" });
        req.query({ limit: "2" });
      })
      .willRespondWith(200, (res) => {
        res.headers({ "content-type": "application/json" });
        res.jsonBody({
          ops: [
            {
              id: 5123,
              table: "routine_entries",
              op: "insert",
              row: {
                id: "entry_pact_001",
                user_id: "user-pact-001",
                name: "drink water",
                updated_at: "2026-10-01T10:00:00+00:00",
                deleted_at: null,
              },
              client_ts: "2026-10-01T10:00:00.000Z",
              server_ts: "2026-10-26T12:00:00.000Z",
              origin_device_id: null,
            },
            {
              id: 5123,
              table: "routine_entries",
              op: "insert",
              row: {
                id: "entry_pact_002",
                user_id: "user-pact-001",
                name: "stretch",
                updated_at: "2026-10-02T10:00:00+00:00",
                deleted_at: "2026-10-02T10:00:00+00:00",
              },
              client_ts: "2026-10-02T10:00:00.000Z",
              server_ts: "2026-10-26T12:00:00.000Z",
              origin_device_id: null,
            },
          ],
          as_of_op_id: 5123,
          next_cursor: "eyJ2IjoxLCJ0Ijoicm91dGluZV9lbnRyaWVzIn0",
        });
      })
      .executeTest(async (mockServer) => {
        const http = createHttpClient({ baseUrl: mockServer.url });
        const sync = createSyncV2Endpoints(http);
        const out = await sync.snapshotV2({ limit: 2 });

        // Hard Rule #1: BIGINT курсор - number, не рядок.
        expect(typeof out.as_of_op_id).toBe("number");
        expect(out.as_of_op_id).toBe(5123);
        expect(typeof out.next_cursor).toBe("string");
        expect(out.ops).toHaveLength(2);
        expect(out.ops.every((op) => op.op === "insert")).toBe(true);
        expect(out.ops[1]!.row["deleted_at"]).not.toBeNull();
      });
  });

  it("returns the last page (next_cursor: null) for a cursor and the same as_of_op_id", async () => {
    await pact
      .addInteraction()
      .given(
        "authenticated user-pact-001 with SYNC_SNAPSHOT_ENABLED and no rows after the snapshot cursor",
      )
      .uponReceiving(
        "a GET /api/v2/sync/snapshot request with cursor and as_of_op_id (last page)",
      )
      .withRequest("GET", "/api/v2/sync/snapshot", (req) => {
        req.headers({ accept: "application/json" });
        req.query({
          cursor: "eyJ2IjoxLCJ0Ijoicm91dGluZV9lbnRyaWVzIn0",
          as_of_op_id: "5123",
        });
      })
      .willRespondWith(200, (res) => {
        res.headers({ "content-type": "application/json" });
        res.jsonBody({ ops: [], as_of_op_id: 5123, next_cursor: null });
      })
      .executeTest(async (mockServer) => {
        const http = createHttpClient({ baseUrl: mockServer.url });
        const sync = createSyncV2Endpoints(http);
        const out = await sync.snapshotV2({
          cursor: "eyJ2IjoxLCJ0Ijoicm91dGluZV9lbnRyaWVzIn0",
          asOfOpId: 5123,
        });

        expect(out.ops).toHaveLength(0);
        expect(out.as_of_op_id).toBe(5123);
        // `null` завершує обхід - саме null, не "" / undefined.
        expect(out.next_cursor).toBeNull();
      });
  });
});
