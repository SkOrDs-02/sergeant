// @vitest-environment node
// Status: Active
// Consumer contract for the append-preserving fizruk_injuries sync-v2 row.

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { PactV4 } from "@pact-foundation/pact";

import type {
  SyncV2FizrukInjuryDeleteResult,
  SyncV2FizrukInjuryPullOp,
  SyncV2FizrukInjuryPushOp,
  SyncV2PullOp,
  SyncV2PushOp,
} from "../../endpoints/syncV2";
import { createSyncV2Endpoints } from "../../endpoints/syncV2";
import { createHttpClient } from "../../httpClient";
import { CONTRACT_SUITE_OPTIONS, createPact } from "./_pact";

const INJURY_ROW = {
  id: "00000005-0009-4000-8001-000000000001",
  user_id: "user-pact-001",
  muscle_group: "lower_back",
  noted_at: "2026-08-01T10:00:00.000Z",
  cleared_at: null,
} satisfies SyncV2FizrukInjuryPushOp["row"];

function expectInjuryPullOp(
  op: SyncV2PullOp,
): asserts op is SyncV2FizrukInjuryPullOp {
  expect(op).toEqual({
    id: 2046,
    table: "fizruk_injuries",
    op: "insert",
    row: INJURY_ROW,
    client_ts: "2026-08-01T10:00:00.000Z",
    server_ts: "2026-08-01T10:00:01.000Z",
    origin_device_id: "device-pact-001",
  });
}

describe("contract @ sync-v2 fizruk_injuries", CONTRACT_SUITE_OPTIONS, () => {
  let pact: PactV4;

  beforeAll(() => {
    pact = createPact();
  });
  afterAll(() => {});

  it("accepts insert and reports delete_not_supported for delete", async () => {
    const insertOp: SyncV2FizrukInjuryPushOp = {
      table: "fizruk_injuries",
      op: "insert",
      row: INJURY_ROW,
      client_ts: "2026-08-01T10:00:00.000Z",
      idempotency_key: "01K1K000000000000000000001",
    };
    const deleteOp: SyncV2PushOp = {
      table: "fizruk_injuries",
      op: "delete",
      row: INJURY_ROW,
      client_ts: "2026-08-01T10:01:00.000Z",
      idempotency_key: "01K1K000000000000000000002",
    };

    await pact
      .addInteraction()
      .given("authenticated user-pact-001 without a matching injury")
      .uponReceiving(
        "a fizruk_injuries insert followed by an unsupported delete",
      )
      .withRequest("POST", "/api/v2/sync/push", (req) => {
        req.headers({
          accept: "application/json",
          "content-type": "application/json",
        });
        req.jsonBody({ ops: [insertOp, deleteOp] });
      })
      .willRespondWith(200, (res) => {
        res.headers({ "content-type": "application/json" });
        res.jsonBody({
          accepted: 1,
          last_op_id: 2047,
          results: [
            {
              idempotency_key: insertOp.idempotency_key,
              status: "applied",
            },
            {
              idempotency_key: deleteOp.idempotency_key,
              status: "rejected",
              reason: "delete_not_supported",
            },
          ],
        });
      })
      .executeTest(async (mockServer) => {
        const sync = createSyncV2Endpoints(
          createHttpClient({ baseUrl: mockServer.url }),
        );
        const out = await sync.pushV2([insertOp, deleteOp]);

        expect(out.accepted).toBe(1);
        expect(typeof out.last_op_id).toBe("number");
        const deleteResult = out.results[1]!;
        expect(deleteResult).toMatchObject({
          status: "rejected",
          reason: "delete_not_supported",
        });
        if (
          deleteResult.status !== "rejected" ||
          deleteResult.reason !== "delete_not_supported"
        ) {
          throw new Error("unexpected injury delete result");
        }
        const typedResult: SyncV2FizrukInjuryDeleteResult = {
          idempotency_key: deleteResult.idempotency_key,
          status: deleteResult.status,
          reason: deleteResult.reason,
        };
        expect(typedResult.reason).toBe("delete_not_supported");
      });
  });

  it("pulls the exact injury row with numeric id and cursor", async () => {
    await pact
      .addInteraction()
      .given("authenticated user-pact-001 with one injury op after id=2045")
      .uponReceiving("a pull for a fizruk_injuries op")
      .withRequest("GET", "/api/v2/sync/pull", (req) => {
        req.headers({ accept: "application/json" });
        req.query({ since: "2045" });
      })
      .willRespondWith(200, (res) => {
        res.headers({ "content-type": "application/json" });
        res.jsonBody({
          ops: [
            {
              id: 2046,
              table: "fizruk_injuries",
              op: "insert",
              row: INJURY_ROW,
              client_ts: "2026-08-01T10:00:00.000Z",
              server_ts: "2026-08-01T10:00:01.000Z",
              origin_device_id: "device-pact-001",
            },
          ],
          next_cursor: null,
        });
      })
      .executeTest(async (mockServer) => {
        const sync = createSyncV2Endpoints(
          createHttpClient({ baseUrl: mockServer.url }),
        );
        const out = await sync.pullV2(2045);

        expect(out.ops).toHaveLength(1);
        expectInjuryPullOp(out.ops[0]!);
        expect(typeof out.ops[0].id).toBe("number");
        expect(out.next_cursor).toBeNull();
      });
  });
});
