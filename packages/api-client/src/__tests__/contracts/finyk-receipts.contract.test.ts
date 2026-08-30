// @vitest-environment node
//
// Consumer contract: `POST /api/v1/finyk/receipts/{lookup,analyze}`,
// `POST /api/v1/finyk/receipts`, `GET /api/v1/finyk/receipts/{id}` —
// receipt-scan v1 (finyk persona). Used by the "scan a receipt" flow:
// QR/ДПС lookup OR vision-photo analyze produce a draft, the user edits
// it on a review screen, then saves it.
//
// Why this contract: this is the FIRST Pact coverage for the receipt-scan
// domain, and it locks down two things a hand-written mock could easily
// get wrong:
//
//   - `ReceiptDraftSchema.confidence`/`fiscalNum` are nullable — the vision
//     draft carries `fiscalNum: null` + a numeric `confidence`, the DPS
//     draft carries the reverse (`fiscalNum` set, `confidence: null`).
//     A draft response is ALSO never expected to carry `clientScanId`
//     (the server never sets it on lookup/analyze — only `saveReceipt`
//     consumes it from the request body).
//   - `receipt.id`/`item.id`/`item.receiptId` are `pg` BIGSERIAL columns
//     coerced to `number` server-side (Hard Rule #1) — asserted via
//     `typeof`, not just presence, so a bigint-as-string regression fails
//     here instead of silently reaching the transaction-detail UI.
//   - `POST /api/finyk/receipts/analyze` 415 uses a NON-standard error
//     envelope (`{code, detail, declared_mime, detected_mime}` — mirrors
//     `apps/server/src/modules/nutrition/analyze-photo.ts`), not the
//     canonical `{error, message, code, requestId}` shape every other
//     4xx/5xx on this domain uses. `POST /api/finyk/receipts/lookup` 404
//     DOES use the canonical envelope with a receipt-scan-specific `code`
//     (`DPS_RECEIPT_NOT_FOUND`) — locking that the custom `code` survives
//     the `errorHandler` round-trip (a generic `ApiError` zod schema
//     alone would accept ANY string there, so this interaction is the
//     only place that specific code is proven end-to-end).
//
// Schemas live in `@sergeant/shared` (`ReceiptDraftResponseSchema`,
// `ReceiptSaveResponseSchema`, `ReceiptGetResponseSchema`, …), re-exported
// verbatim by `packages/api-client/src/endpoints/finykReceipts.ts` — no
// hand-redeclared shapes (Hard Rule #3). Server serializers verified
// read-only against `apps/server/src/modules/finyk/receipts/{lookup,
// analyze,save,get,serialize}.ts`.

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { PactV4 } from "@pact-foundation/pact";

import { createHttpClient } from "../../httpClient";
import { createFinykReceiptsEndpoints } from "../../endpoints/finykReceipts";
import { isApiError } from "../../ApiError";
import { isImageValidationErrorBody } from "../../endpoints/imageValidationError";
import { CONTRACT_SUITE_OPTIONS, createPact } from "./_pact";

describe(
  "contract @ POST /api/v1/finyk/receipts/lookup",
  CONTRACT_SUITE_OPTIONS,
  () => {
    let pact: PactV4;
    beforeAll(() => {
      pact = createPact();
    });
    afterAll(() => {});

    it("returns a DPS-sourced draft (fiscalNum set, confidence null)", async () => {
      await pact
        .addInteraction()
        .given(
          "authenticated user-pact-001; DPS chkAll has the fiscal receipt for {fn,id,date,time,sm}",
        )
        .uponReceiving("a POST /api/v1/finyk/receipts/lookup request")
        .withRequest("POST", "/api/v1/finyk/receipts/lookup", (req) => {
          req.headers({
            accept: "application/json",
            "content-type": "application/json",
          });
          req.jsonBody({
            fn: "4000123456",
            id: "abc123XYZ",
            date: "15012026",
            time: "123210",
            sm: "150.00",
          });
        })
        .willRespondWith(200, (res) => {
          res.headers({ "content-type": "application/json" });
          res.jsonBody({
            draft: {
              source: "dps",
              fiscalNum: "4000123456",
              store: "Сільпо",
              storeTaxId: "30363252",
              purchasedAt: "2026-01-15T12:32:10.000Z",
              totalKopiykas: 15000,
              items: [
                {
                  position: 1,
                  name: "Молоко",
                  qty: 1,
                  priceKopiykas: 3200,
                  sumKopiykas: 3200,
                },
              ],
              confidence: null,
              rawPayload: { xml: "<CHECK><NAME>Сільпо</NAME></CHECK>" },
            },
          });
        })
        .executeTest(async (mockServer) => {
          const http = createHttpClient({ baseUrl: mockServer.url });
          const receipts = createFinykReceiptsEndpoints(http);
          const out = await receipts.lookupReceipt({
            fn: "4000123456",
            id: "abc123XYZ",
            date: "15012026",
            time: "123210",
            sm: "150.00",
          });

          expect(out.draft.source).toBe("dps");
          expect(out.draft.fiscalNum).toBe("4000123456");
          expect(out.draft.confidence).toBeNull();
          // Hard Rule #1 sibling: money fields are `number`, never a
          // bigint-string leak.
          expect(typeof out.draft.totalKopiykas).toBe("number");
          expect(out.draft.totalKopiykas).toBe(15000);
          expect(typeof out.draft.items[0]!.sumKopiykas).toBe("number");
          // The server never sets `clientScanId` on lookup/analyze drafts
          // — only the save request body carries it.
          expect(out.draft.clientScanId).toBeUndefined();
        });
    });

    it("404s with DPS_RECEIPT_NOT_FOUND (standard envelope, receipt-scan-specific code)", async () => {
      await pact
        .addInteraction()
        .given(
          "authenticated user-pact-001; DPS chkAll has no record yet for {fn,id,date,time,sm} (appearance lag)",
        )
        .uponReceiving(
          "a POST /api/v1/finyk/receipts/lookup request (not yet indexed)",
        )
        .withRequest("POST", "/api/v1/finyk/receipts/lookup", (req) => {
          req.headers({
            accept: "application/json",
            "content-type": "application/json",
          });
          req.jsonBody({
            fn: "4000999999",
            id: "notyet001",
            date: "15012026",
            time: "090000",
            sm: "50.00",
          });
        })
        .willRespondWith(404, (res) => {
          res.headers({ "content-type": "application/json" });
          res.jsonBody({
            error:
              "Чек ще не зʼявився в реєстрі ДПС, спробуй за кілька хвилин або сфотографуй чек.",
            message:
              "Чек ще не зʼявився в реєстрі ДПС, спробуй за кілька хвилин або сфотографуй чек.",
            code: "DPS_RECEIPT_NOT_FOUND",
            requestId: "req-pact-receipts-lookup-404",
          });
        })
        .executeTest(async (mockServer) => {
          const http = createHttpClient({ baseUrl: mockServer.url });
          const receipts = createFinykReceiptsEndpoints(http);

          await expect(
            receipts.lookupReceipt({
              fn: "4000999999",
              id: "notyet001",
              date: "15012026",
              time: "090000",
              sm: "50.00",
            }),
          ).rejects.toMatchObject({
            status: 404,
            requestId: "req-pact-receipts-lookup-404",
            serverMessage:
              "Чек ще не зʼявився в реєстрі ДПС, спробуй за кілька хвилин або сфотографуй чек.",
          });
        });
    });
  },
);

describe(
  "contract @ POST /api/v1/finyk/receipts/analyze",
  CONTRACT_SUITE_OPTIONS,
  () => {
    let pact: PactV4;
    beforeAll(() => {
      pact = createPact();
    });
    afterAll(() => {});

    it("returns a vision-sourced draft (fiscalNum null, numeric confidence)", async () => {
      await pact
        .addInteraction()
        .given(
          "authenticated user-pact-001; vision provider recognises the photo",
        )
        .uponReceiving("a POST /api/v1/finyk/receipts/analyze request")
        .withRequest("POST", "/api/v1/finyk/receipts/analyze", (req) => {
          req.headers({
            accept: "application/json",
            "content-type": "application/json",
          });
          req.jsonBody({
            image_base64: "a".repeat(200),
            mime_type: "image/png",
          });
        })
        .willRespondWith(200, (res) => {
          res.headers({ "content-type": "application/json" });
          res.jsonBody({
            draft: {
              source: "vision",
              fiscalNum: null,
              store: "АТБ",
              storeTaxId: null,
              purchasedAt: "2026-01-15T09:10:00.000Z",
              totalKopiykas: 8900,
              items: [
                {
                  position: 1,
                  name: "Хліб",
                  qty: 1,
                  priceKopiykas: 2500,
                  sumKopiykas: 2500,
                },
                {
                  position: 2,
                  name: "Молоко",
                  qty: 2,
                  priceKopiykas: 3200,
                  sumKopiykas: 6400,
                },
              ],
              confidence: 0.82,
              rawPayload: { store: "АТБ", total_kopiykas: 8900 },
            },
          });
        })
        .executeTest(async (mockServer) => {
          const http = createHttpClient({ baseUrl: mockServer.url });
          const receipts = createFinykReceiptsEndpoints(http);
          const out = await receipts.analyzeReceipt({
            image_base64: "a".repeat(200),
            mime_type: "image/png",
          });

          expect(out.draft.source).toBe("vision");
          expect(out.draft.fiscalNum).toBeNull();
          expect(typeof out.draft.confidence).toBe("number");
          expect(out.draft.confidence).toBe(0.82);
          expect(out.draft.items).toHaveLength(2);
          expect(typeof out.draft.items[1]!.priceKopiykas).toBe("number");
        });
    });

    it("415s with the non-standard image-validation envelope on a magic-byte mismatch", async () => {
      await pact
        .addInteraction()
        .given(
          "authenticated user-pact-001; uploaded bytes are a GIF, not an allowed image type",
        )
        .uponReceiving(
          "a POST /api/v1/finyk/receipts/analyze request (magic-byte mismatch)",
        )
        .withRequest("POST", "/api/v1/finyk/receipts/analyze", (req) => {
          req.headers({
            accept: "application/json",
            "content-type": "application/json",
          });
          req.jsonBody({
            image_base64: "R0lGODlh".repeat(20),
            mime_type: "image/gif",
          });
        })
        .willRespondWith(415, (res) => {
          res.headers({ "content-type": "application/json" });
          res.jsonBody({
            code: "MAGIC_MISMATCH",
            detail:
              "Detected image/gif, but only image/jpeg, image/png, image/webp, image/heic are allowed",
            declared_mime: "image/gif",
            detected_mime: "image/gif",
          });
        })
        .executeTest(async (mockServer) => {
          const http = createHttpClient({ baseUrl: mockServer.url });
          const receipts = createFinykReceiptsEndpoints(http);

          let caught: unknown;
          try {
            await receipts.analyzeReceipt({
              image_base64: "R0lGODlh".repeat(20),
              mime_type: "image/gif",
            });
          } catch (err) {
            caught = err;
          }

          expect(isApiError(caught)).toBe(true);
          if (!isApiError(caught)) return;
          expect(caught.status).toBe(415);
          // NOT the standard envelope — no top-level `error`/`message`.
          expect(caught.serverMessage).toBeUndefined();
          const body = caught.body;
          expect(isImageValidationErrorBody(body)).toBe(true);
          if (
            isImageValidationErrorBody(body) &&
            body.code === "MAGIC_MISMATCH"
          ) {
            expect(body.declared_mime).toBe("image/gif");
            expect(body.detected_mime).toBe("image/gif");
          }
        });
    });
  },
);

describe(
  "contract @ POST /api/v1/finyk/receipts",
  CONTRACT_SUITE_OPTIONS,
  () => {
    let pact: PactV4;
    beforeAll(() => {
      pact = createPact();
    });
    afterAll(() => {});

    it("201s a newly-created DPS receipt linked to a mono transaction", async () => {
      await pact
        .addInteraction()
        .given(
          "authenticated user-pact-001; no receipt yet for fiscalNum 4000123456; a matching mono transaction exists",
        )
        .uponReceiving(
          "a POST /api/v1/finyk/receipts request (new DPS receipt, matches mono)",
        )
        .withRequest("POST", "/api/v1/finyk/receipts", (req) => {
          req.headers({
            accept: "application/json",
            "content-type": "application/json",
          });
          req.jsonBody({
            source: "dps",
            fiscalNum: "4000123456",
            store: "Сільпо",
            storeTaxId: "30363252",
            purchasedAt: "2026-01-15T12:32:10.000Z",
            totalKopiykas: 15000,
            items: [
              {
                position: 1,
                name: "Молоко",
                qty: 1,
                priceKopiykas: 3200,
                sumKopiykas: 3200,
              },
            ],
            confidence: null,
            rawPayload: { xml: "<CHECK><NAME>Сільпо</NAME></CHECK>" },
            category: "food",
          });
        })
        .willRespondWith(201, (res) => {
          res.headers({ "content-type": "application/json" });
          res.jsonBody({
            receipt: {
              id: 501,
              source: "dps",
              fiscalNum: "4000123456",
              store: "Сільпо",
              storeTaxId: "30363252",
              purchasedAt: "2026-01-15T12:32:10.000Z",
              totalKopiykas: 15000,
              items: [
                {
                  id: 9001,
                  receiptId: 501,
                  position: 1,
                  name: "Молоко",
                  qty: 1,
                  priceKopiykas: 3200,
                  sumKopiykas: 3200,
                },
              ],
              link: { txKind: "mono", txRef: "mono-tx-777" },
              createdAt: "2026-01-15T12:35:00.000Z",
              updatedAt: "2026-01-15T12:35:00.000Z",
            },
            alreadyExists: false,
          });
        })
        .executeTest(async (mockServer) => {
          const http = createHttpClient({ baseUrl: mockServer.url });
          const receipts = createFinykReceiptsEndpoints(http);
          const out = await receipts.saveReceipt({
            source: "dps",
            fiscalNum: "4000123456",
            store: "Сільпо",
            storeTaxId: "30363252",
            purchasedAt: "2026-01-15T12:32:10.000Z",
            totalKopiykas: 15000,
            items: [
              {
                position: 1,
                name: "Молоко",
                qty: 1,
                priceKopiykas: 3200,
                sumKopiykas: 3200,
              },
            ],
            confidence: null,
            rawPayload: { xml: "<CHECK><NAME>Сільпо</NAME></CHECK>" },
            category: "food",
          });

          expect(out.alreadyExists).toBe(false);
          expect(out.receipt.link).toEqual({
            txKind: "mono",
            txRef: "mono-tx-777",
          });
          // `id`/`items[].id`/`items[].receiptId` are pg BIGSERIAL columns
          // coerced server-side (Hard Rule #1) — must be `number`.
          expect(typeof out.receipt.id).toBe("number");
          expect(typeof out.receipt.items[0]!.id).toBe("number");
          expect(typeof out.receipt.items[0]!.receiptId).toBe("number");
        });
    });

    it("200s an idempotent replay (vision receipt, clientScanId, unmatched → manual link)", async () => {
      const clientScanId = "9f2b6b9e-6c0a-4e6a-8f0e-1a2b3c4d5e6f";
      await pact
        .addInteraction()
        .given(
          "authenticated user-pact-001; a vision receipt with this clientScanId already exists (unmatched, manual expense link)",
        )
        .uponReceiving(
          "a POST /api/v1/finyk/receipts request (retry of a vision save via clientScanId)",
        )
        .withRequest("POST", "/api/v1/finyk/receipts", (req) => {
          req.headers({
            accept: "application/json",
            "content-type": "application/json",
          });
          req.jsonBody({
            source: "vision",
            fiscalNum: null,
            store: "АТБ",
            storeTaxId: null,
            purchasedAt: "2026-01-15T09:10:00.000Z",
            totalKopiykas: 8900,
            items: [
              {
                position: 1,
                name: "Хліб",
                qty: 1,
                priceKopiykas: 2500,
                sumKopiykas: 2500,
              },
            ],
            confidence: 0.82,
            rawPayload: { store: "АТБ", total_kopiykas: 8900 },
            clientScanId,
            category: "food",
          });
        })
        .willRespondWith(200, (res) => {
          res.headers({ "content-type": "application/json" });
          res.jsonBody({
            receipt: {
              id: 502,
              source: "vision",
              fiscalNum: null,
              store: "АТБ",
              storeTaxId: null,
              purchasedAt: "2026-01-15T09:10:00.000Z",
              totalKopiykas: 8900,
              items: [
                {
                  id: 9002,
                  receiptId: 502,
                  position: 1,
                  name: "Хліб",
                  qty: 1,
                  priceKopiykas: 2500,
                  sumKopiykas: 2500,
                },
              ],
              link: {
                txKind: "manual",
                txRef: "6f5e4d3c-2b1a-4444-8888-abcdefabcdef",
              },
              createdAt: "2026-01-15T09:12:00.000Z",
              updatedAt: "2026-01-15T09:12:00.000Z",
            },
            alreadyExists: true,
          });
        })
        .executeTest(async (mockServer) => {
          const http = createHttpClient({ baseUrl: mockServer.url });
          const receipts = createFinykReceiptsEndpoints(http);
          const out = await receipts.saveReceipt({
            source: "vision",
            fiscalNum: null,
            store: "АТБ",
            storeTaxId: null,
            purchasedAt: "2026-01-15T09:10:00.000Z",
            totalKopiykas: 8900,
            items: [
              {
                position: 1,
                name: "Хліб",
                qty: 1,
                priceKopiykas: 2500,
                sumKopiykas: 2500,
              },
            ],
            confidence: 0.82,
            rawPayload: { store: "АТБ", total_kopiykas: 8900 },
            clientScanId,
            category: "food",
          });

          expect(out.alreadyExists).toBe(true);
          expect(out.receipt.link?.txKind).toBe("manual");
          expect(typeof out.receipt.totalKopiykas).toBe("number");
        });
    });
  },
);

describe(
  "contract @ GET /api/v1/finyk/receipts/{id}",
  CONTRACT_SUITE_OPTIONS,
  () => {
    let pact: PactV4;
    beforeAll(() => {
      pact = createPact();
    });
    afterAll(() => {});

    it("returns the receipt with its line items for drill-down", async () => {
      await pact
        .addInteraction()
        .given("authenticated user-pact-001 owns receipt 501")
        .uponReceiving("a GET /api/v1/finyk/receipts/501 request")
        .withRequest("GET", "/api/v1/finyk/receipts/501", (req) => {
          req.headers({ accept: "application/json" });
        })
        .willRespondWith(200, (res) => {
          res.headers({ "content-type": "application/json" });
          res.jsonBody({
            receipt: {
              id: 501,
              source: "dps",
              fiscalNum: "4000123456",
              store: "Сільпо",
              storeTaxId: "30363252",
              purchasedAt: "2026-01-15T12:32:10.000Z",
              totalKopiykas: 15000,
              items: [
                {
                  id: 9001,
                  receiptId: 501,
                  position: 1,
                  name: "Молоко",
                  qty: 1,
                  priceKopiykas: 3200,
                  sumKopiykas: 3200,
                },
              ],
              link: { txKind: "mono", txRef: "mono-tx-777" },
              createdAt: "2026-01-15T12:35:00.000Z",
              updatedAt: "2026-01-15T12:35:00.000Z",
            },
          });
        })
        .executeTest(async (mockServer) => {
          const http = createHttpClient({ baseUrl: mockServer.url });
          const receipts = createFinykReceiptsEndpoints(http);
          const out = await receipts.getReceipt(501);

          expect(out.receipt.id).toBe(501);
          expect(out.receipt.items).toHaveLength(1);
          expect(typeof out.receipt.items[0]!.qty).toBe("number");
          expect(out.receipt.link).toEqual({
            txKind: "mono",
            txRef: "mono-tx-777",
          });
        });
    });
  },
);
