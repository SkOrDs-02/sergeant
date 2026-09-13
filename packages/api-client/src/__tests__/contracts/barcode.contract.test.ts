// @vitest-environment node
//
// Consumer contract: `GET /api/v1/barcode?barcode=…` — Open Food Facts
// / USDA / UPCitemdb-backed product lookup by EAN/UPC (nutrition
// persona). Used when the user scans a product in the food log.
//
// Why this contract: no LLM, no quota — a pg-backed cache + upstream
// fan-out. Locks the success-envelope shape (`{ product: {...} }`
// where every macro is `number | null` and `source` is the strict
// enum from `BarcodeProductSchema`). A drift on `source` or on a
// nullable macro would break the food-log UI's "uncertain values"
// indicator.
//
// Schema lives in `@sergeant/shared` (`BarcodeLookupResponseSchema` /
// `BarcodeProductSchema`).

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { PactV4 } from "@pact-foundation/pact";

import { createHttpClient } from "../../httpClient";
import { createBarcodeEndpoints } from "../../endpoints/barcode";
import { CONTRACT_SUITE_OPTIONS, createPact } from "./_pact";

describe("contract @ GET /api/v1/barcode", CONTRACT_SUITE_OPTIONS, () => {
  let pact: PactV4;
  beforeAll(() => {
    pact = createPact();
  });
  afterAll(() => {});

  it("returns a BarcodeLookupSuccess for a known product (nutrition persona)", async () => {
    await pact
      .addInteraction()
      .given(
        "an authenticated session and barcode 4820010840443 is cached as 'Milk 2% Yagotynske' (source=off)",
      )
      .uponReceiving("a GET /api/v1/barcode?barcode=4820010840443 request")
      .withRequest("GET", "/api/v1/barcode", (req) => {
        req.headers({ accept: "application/json" });
        req.query({ barcode: "4820010840443" });
      })
      .willRespondWith(200, (res) => {
        res.headers({ "content-type": "application/json" });
        res.jsonBody({
          product: {
            name: "Milk 2%",
            brand: "Yagotynske",
            kcal_100g: 52,
            protein_100g: 3.4,
            fat_100g: 2,
            carbs_100g: 4.8,
            servingSize: "250 ml",
            servingGrams: 250,
            source: "off",
            // Нутрієнти понад КБЖВ (N9). Ключ присутній, бо джерело — OFF,
            // яке такі дані віддає; `alcohol_100g: null` тут означає
            // «спитали, у картці немає», а не «не питали».
            nutrients: {
              fiber_100g: 0,
              sugars_100g: 4.8,
              saturatedFat_100g: 1.2,
              salt_100g: 0.1,
              alcohol_100g: null,
            },
          },
        });
      })
      .executeTest(async (mockServer) => {
        const http = createHttpClient({ baseUrl: mockServer.url });
        const barcode = createBarcodeEndpoints(http);
        const out = await barcode.lookup("4820010840443");
        expect(out.product).toBeDefined();
        // Discriminate the success branch — the api-client's response
        // type is a union with the 404/error envelope.
        const product = out.product!;
        expect(product.name).toBe("Milk 2%");
        expect(product.brand).toBe("Yagotynske");
        expect(product.source).toBe("off");
        expect(product.kcal_100g).toBe(52);
        // Macros + serving-size invariants — every numeric field must be
        // a `number`, not a stringified one (Hard Rule #1 sibling-rule
        // for upstream-driven floats).
        expect(typeof product.protein_100g).toBe("number");
        expect(typeof product.servingGrams).toBe("number");
        // Нутрієнти їдуть тим самим контрактом — не окремим ендпоінтом
        // і не «як-небудь». Нуль тут значущий: 0 г клітковини — це факт,
        // а не відсутність даних, тому перевіряємо саме значення.
        expect(product.nutrients?.fiber_100g).toBe(0);
        expect(product.nutrients?.saturatedFat_100g).toBe(1.2);
        expect(product.nutrients?.alcohol_100g).toBeNull();
      });
  });
});
