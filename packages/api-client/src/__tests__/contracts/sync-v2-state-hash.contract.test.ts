// @vitest-environment node
//
// Consumer contract: `GET /api/v2/sync/state-hash?table=<t>` — хеш стану
// sync-таблиці для самовідновлення пристрою (ADR-0106, крок 1).
//
// Why this contract:
//   - `as_of_op_id` — BIGSERIAL (max id `sync_op_log`) → number on the
//     wire (Hard Rule #1). Рядок зламав би порівняння з курсором pull.
//   - `buckets` — рівно 16 записів `{bucket, hash, count}`; клієнт
//     порівнює їх покошиково з результатом того самого канонізатора
//     `computeStateHash` (`@sergeant/shared`).
//
// Types live in `packages/api-client/src/endpoints/syncV2.stateHash.ts`.

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { PactV4 } from "@pact-foundation/pact";
import { computeStateHash } from "@sergeant/shared";

import { createHttpClient } from "../../httpClient";
import { createSyncV2StateHashEndpoints } from "../../endpoints/syncV2.stateHash";
import { CONTRACT_SUITE_OPTIONS, createPact } from "./_pact";

// Два тренування, одне з tombstone-ом: значення — справжній вихід
// канонізатора, тож контракт не тримає вигаданих хешів.
const EXPECTED = computeStateHash([
  { pk: "workout_pact_001", updated_at_ms: 1778659200000, deleted_at_ms: null },
  {
    pk: "workout_pact_002",
    updated_at_ms: 1778659260000,
    deleted_at_ms: 1778659320000,
  },
]);

describe(
  "contract @ GET /api/v2/sync/state-hash",
  CONTRACT_SUITE_OPTIONS,
  () => {
    let pact: PactV4;
    beforeAll(() => {
      pact = createPact();
    });
    afterAll(() => {});

    it("returns SyncV2StateHashResponse with numeric as_of_op_id and 16 buckets", async () => {
      await pact
        .addInteraction()
        .given(
          "authenticated user-pact-001 with SYNC_STATE_HASH_ENABLED=true and two fizruk_workouts rows (one tombstoned)",
        )
        .uponReceiving(
          "a GET /api/v2/sync/state-hash?table=fizruk_workouts request",
        )
        .withRequest("GET", "/api/v2/sync/state-hash", (req) => {
          req.headers({ accept: "application/json" });
          req.query({ table: "fizruk_workouts" });
        })
        .willRespondWith(200, (res) => {
          res.headers({ "content-type": "application/json" });
          res.jsonBody({
            table: "fizruk_workouts",
            as_of_op_id: 1042,
            total: EXPECTED.total,
            buckets: EXPECTED.buckets,
          });
        })
        .executeTest(async (mockServer) => {
          const http = createHttpClient({ baseUrl: mockServer.url });
          const sync = createSyncV2StateHashEndpoints(http);
          const out = await sync.stateHashV2("fizruk_workouts");

          expect(out.table).toBe("fizruk_workouts");
          // Hard Rule #1: BIGSERIAL must arrive as a number, not a string.
          expect(typeof out.as_of_op_id).toBe("number");
          expect(out.as_of_op_id).toBe(1042);
          expect(out.total).toEqual(EXPECTED.total);
          expect(out.total.count).toBe(2);
          expect(out.buckets).toHaveLength(16);
          expect(out.buckets.map((b) => b.bucket)).toEqual(
            Array.from({ length: 16 }, (_, i) => i),
          );
        });
    });
  },
);
