// @vitest-environment node
//
// Consumer contract: `/api/v1/silpo/*` — Silpo MCP receipts integration
// (finyk persona, walking-skeleton experiment — spec
// `docs/90-work/planning/specs/silpo-mcp-integration.md`). Covers every
// `HttpClient`-exercisable route from `apps/server/src/routes/silpo.ts`:
// disconnect, wipe, sync-state, sync, receipts list, receipt detail.
// `GET /api/silpo/connect` and `GET /api/silpo/callback` are 302
// browser-redirect endpoints — navigation-only, never called through
// `HttpClient`/`fetch`, so they are intentionally NOT part of this file
// (see `silpoConnectUrl()` doc comment in `endpoints/silpo.ts`).
//
// Why this contract: `silpo_receipts.total_kop` and
// `silpo_receipt_items.price_kop` are BIGINT on disk (migration 121,
// `lib/normalizers/silpo.ts`) — exactly the bigint-as-string leak class
// Hard Rule #1 guards. We assert `typeof === "number"` on both, not just
// presence, so a regression in the normalizer fails this test instead of
// shipping a `"123"` total to the UI.
//
// Schemas live in `@sergeant/shared/schemas` (`packages/shared/src/schemas/silpo.ts`)
// — `SilpoDisconnectResponseSchema`, `SilpoWipeResponseSchema`,
// `SilpoSyncStateSchema`, `SilpoSyncResultSchema`, `SilpoReceiptsPageSchema`,
// `SilpoReceiptDetailDtoSchema` — re-exported verbatim by
// `packages/api-client/src/endpoints/silpo.ts` (no hand-redeclared shapes).
// Server serializers verified read-only against
// `apps/server/src/routes/silpo.ts` + `apps/server/src/lib/normalizers/silpo.ts`.

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { PactV4 } from "@pact-foundation/pact";

import { createHttpClient } from "../../httpClient";
import { createSilpoEndpoints } from "../../endpoints/silpo";
import { CONTRACT_SUITE_OPTIONS, createPact } from "./_pact";

describe(
  "contract @ POST /api/v1/silpo/disconnect",
  CONTRACT_SUITE_OPTIONS,
  () => {
    let pact: PactV4;
    beforeAll(() => {
      pact = createPact();
    });
    afterAll(() => {});

    it("disconnects the Silpo connection (mono-pattern, receipts survive)", async () => {
      await pact
        .addInteraction()
        .given("user-pact-001 has a connected Silpo account")
        .uponReceiving("a POST /api/v1/silpo/disconnect request (no body)")
        .withRequest("POST", "/api/v1/silpo/disconnect", (req) => {
          req.headers({ accept: "application/json" });
        })
        .willRespondWith(200, (res) => {
          res.headers({ "content-type": "application/json" });
          res.jsonBody({ ok: true });
        })
        .executeTest(async (mockServer) => {
          const http = createHttpClient({ baseUrl: mockServer.url });
          const silpo = createSilpoEndpoints(http);
          const out = await silpo.disconnect();
          expect(out.ok).toBe(true);
        });
    });
  },
);

describe("contract @ POST /api/v1/silpo/wipe", CONTRACT_SUITE_OPTIONS, () => {
  let pact: PactV4;
  beforeAll(() => {
    pact = createPact();
  });
  afterAll(() => {});

  it("wipes all Silpo-sourced data and returns the deleted count", async () => {
    await pact
      .addInteraction()
      .given("user-pact-001 has 3 silpo_receipts rows")
      .uponReceiving("a POST /api/v1/silpo/wipe request (no body)")
      .withRequest("POST", "/api/v1/silpo/wipe", (req) => {
        req.headers({ accept: "application/json" });
      })
      .willRespondWith(200, (res) => {
        res.headers({ "content-type": "application/json" });
        res.jsonBody({ ok: true, deletedReceipts: 3 });
      })
      .executeTest(async (mockServer) => {
        const http = createHttpClient({ baseUrl: mockServer.url });
        const silpo = createSilpoEndpoints(http);
        const out = await silpo.wipe();
        expect(out.ok).toBe(true);
        // `rowCount` from `pg` is already a JS `number` here (not bigint),
        // but the shape class is the same "trust the wire number" invariant.
        expect(typeof out.deletedReceipts).toBe("number");
        expect(out.deletedReceipts).toBe(3);
      });
  });
});

describe(
  "contract @ GET /api/v1/silpo/sync-state",
  CONTRACT_SUITE_OPTIONS,
  () => {
    let pact: PactV4;
    beforeAll(() => {
      pact = createPact();
    });
    afterAll(() => {});

    it("returns SilpoSyncState for a connected account", async () => {
      await pact
        .addInteraction()
        .given(
          "user-pact-001 has a connected Silpo account with 5 receipts synced",
        )
        .uponReceiving("a GET /api/v1/silpo/sync-state request")
        .withRequest("GET", "/api/v1/silpo/sync-state", (req) => {
          req.headers({ accept: "application/json" });
        })
        .willRespondWith(200, (res) => {
          res.headers({ "content-type": "application/json" });
          res.jsonBody({
            status: "connected",
            accessTokenExpiresAt: "2026-08-24T10:00:00.000Z",
            lastSyncAt: "2026-08-17T09:15:00.000Z",
            receiptsCount: 5,
          });
        })
        .executeTest(async (mockServer) => {
          const http = createHttpClient({ baseUrl: mockServer.url });
          const silpo = createSilpoEndpoints(http);
          const state = await silpo.syncState();
          expect(state.status).toBe("connected");
          expect(state.accessTokenExpiresAt).toBe("2026-08-24T10:00:00.000Z");
          expect(state.lastSyncAt).toBe("2026-08-17T09:15:00.000Z");
          expect(typeof state.receiptsCount).toBe("number");
          expect(state.receiptsCount).toBe(5);
        });
    });

    it("returns disconnected (synthetic status) when no connection row exists", async () => {
      await pact
        .addInteraction()
        .given("user-pact-002 has never connected Silpo")
        .uponReceiving("a GET /api/v1/silpo/sync-state request (no connection)")
        .withRequest("GET", "/api/v1/silpo/sync-state", (req) => {
          req.headers({ accept: "application/json" });
        })
        .willRespondWith(200, (res) => {
          res.headers({ "content-type": "application/json" });
          res.jsonBody({
            status: "disconnected",
            accessTokenExpiresAt: null,
            lastSyncAt: null,
            receiptsCount: 0,
          });
        })
        .executeTest(async (mockServer) => {
          const http = createHttpClient({ baseUrl: mockServer.url });
          const silpo = createSilpoEndpoints(http);
          const state = await silpo.syncState();
          expect(state.status).toBe("disconnected");
          expect(state.accessTokenExpiresAt).toBeNull();
          expect(state.lastSyncAt).toBeNull();
          expect(state.receiptsCount).toBe(0);
        });
    });
  },
);

describe("contract @ POST /api/v1/silpo/sync", CONTRACT_SUITE_OPTIONS, () => {
  let pact: PactV4;
  beforeAll(() => {
    pact = createPact();
  });
  afterAll(() => {});

  it("pulls + matches receipts and returns per-stage counts as numbers", async () => {
    await pact
      .addInteraction()
      .given("user-pact-001 has a connected Silpo account, 2 new receipts")
      .uponReceiving("a POST /api/v1/silpo/sync request (no body)")
      .withRequest("POST", "/api/v1/silpo/sync", (req) => {
        req.headers({ accept: "application/json" });
      })
      .willRespondWith(200, (res) => {
        res.headers({ "content-type": "application/json" });
        res.jsonBody({
          status: "connected",
          offlinePulled: 1,
          onlinePulled: 1,
          receiptsInserted: 2,
          itemsInserted: 7,
          matched: 1,
          ambiguous: 0,
          unmatched: 1,
        });
      })
      .executeTest(async (mockServer) => {
        const http = createHttpClient({ baseUrl: mockServer.url });
        const silpo = createSilpoEndpoints(http);
        const out = await silpo.sync();
        expect(out.status).toBe("connected");
        // Hard Rule #1 sibling — every count field must be a `number`, the
        // coerced shape, never a bigint-string leak from a COUNT(*) query.
        for (const field of [
          "offlinePulled",
          "onlinePulled",
          "receiptsInserted",
          "itemsInserted",
          "matched",
          "ambiguous",
          "unmatched",
        ] as const) {
          expect(typeof out[field]).toBe("number");
        }
        expect(out.receiptsInserted).toBe(2);
        expect(out.itemsInserted).toBe(7);
        expect(out.matched).toBe(1);
        expect(out.unmatched).toBe(1);
      });
  });
});

describe(
  "contract @ GET /api/v1/silpo/receipts",
  CONTRACT_SUITE_OPTIONS,
  () => {
    let pact: PactV4;
    beforeAll(() => {
      pact = createPact();
    });
    afterAll(() => {});

    it("returns a cursor-paginated page of SilpoReceiptSummaryDto", async () => {
      await pact
        .addInteraction()
        .given("user-pact-001 has 2 silpo_receipts rows")
        .uponReceiving("a GET /api/v1/silpo/receipts request with limit=2")
        .withRequest("GET", "/api/v1/silpo/receipts", (req) => {
          req.headers({ accept: "application/json" });
          req.query({ limit: "2" });
        })
        .willRespondWith(200, (res) => {
          res.headers({ "content-type": "application/json" });
          // Shape matches `SilpoReceiptSummaryDtoSchema` — fields
          // `apps/server/src/lib/normalizers/silpo.ts#normalizeSilpoReceiptSummary`
          // emits AFTER bigint coercion (`totalKop`).
          res.jsonBody({
            data: [
              {
                receiptId: "rcpt-pact-0002",
                purchasedAt: "2026-08-16T18:20:00.000Z",
                storeId: "store-042",
                channel: "offline",
                paymentHint: "card",
                totalKop: 45690,
                transactionId: "tx-pact-0099",
              },
              {
                receiptId: "rcpt-pact-0001",
                purchasedAt: "2026-08-15T09:05:00.000Z",
                storeId: null,
                channel: "online",
                paymentHint: null,
                totalKop: 12000,
                transactionId: null,
              },
            ],
            nextCursor: "2026-08-15T09:05:00.000Z:rcpt-pact-0001",
          });
        })
        .executeTest(async (mockServer) => {
          const http = createHttpClient({ baseUrl: mockServer.url });
          const silpo = createSilpoEndpoints(http);
          const page = await silpo.receipts({ limit: 2 });
          expect(page.data).toHaveLength(2);
          const first = page.data[0]!;
          // Hard Rule #1 — bigint `total_kop` must already be a `number` on
          // the wire; the api-client does no coercion of its own.
          expect(typeof first.totalKop).toBe("number");
          expect(first.totalKop).toBe(45690);
          expect(first.channel).toBe("offline");
          expect(first.transactionId).toBe("tx-pact-0099");
          const second = page.data[1]!;
          expect(second.storeId).toBeNull();
          expect(second.transactionId).toBeNull();
          expect(page.nextCursor).toBe(
            "2026-08-15T09:05:00.000Z:rcpt-pact-0001",
          );
        });
    });
  },
);

describe(
  "contract @ GET /api/v1/silpo/receipts/{id}",
  CONTRACT_SUITE_OPTIONS,
  () => {
    let pact: PactV4;
    beforeAll(() => {
      pact = createPact();
    });
    afterAll(() => {});

    it("returns a SilpoReceiptDetailDto with coerced line-item numbers", async () => {
      await pact
        .addInteraction()
        .given("user-pact-001 owns receipt rcpt-pact-0001 with 2 items")
        .uponReceiving("a GET /api/v1/silpo/receipts/rcpt-pact-0001 request")
        .withRequest("GET", "/api/v1/silpo/receipts/rcpt-pact-0001", (req) => {
          req.headers({ accept: "application/json" });
        })
        .willRespondWith(200, (res) => {
          res.headers({ "content-type": "application/json" });
          // Shape matches `SilpoReceiptDetailDtoSchema` — items carry
          // BIGSERIAL `id` + BIGINT `priceKop`, both coerced by
          // `normalizeSilpoReceiptItem` before the response leaves the
          // server (Hard Rule #1).
          res.jsonBody({
            receiptId: "rcpt-pact-0001",
            purchasedAt: "2026-08-15T09:05:00.000Z",
            storeId: null,
            channel: "online",
            paymentHint: null,
            totalKop: 12000,
            transactionId: null,
            items: [
              {
                id: 501,
                name: "Молоко 2.5%",
                qty: 1,
                unit: "шт",
                priceKop: 4500,
                categorySlug: "dairy",
                barcode: "4820000000017",
              },
              {
                id: 502,
                name: "Хліб житній",
                qty: null,
                unit: null,
                priceKop: 7500,
                categorySlug: null,
                barcode: null,
              },
            ],
          });
        })
        .executeTest(async (mockServer) => {
          const http = createHttpClient({ baseUrl: mockServer.url });
          const silpo = createSilpoEndpoints(http);
          const detail = await silpo.receiptDetail("rcpt-pact-0001");
          expect(detail.receiptId).toBe("rcpt-pact-0001");
          expect(detail.items).toHaveLength(2);
          const item0 = detail.items[0]!;
          // Hard Rule #1 — BIGSERIAL `id` and BIGINT `priceKop` must both be
          // `number` on the wire, never a bigint-string leak.
          expect(typeof item0.id).toBe("number");
          expect(typeof item0.priceKop).toBe("number");
          expect(item0.id).toBe(501);
          expect(item0.priceKop).toBe(4500);
          const item1 = detail.items[1]!;
          expect(item1.qty).toBeNull();
          expect(item1.categorySlug).toBeNull();
          expect(item1.barcode).toBeNull();
        });
    });
  },
);
