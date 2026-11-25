// @vitest-environment node
//
// Consumer contract: `GET /api/v1/mono/transactions` — paginated
// Monobank transactions feed (finyk persona). Used by
// `monoTransactionsLoader` in the Finyk transactions list (infinite
// scroll, filter by `from`/`to`/`accountId`).
//
// Why this contract: exercises **two** bigint→number coercions in one
// envelope (`amount`, `operationAmount`, `cashbackAmount`,
// `commissionRate`, `balance` are all minor-units `number`s on the
// wire, but `pg` returns them as strings — see Hard Rule #1). Drift
// here would manifest as silent string concatenation in the UI (e.g.
// "−123" + "+45" = "−12345").
//
// Schema lives in `@sergeant/shared` (`MonoTransactionsPageSchema` +
// `MonoTransactionDtoSchema`).

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { PactV4 } from "@pact-foundation/pact";

import { createHttpClient } from "../../httpClient";
import { createMonoWebhookEndpoints } from "../../endpoints/mono";
import { CONTRACT_SUITE_OPTIONS, createPact } from "./_pact";

describe(
  "contract @ GET /api/v1/mono/transactions",
  CONTRACT_SUITE_OPTIONS,
  () => {
    let pact: PactV4;
    beforeAll(() => {
      pact = createPact();
    });
    afterAll(() => {});

    it("returns a paginated MonoTransactionsPage (finyk persona)", async () => {
      await pact
        .addInteraction()
        .given(
          "an authenticated session for user-pact-001 with 1 mono account and 2 transactions in 2026-05",
        )
        .uponReceiving(
          "a GET /api/v1/mono/transactions request with limit=2 and a date range",
        )
        .withRequest("GET", "/api/v1/mono/transactions", (req) => {
          req.headers({ accept: "application/json" });
          req.query({
            from: "2026-05-01",
            to: "2026-05-13",
            limit: "2",
          });
        })
        .willRespondWith(200, (res) => {
          res.headers({ "content-type": "application/json" });
          res.jsonBody({
            data: [
              {
                userId: "user-pact-001",
                monoAccountId: "acct-pact-001",
                monoTxId: "tx-pact-0001",
                time: "2026-05-12T18:42:11.000Z",
                amount: -12345,
                operationAmount: -12345,
                currencyCode: 980,
                mcc: 5411,
                originalMcc: 5411,
                hold: false,
                description: "ATB Market",
                comment: null,
                cashbackAmount: 123,
                commissionRate: 0,
                balance: 4567890,
                receiptId: null,
                invoiceId: null,
                counterEdrpou: null,
                counterIban: null,
                counterName: null,
                categorySlug: "groceries",
                categoryOverridden: false,
                source: "webhook",
                receivedAt: "2026-05-12T18:42:12.500Z",
              },
              {
                userId: "user-pact-001",
                monoAccountId: "acct-pact-001",
                monoTxId: "tx-pact-0002",
                time: "2026-05-11T09:14:00.000Z",
                amount: 100000,
                operationAmount: 100000,
                currencyCode: 980,
                mcc: null,
                originalMcc: null,
                hold: null,
                description: "Salary",
                comment: null,
                cashbackAmount: null,
                commissionRate: null,
                balance: 4680235,
                receiptId: null,
                invoiceId: null,
                counterEdrpou: null,
                counterIban: null,
                counterName: null,
                categorySlug: null,
                categoryOverridden: false,
                source: "webhook",
                receivedAt: "2026-05-11T09:14:01.250Z",
              },
            ],
            nextCursor: "2026-05-11T09:14:00.000Z:tx-pact-0002",
          });
        })
        .executeTest(async (mockServer) => {
          const http = createHttpClient({ baseUrl: mockServer.url });
          const mono = createMonoWebhookEndpoints(http);
          const page = await mono.transactions({
            from: "2026-05-01",
            to: "2026-05-13",
            limit: 2,
          });
          expect(page.data).toHaveLength(2);
          // bigint-as-number invariant (Hard Rule #1) — must already be
          // a number on the wire; the api-client does NO coercion.
          expect(typeof page.data[0]!.amount).toBe("number");
          expect(typeof page.data[0]!.balance).toBe("number");
          expect(page.data[0]!.amount).toBe(-12345);
          expect(page.data[1]!.amount).toBe(100000);
          // Cursor format is `<time>:<monoTxId>` — both the time and the id
          // of the last row in the page are needed to break ties on equal
          // `time` and resume pagination deterministically.
          expect(page.nextCursor).toBe("2026-05-11T09:14:00.000Z:tx-pact-0002");
        });
    });

    // Спека finyk-fx-nbu.md: операція валютної картки йде з валютою
    // рахунку, гривневою сумою за курсом НБУ (копійки, `number` за Hard
    // Rule #1) і самим курсом. `amount` лишається у валюті рахунку.
    it("returns a USD-account transaction priced at the NBU rate (finyk persona)", async () => {
      await pact
        .addInteraction()
        .given(
          "an authenticated session for user-pact-001 with a USD mono account and 1 transaction priced at the NBU rate",
        )
        .uponReceiving(
          "a GET /api/v1/mono/transactions request for a USD-account transaction",
        )
        .withRequest("GET", "/api/v1/mono/transactions", (req) => {
          req.headers({ accept: "application/json" });
          req.query({ limit: "1" });
        })
        .willRespondWith(200, (res) => {
          res.headers({ "content-type": "application/json" });
          res.jsonBody({
            data: [
              {
                userId: "user-pact-001",
                monoAccountId: "acct-pact-usd",
                monoTxId: "tx-pact-usd-0001",
                time: "2026-11-24T10:00:00.000Z",
                amount: -10000,
                operationAmount: -10000,
                currencyCode: 840,
                mcc: 5411,
                originalMcc: 5411,
                hold: false,
                description: "Shop",
                comment: null,
                cashbackAmount: null,
                commissionRate: null,
                balance: 50000,
                receiptId: null,
                invoiceId: null,
                counterEdrpou: null,
                counterIban: null,
                counterName: null,
                categorySlug: "groceries",
                categoryOverridden: false,
                source: "webhook",
                receivedAt: "2026-11-24T10:00:01.000Z",
                accountCurrencyCode: 840,
                amountUah: -415000,
                fxRate: { uahPerUnit: 41.5, date: "2026-11-24" },
              },
            ],
            nextCursor: null,
          });
        })
        .executeTest(async (mockServer) => {
          const http = createHttpClient({ baseUrl: mockServer.url });
          const mono = createMonoWebhookEndpoints(http);
          const page = await mono.transactions({ limit: 1 });
          const tx = page.data[0]!;
          expect(tx.accountCurrencyCode).toBe(840);
          expect(typeof tx.amountUah).toBe("number");
          expect(tx.amountUah).toBe(-415000);
          expect(tx.fxRate).toEqual({ uahPerUnit: 41.5, date: "2026-11-24" });
        });
    });
  },
);
