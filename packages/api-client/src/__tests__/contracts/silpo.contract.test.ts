// @vitest-environment node
//
// Consumer contract: `/api/v1/silpo/*` — Silpo MCP receipts integration
// (finyk persona, walking-skeleton experiment — spec
// `docs/90-work/planning/specs/silpo-mcp-integration.md`). Covers every
// `HttpClient`-exercisable route from `apps/server/src/routes/silpo.ts`:
// disconnect, wipe, sync-state, sync, receipts list, receipt detail, and
// (Track G) cart preview/apply/get.
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
// shipping a `"123"` total to the UI. Same class of assertion covers the
// Track G cart DTOs below (`priceKop`/`subtotalKop`/`totalKop`) — those are
// derived from the same catalog/cart price fields, not DB bigints, but the
// coerced-`number` contract with the client is identical.
//
// Schemas live in `@sergeant/shared/schemas` (`packages/shared/src/schemas/silpo.ts`)
// — `SilpoDisconnectResponseSchema`, `SilpoWipeResponseSchema`,
// `SilpoSyncStateSchema`, `SilpoSyncResultSchema`, `SilpoReceiptsPageSchema`,
// `SilpoReceiptDetailDtoSchema`, `SilpoCartPreviewResponseSchema`,
// `SilpoCartDtoSchema` — re-exported verbatim by
// `packages/api-client/src/endpoints/silpo.ts` (no hand-redeclared shapes).
// Server serializers verified read-only against
// `apps/server/src/routes/silpo.ts` + `apps/server/src/lib/normalizers/silpo.ts`
// + `apps/server/src/modules/silpo/cart.ts` + `cartNormalize.ts`.

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

describe(
  "contract @ DELETE /api/v1/silpo/receipts/link/:transactionId",
  CONTRACT_SUITE_OPTIONS,
  () => {
    let pact: PactV4;
    beforeAll(() => {
      pact = createPact();
    });
    afterAll(() => {});

    it("знімає хибну пару «транзакція ↔ чек»", async () => {
      await pact
        .addInteraction()
        .given("user-pact-001 has a silpo_tx_receipt_links row for mono-tx-1")
        .uponReceiving(
          "a DELETE /api/v1/silpo/receipts/link/mono-tx-1 request (no body)",
        )
        .withRequest(
          "DELETE",
          "/api/v1/silpo/receipts/link/mono-tx-1",
          (req) => {
            req.headers({ accept: "application/json" });
          },
        )
        .willRespondWith(200, (res) => {
          res.headers({ "content-type": "application/json" });
          // `receiptId` — не косметика у відповіді: рівно з нього
          // збирається «Повернути», інакше скасовувати було б нічим.
          res.jsonBody({ ok: true, receiptId: "silpo-r-1" });
        })
        .executeTest(async (mockServer) => {
          const http = createHttpClient({ baseUrl: mockServer.url });
          const silpo = createSilpoEndpoints(http);
          const out = await silpo.unlinkReceipt("mono-tx-1");
          expect(out).toEqual({ ok: true, receiptId: "silpo-r-1" });
        });
    });

    it("«Повернути» ставить пару назад", async () => {
      await pact
        .addInteraction()
        .given("user-pact-001 rejected silpo-r-1 for mono-tx-1")
        .uponReceiving(
          "a POST /api/v1/silpo/receipts/link/mono-tx-1 request with a receiptId",
        )
        .withRequest("POST", "/api/v1/silpo/receipts/link/mono-tx-1", (req) => {
          req.headers({ accept: "application/json" });
          req.jsonBody({ receiptId: "silpo-r-1" });
        })
        .willRespondWith(200, (res) => {
          res.headers({ "content-type": "application/json" });
          res.jsonBody({ ok: true });
        })
        .executeTest(async (mockServer) => {
          const http = createHttpClient({ baseUrl: mockServer.url });
          const silpo = createSilpoEndpoints(http);
          const out = await silpo.relinkReceipt("mono-tx-1", "silpo-r-1");
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

    it("narrows to the receipt linked to one transaction via ?transactionId=", async () => {
      // Точковий пошук для картки транзакції. Без нього клієнт тягнув
      // сторінку і матчив у себе — і промахувався, щойно потрібний чек
      // виїжджав за межі сторінки.
      await pact
        .addInteraction()
        .given("user-pact-001 has a receipt linked to tx-pact-0099")
        .uponReceiving(
          "a GET /api/v1/silpo/receipts request filtered by transactionId",
        )
        .withRequest("GET", "/api/v1/silpo/receipts", (req) => {
          req.headers({ accept: "application/json" });
          req.query({ limit: "1", transactionId: "tx-pact-0099" });
        })
        .willRespondWith(200, (res) => {
          res.headers({ "content-type": "application/json" });
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
            ],
            nextCursor: null,
          });
        })
        .executeTest(async (mockServer) => {
          const http = createHttpClient({ baseUrl: mockServer.url });
          const silpo = createSilpoEndpoints(http);
          const page = await silpo.receipts({
            limit: 1,
            transactionId: "tx-pact-0099",
          });
          expect(page.data).toHaveLength(1);
          expect(page.data[0]!.transactionId).toBe("tx-pact-0099");
          expect(page.nextCursor).toBeNull();
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

// ──────────────────────────────── Cart (Track G) ────────────────────────────

describe(
  "contract @ POST /api/v1/silpo/cart/preview",
  CONTRACT_SUITE_OPTIONS,
  () => {
    let pact: PactV4;
    beforeAll(() => {
      pact = createPact();
    });
    afterAll(() => {});

    it("returns one result per request item, incl. a matched and an unmatched line", async () => {
      await pact
        .addInteraction()
        .given("user-pact-001 has a connected Silpo account")
        .uponReceiving(
          "a POST /api/v1/silpo/cart/preview request with 2 shopping-list lines",
        )
        .withRequest("POST", "/api/v1/silpo/cart/preview", (req) => {
          req.headers({
            accept: "application/json",
            "content-type": "application/json",
          });
          req.jsonBody({
            items: [
              { name: "Молоко 2.5%", quantity: 2 },
              { name: "асдфasdf000" },
            ],
          });
        })
        .willRespondWith(200, (res) => {
          res.headers({ "content-type": "application/json" });
          // Shape matches `SilpoCartPreviewResponseSchema` —
          // `normalizeCartMatch` output (`apps/server/src/modules/silpo/cartNormalize.ts`)
          // AFTER catalog-price → kopiykas conversion (Hard Rule #1 sibling).
          res.jsonBody({
            results: [
              {
                query: "Молоко 2.5%",
                matches: [
                  {
                    lagerId: "eyJwcm9kdWN0SWQiOiJwLTEifQ==",
                    name: "Молоко Селянське 2.5% 900г",
                    priceKop: 4500,
                    // Позиція в акції: `oldPrice` приходить у тому самому
                    // хіті `find_products_batch`, який робить прев'ю.
                    oldPriceKop: 5290,
                    available: true,
                    unit: "шт",
                    displayRatio: null,
                  },
                  {
                    lagerId: "eyJwcm9kdWN0SWQiOiJwLTIifQ==",
                    name: "Молоко Яготинське 2.5% 1л",
                    priceKop: 5200,
                    oldPriceKop: null,
                    available: false,
                    unit: "кг",
                    displayRatio: "0.9 кг",
                  },
                ],
                unmatched: false,
              },
              {
                query: "асдфasdf000",
                matches: [],
                unmatched: true,
              },
            ],
          });
        })
        .executeTest(async (mockServer) => {
          const http = createHttpClient({ baseUrl: mockServer.url });
          const silpo = createSilpoEndpoints(http);
          const out = await silpo.cartPreview([
            { name: "Молоко 2.5%", quantity: 2 },
            { name: "асдфasdf000" },
          ]);
          expect(out.results).toHaveLength(2);
          const matched = out.results[0]!;
          expect(matched.query).toBe("Молоко 2.5%");
          expect(matched.unmatched).toBe(false);
          expect(matched.matches).toHaveLength(2);
          const top = matched.matches[0]!;
          // Hard Rule #1 sibling — catalog price must already be `number`
          // kopiykas on the wire, never a string.
          expect(typeof top.priceKop).toBe("number");
          expect(top.priceKop).toBe(4500);
          expect(top.lagerId).toBe("eyJwcm9kdWN0SWQiOiJwLTEifQ==");
          // Акційна ціна — теж копійки-`number`, і `null` коли акції немає.
          expect(top.oldPriceKop).toBe(5290);
          const alt = matched.matches[1]!;
          expect(alt.displayRatio).toBe("0.9 кг");
          expect(alt.oldPriceKop).toBeNull();
          const unmatched = out.results[1]!;
          expect(unmatched.unmatched).toBe(true);
          expect(unmatched.matches).toHaveLength(0);
        });
    });
  },
);

describe(
  "contract @ POST /api/v1/silpo/cart/apply",
  CONTRACT_SUITE_OPTIONS,
  () => {
    let pact: PactV4;
    beforeAll(() => {
      pact = createPact();
    });
    afterAll(() => {});

    it("adds the selections and returns the post-write cart state", async () => {
      await pact
        .addInteraction()
        .given("user-pact-001 has a connected Silpo account")
        .uponReceiving(
          "a POST /api/v1/silpo/cart/apply request with 1 selection",
        )
        .withRequest("POST", "/api/v1/silpo/cart/apply", (req) => {
          req.headers({
            accept: "application/json",
            "content-type": "application/json",
          });
          req.jsonBody({
            selections: [
              { lagerId: "eyJwcm9kdWN0SWQiOiJwLTEifQ==", quantity: 2 },
            ],
          });
        })
        .willRespondWith(200, (res) => {
          res.headers({ "content-type": "application/json" });
          // Shape matches `SilpoCartDtoSchema` — post-write state from
          // `normalizeCartDetail` (`apps/server/src/modules/silpo/cartNormalize.ts`).
          res.jsonBody({
            items: [
              {
                name: "Молоко Селянське 2.5% 900г",
                quantity: 2,
                priceKop: 4500,
                subtotalKop: 9000,
              },
            ],
            totalKop: 9000,
            cartUrl: "https://silpo.ua/cart/checkout/abc123",
          });
        })
        .executeTest(async (mockServer) => {
          const http = createHttpClient({ baseUrl: mockServer.url });
          const silpo = createSilpoEndpoints(http);
          const cart = await silpo.cartApply([
            { lagerId: "eyJwcm9kdWN0SWQiOiJwLTEifQ==", quantity: 2 },
          ]);
          expect(cart.items).toHaveLength(1);
          const item = cart.items[0]!;
          // Hard Rule #1 sibling — every money field must be `number`.
          expect(typeof item.priceKop).toBe("number");
          expect(typeof item.subtotalKop).toBe("number");
          expect(item.subtotalKop).toBe(9000);
          expect(typeof cart.totalKop).toBe("number");
          expect(cart.totalKop).toBe(9000);
          expect(cart.cartUrl).toBe("https://silpo.ua/cart/checkout/abc123");
        });
    });
  },
);

describe("contract @ GET /api/v1/silpo/cart", CONTRACT_SUITE_OPTIONS, () => {
  let pact: PactV4;
  beforeAll(() => {
    pact = createPact();
  });
  afterAll(() => {});

  it("returns the current cart state with coerced number fields", async () => {
    await pact
      .addInteraction()
      .given("user-pact-001 has 1 item in the Silpo cart")
      .uponReceiving("a GET /api/v1/silpo/cart request")
      .withRequest("GET", "/api/v1/silpo/cart", (req) => {
        req.headers({ accept: "application/json" });
      })
      .willRespondWith(200, (res) => {
        res.headers({ "content-type": "application/json" });
        res.jsonBody({
          items: [
            {
              name: "Хліб житній",
              quantity: 1,
              priceKop: 3500,
              subtotalKop: 3500,
            },
          ],
          totalKop: 3500,
          cartUrl: "https://silpo.ua/cart/checkout/def456",
        });
      })
      .executeTest(async (mockServer) => {
        const http = createHttpClient({ baseUrl: mockServer.url });
        const silpo = createSilpoEndpoints(http);
        const cart = await silpo.cartGet();
        expect(cart.items).toHaveLength(1);
        expect(typeof cart.items[0]!.priceKop).toBe("number");
        expect(typeof cart.totalKop).toBe("number");
        expect(cart.totalKop).toBe(3500);
      });
  });

  it("degrades to an empty cart (null totalKop/cartUrl semantics never violated on an empty cart)", async () => {
    await pact
      .addInteraction()
      .given("user-pact-002 has no Silpo cart yet")
      .uponReceiving("a GET /api/v1/silpo/cart request (empty cart)")
      .withRequest("GET", "/api/v1/silpo/cart", (req) => {
        req.headers({ accept: "application/json" });
      })
      .willRespondWith(200, (res) => {
        res.headers({ "content-type": "application/json" });
        // `getCart()` degrades a missing `shoppingCartId` to this exact
        // shape (`apps/server/src/modules/silpo/cart.ts`), never an error.
        res.jsonBody({ items: [], totalKop: 0, cartUrl: null });
      })
      .executeTest(async (mockServer) => {
        const http = createHttpClient({ baseUrl: mockServer.url });
        const silpo = createSilpoEndpoints(http);
        const cart = await silpo.cartGet();
        expect(cart.items).toHaveLength(0);
        expect(typeof cart.totalKop).toBe("number");
        expect(cart.totalKop).toBe(0);
        expect(cart.cartUrl).toBeNull();
      });
  });

  it("accepts a null totalKop degrade (Silpo response missing both calculation fields)", async () => {
    await pact
      .addInteraction()
      .given("user-pact-003 has a Silpo cart with a calculation schema drift")
      .uponReceiving("a GET /api/v1/silpo/cart request (totalKop null degrade)")
      .withRequest("GET", "/api/v1/silpo/cart", (req) => {
        req.headers({ accept: "application/json" });
      })
      .willRespondWith(200, (res) => {
        res.headers({ "content-type": "application/json" });
        res.jsonBody({
          items: [
            {
              name: "Яйця С1 10шт",
              quantity: 1,
              priceKop: 6900,
              subtotalKop: 6900,
            },
          ],
          totalKop: null,
          cartUrl: null,
        });
      })
      .executeTest(async (mockServer) => {
        const http = createHttpClient({ baseUrl: mockServer.url });
        const silpo = createSilpoEndpoints(http);
        const cart = await silpo.cartGet();
        expect(cart.totalKop).toBeNull();
        expect(cart.cartUrl).toBeNull();
        expect(typeof cart.items[0]!.subtotalKop).toBe("number");
      });
  });
});
