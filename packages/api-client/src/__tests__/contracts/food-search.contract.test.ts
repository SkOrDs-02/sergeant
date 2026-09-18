// @vitest-environment node
//
// Consumer contract: `GET /api/food-search?q=…` — cascading food-product
// search through Open Food Facts and USDA Branded Foods (nutrition persona).
// Used by `useFoodSearch` / `FoodPickerSection` when the user types a food
// name in the nutrition log.
//
// Why this contract: response envelope is `{ products: FoodSearchProduct[] }`
// where every `per100` macro is `number` (not `number | null` — the server
// always backfills 0). A drift on `per100.kcal` being null vs. 0 would
// break the food-picker's macro arithmetic silently. The `source` enum
// (`"off" | "usda"`) locks the upstream label so the client can render
// different badges without runtime assertions.
//
// Schema lives in `@sergeant/shared` (`FoodSearchResponseSchema` /
// `FoodSearchProductSchema`).

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { PactV4 } from "@pact-foundation/pact";

import { createHttpClient } from "../../httpClient";
import { createFoodSearchEndpoints } from "../../endpoints/foodSearch";
import { CONTRACT_SUITE_OPTIONS, createPact } from "./_pact";

describe("contract @ GET /api/food-search", CONTRACT_SUITE_OPTIONS, () => {
  let pact: PactV4;
  beforeAll(() => {
    pact = createPact();
  });
  afterAll(() => {});

  it("returns FoodSearchSuccess with OFF products for a known query (nutrition persona)", async () => {
    await pact
      .addInteraction()
      .given(
        "Open Food Facts returns 1 hit for query 'молоко' (source=off, full macros)",
      )
      .uponReceiving("a GET /api/food-search?q=молоко request")
      .withRequest("GET", "/api/v1/food-search", (req) => {
        req.headers({ accept: "application/json" });
        req.query({ q: "молоко" });
      })
      .willRespondWith(200, (res) => {
        res.headers({ "content-type": "application/json" });
        res.jsonBody({
          products: [
            {
              id: "off_pact_milk",
              name: "Молоко 2.5%",
              brand: "Яготинське",
              source: "off",
              per100: {
                kcal: 52,
                protein_g: 2.8,
                fat_g: 2.5,
                carbs_g: 4.7,
              },
              defaultGrams: 200,
            },
          ],
        });
      })
      .executeTest(async (mockServer) => {
        const http = createHttpClient({ baseUrl: mockServer.url });
        const foodSearch = createFoodSearchEndpoints(http);
        const out = await foodSearch.search("молоко");

        // Discriminate success branch — FoodSearchResponse is a union
        // with a `{ products }` success and a `{ error }` failure.
        expect("products" in out).toBe(true);
        const products = (out as { products: unknown[] }).products;
        expect(Array.isArray(products)).toBe(true);
        expect(products).toHaveLength(1);

        const p = products[0] as {
          id: string;
          name: string;
          brand: string | null;
          source: string;
          per100: Record<string, unknown>;
          defaultGrams: number;
        };
        expect(p.id).toBe("off_pact_milk");
        expect(p.name).toBe("Молоко 2.5%");
        expect(p.source).toBe("off");
        // Hard Rule #1 sibling: per100 macros must already be numbers —
        // the server backfills 0, never null, for upstream-missing values.
        expect(typeof p.per100["kcal"]).toBe("number");
        expect(typeof p.per100["protein_g"]).toBe("number");
        expect(p.per100["kcal"]).toBe(52);
        expect(typeof p.defaultGrams).toBe("number");
      });
  });

  it("returns FoodSearchSuccess with empty products when nothing matches", async () => {
    await pact
      .addInteraction()
      .given(
        "Open Food Facts and USDA return no results for query 'xyzunknownfood123'",
      )
      .uponReceiving(
        "a GET /api/food-search?q=xyzunknownfood123 request (empty result)",
      )
      .withRequest("GET", "/api/v1/food-search", (req) => {
        req.headers({ accept: "application/json" });
        req.query({ q: "xyzunknownfood123" });
      })
      .willRespondWith(200, (res) => {
        res.headers({ "content-type": "application/json" });
        res.jsonBody({ products: [] });
      })
      .executeTest(async (mockServer) => {
        const http = createHttpClient({ baseUrl: mockServer.url });
        const foodSearch = createFoodSearchEndpoints(http);
        const out = await foodSearch.search("xyzunknownfood123");

        expect("products" in out).toBe(true);
        const products = (out as { products: unknown[] }).products;
        expect(products).toHaveLength(0);
      });
  });

  it("returns error envelope on upstream timeout (504)", async () => {
    await pact
      .addInteraction()
      .given("Open Food Facts and USDA both timeout for query 'broccoli'")
      .uponReceiving(
        "a GET /api/food-search?q=broccoli request (upstream timeout)",
      )
      .withRequest("GET", "/api/v1/food-search", (req) => {
        req.headers({ accept: "application/json" });
        req.query({ q: "broccoli" });
      })
      .willRespondWith(504, (res) => {
        res.headers({ "content-type": "application/json" });
        res.jsonBody({
          error: "Сервіс недоступний (таймаут). Спробуй пізніше.",
        });
      })
      .executeTest(async (mockServer) => {
        const http = createHttpClient({ baseUrl: mockServer.url });
        const foodSearch = createFoodSearchEndpoints(http);

        // 504 throws ApiError; the error message propagates from the
        // server's `{ error }` envelope so the UI can show a localised
        // message rather than a generic HTTP code.
        await expect(foodSearch.search("broccoli")).rejects.toMatchObject({
          status: 504,
          serverMessage: "Сервіс недоступний (таймаут). Спробуй пізніше.",
        });
      });
  });
});
