// @vitest-environment node
//
// Consumer contract: `GET /api/v1/mono/accounts` — Monobank webhook
// connection state. **finyk persona** — finyk's accounts panel reads
// this on the dashboard, and the finyk-domain pricing math depends on
// the shape (currencyCode → minor-units / kopiykas, Hard Rule —
// domain-invariants).
//
// Shape lives in `@sergeant/shared/schemas` (MonoAccountDto). Drift
// here = silent money mis-display.

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { PactV4 } from "@pact-foundation/pact";

import { createHttpClient } from "../../httpClient";
import { createMonoWebhookEndpoints } from "../../endpoints/mono";
import { createPact } from "./_pact";

describe("contract @ GET /api/v1/mono/accounts", () => {
  let pact: PactV4;
  beforeAll(() => {
    pact = createPact();
  });
  afterAll(() => {});

  it("returns the connected user's mono accounts (finyk persona)", async () => {
    await pact
      .addInteraction()
      .given(
        "user-pact-001 has 1 connected mono account with balance 123450 (in minor units)",
      )
      .uponReceiving("a GET /api/v1/mono/accounts request")
      .withRequest("GET", "/api/v1/mono/accounts", (req) => {
        req.headers({ accept: "application/json" });
      })
      .willRespondWith(200, (res) => {
        res.headers({ "content-type": "application/json" });
        // Shape matches `MonoAccountDtoSchema` in
        // `packages/shared/src/schemas/api.ts` — fields are the ones
        // `apps/server/src/lib/normalizers/mono.ts` emits AFTER bigint
        // coercion + ISO date stringification (Hard Rule #1).
        res.jsonBody([
          {
            userId: "user-pact-001",
            monoAccountId: "acct-pact-001",
            sendId: "abc123",
            type: "black",
            currencyCode: 980,
            cashbackType: "UAH",
            maskedPan: ["537541******1234"],
            iban: "UA213996220000026007233566001",
            balance: 123450,
            creditLimit: 0,
            lastSeenAt: "2026-05-13T08:30:00.000Z",
          },
        ]);
      })
      .executeTest(async (mockServer) => {
        const http = createHttpClient({ baseUrl: mockServer.url });
        const mono = createMonoWebhookEndpoints(http);
        const accounts = await mono.accounts();
        expect(Array.isArray(accounts)).toBe(true);
        expect(accounts).toHaveLength(1);
        const acct = accounts[0]!;
        expect(acct.monoAccountId).toBe("acct-pact-001");
        expect(acct.userId).toBe("user-pact-001");
        // Hard-Rule #1 domain invariant: minor units returned as
        // `number`, not string. This assertion would fire if the
        // server ever leaked `bigint`-as-string for `balance`.
        expect(typeof acct.balance).toBe("number");
        expect(acct.balance).toBe(123450);
        expect(acct.currencyCode).toBe(980);
      });
  });
});
