// @vitest-environment node
//
// Consumer contract: `POST /api/nutrition/parse-pantry` — LLM-backed
// natural-language pantry parser (nutrition persona). Body is free text
// (`{ text, locale? }`), response is `{ items: NutritionPantryItem[];
// rawText: string | null }`.
//
// Why this contract: the AI returns a variable-structure JSON blob that
// `normalizePantryItems()` on the server must shape into the stable
// `NutritionPantryItem` array before `res.json()`. If the normaliser
// drifts (e.g. emits `qty: "2"` instead of `qty: 2`), the food-log
// UI's `qty ?? 0` arithmetic becomes string-concat instead of addition.
// The api-client types use `qty: number | null`, so this contract test
// catches the coercion gap at PR time.
//
// Response type: `NutritionParsePantryResponse` in
// `packages/api-client/src/endpoints/nutrition.ts`.

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { PactV4 } from "@pact-foundation/pact";

import { createHttpClient } from "../../httpClient";
import { createNutritionEndpoints } from "../../endpoints/nutrition";
import { createPact } from "./_pact";

describe("contract @ POST /api/nutrition/parse-pantry", () => {
  let pact: PactV4;
  beforeAll(() => {
    pact = createPact();
  });
  afterAll(() => {});

  it("returns NutritionParsePantryResponse with normalised items (nutrition persona)", async () => {
    await pact
      .addInteraction()
      .given(
        "authenticated user-pact-001 within AI quota; Anthropic stub returns a deterministic 2-item pantry parse",
      )
      .uponReceiving(
        "a POST /api/nutrition/parse-pantry request with two-item free text",
      )
      .withRequest("POST", "/api/v1/nutrition/parse-pantry", (req) => {
        req.headers({
          accept: "application/json",
          "content-type": "application/json",
        });
        req.jsonBody({
          text: "молоко 1л, яйця 6шт",
          locale: "uk-UA",
        });
      })
      .willRespondWith(200, (res) => {
        res.headers({ "content-type": "application/json" });
        res.jsonBody({
          items: [
            { name: "молоко", qty: 1, unit: "л", notes: null },
            { name: "яйця", qty: 6, unit: "шт", notes: null },
          ],
          rawText:
            '{"items":[{"name":"молоко","qty":1,"unit":"л","notes":null},{"name":"яйця","qty":6,"unit":"шт","notes":null}]}',
        });
      })
      .executeTest(async (mockServer) => {
        const http = createHttpClient({ baseUrl: mockServer.url });
        const nutrition = createNutritionEndpoints(http);
        const out = await nutrition.parsePantry({
          text: "молоко 1л, яйця 6шт",
          locale: "uk-UA",
        });

        expect(Array.isArray(out.items)).toBe(true);
        expect(out.items).toHaveLength(2);

        const first = out.items[0]!;
        expect(first.name).toBe("молоко");
        // Hard Rule #1 sibling: qty must be a number, not a string.
        // The normaliser in parse-pantry.ts calls `normalizePantryItems()`
        // which coerces qty to Number before `res.json()`.
        expect(typeof first.qty).toBe("number");
        expect(first.qty).toBe(1);
        expect(first.unit).toBe("л");
        expect(first.notes).toBeNull();

        const second = out.items[1]!;
        expect(second.name).toBe("яйця");
        expect(second.qty).toBe(6);
        expect(second.unit).toBe("шт");

        // rawText is preserved for audit / debugging.
        expect(typeof out.rawText).toBe("string");
      });
  });

  it("returns empty items array when no parseable products in input (nutrition persona)", async () => {
    await pact
      .addInteraction()
      .given(
        "authenticated user-pact-001 within AI quota; Anthropic stub returns empty items for gibberish input",
      )
      .uponReceiving(
        "a POST /api/nutrition/parse-pantry request with unparseable input",
      )
      .withRequest("POST", "/api/v1/nutrition/parse-pantry", (req) => {
        req.headers({
          accept: "application/json",
          "content-type": "application/json",
        });
        req.jsonBody({
          text: "…",
          locale: "uk-UA",
        });
      })
      .willRespondWith(200, (res) => {
        res.headers({ "content-type": "application/json" });
        res.jsonBody({
          items: [],
          rawText: '{"items":[]}',
        });
      })
      .executeTest(async (mockServer) => {
        const http = createHttpClient({ baseUrl: mockServer.url });
        const nutrition = createNutritionEndpoints(http);
        const out = await nutrition.parsePantry({
          text: "…",
          locale: "uk-UA",
        });

        expect(out.items).toHaveLength(0);
        expect(out.rawText).toBe('{"items":[]}');
      });
  });

  it("returns items with null qty/unit when quantity is absent from the input", async () => {
    await pact
      .addInteraction()
      .given(
        "authenticated user-pact-001 within AI quota; Anthropic stub returns items with null qty",
      )
      .uponReceiving(
        "a POST /api/nutrition/parse-pantry request with quantity-free items",
      )
      .withRequest("POST", "/api/v1/nutrition/parse-pantry", (req) => {
        req.headers({
          accept: "application/json",
          "content-type": "application/json",
        });
        req.jsonBody({
          text: "сіль, перець",
          locale: "uk-UA",
        });
      })
      .willRespondWith(200, (res) => {
        res.headers({ "content-type": "application/json" });
        res.jsonBody({
          items: [
            { name: "сіль", qty: null, unit: null, notes: null },
            { name: "перець", qty: null, unit: null, notes: null },
          ],
          rawText:
            '{"items":[{"name":"сіль","qty":null,"unit":null,"notes":null},{"name":"перець","qty":null,"unit":null,"notes":null}]}',
        });
      })
      .executeTest(async (mockServer) => {
        const http = createHttpClient({ baseUrl: mockServer.url });
        const nutrition = createNutritionEndpoints(http);
        const out = await nutrition.parsePantry({
          text: "сіль, перець",
          locale: "uk-UA",
        });

        expect(out.items).toHaveLength(2);
        expect(out.items[0]!.qty).toBeNull();
        expect(out.items[0]!.unit).toBeNull();
        expect(out.items[1]!.qty).toBeNull();
      });
  });
});
