// @vitest-environment node
//
// Consumer contract: `POST /api/v1/finyk/manual-expenses` — records a
// manual (non-Mono) expense (finyk persona). Replaces the client-side
// `safeWriteLS` bypass for manual expenses (state-write-paths doctrine).
//
// Why this contract: `finyk` had zero Pact coverage before this file
// (audit: 9/17 endpoint modules covered). Server responds **201 Created**
// (not 200) — locking the exact status here catches a regression where the
// handler is refactored to `res.json()` (which defaults to 200) without a
// consumer ever noticing (client only checks `res.ok`, so a status drift
// like this is otherwise invisible until the API contract is versioned).
// `amountKopiykas` must be a whole-number `number` (minor units, Hard Rule
// #1) even though the persistence layer stores hryvnia floats internally —
// the serializer's `Math.round(Number(blob.amount) * 100)` conversion is
// exactly the "coerce at the API boundary" invariant this contract guards.
//
// Schema lives in `@sergeant/shared` (`ManualExpenseCreateResponseSchema` /
// `ManualExpenseSchema`), re-exported verbatim by
// `packages/api-client/src/endpoints/finyk.ts`. Server serializer verified
// read-only: `apps/server/src/modules/finyk/manualExpenses.ts#serializeManualExpense`
// (Hard Rule #3).

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { PactV4 } from "@pact-foundation/pact";

import { createHttpClient } from "../../httpClient";
import { createFinykEndpoints } from "../../endpoints/finyk";
import { CONTRACT_SUITE_OPTIONS, createPact } from "./_pact";

describe(
  "contract @ POST /api/v1/finyk/manual-expenses",
  CONTRACT_SUITE_OPTIONS,
  () => {
    let pact: PactV4;
    beforeAll(() => {
      pact = createPact();
    });
    afterAll(() => {});

    it("creates a manual expense and returns it serialized in kopiykas (201)", async () => {
      await pact
        .addInteraction()
        .given("authenticated user-pact-001 within finyk write quota")
        .uponReceiving(
          "a POST /api/v1/finyk/manual-expenses request (12000 kopiykas, food)",
        )
        .withRequest("POST", "/api/v1/finyk/manual-expenses", (req) => {
          req.headers({
            accept: "application/json",
            "content-type": "application/json",
          });
          req.jsonBody({
            amount: 12000,
            category: "food",
            date: "2026-06-11",
            note: "кава",
          });
        })
        .willRespondWith(201, (res) => {
          res.headers({ "content-type": "application/json" });
          res.jsonBody({
            ok: true,
            expense: {
              id: "0b7e6c3a-7e0f-4b59-9b39-2f4f7f6f9d11",
              amountKopiykas: 12000,
              category: "food",
              date: "2026-06-11",
              note: "кава",
              createdAt: "2026-06-11T10:00:00.000Z",
              updatedAt: "2026-06-11T10:00:00.000Z",
            },
          });
        })
        .executeTest(async (mockServer) => {
          const http = createHttpClient({ baseUrl: mockServer.url });
          const finyk = createFinykEndpoints(http);
          const out = await finyk.createManualExpense({
            amount: 12000,
            category: "food",
            date: "2026-06-11",
            note: "кава",
          });

          expect(out.ok).toBe(true);
          expect(out.expense.id).toBe("0b7e6c3a-7e0f-4b59-9b39-2f4f7f6f9d11");
          expect(out.expense.category).toBe("food");
          expect(out.expense.date).toBe("2026-06-11");
          // Hard Rule #1 sibling: minor units as `number`, never a
          // hryvnia-float or a bigint-string leak from the persistence layer.
          expect(typeof out.expense.amountKopiykas).toBe("number");
          expect(Number.isInteger(out.expense.amountKopiykas)).toBe(true);
          expect(out.expense.amountKopiykas).toBe(12000);
        });
    });
  },
);
