// @vitest-environment node
//
// Consumer contract: `POST /api/v1/nutrition/analyze-photo` —
// **nutrition persona** photo-meal analysis. Body is the photo b64,
// response is the parsed dish + ingredients + macros structure that
// the nutrition log UI renders.
//
// Shape lives in `packages/api-client/src/endpoints/nutrition.ts`
// (`NutritionPhotoResponse`) — mirrored by `apps/server/src/modules/
// nutrition/lib/nutritionResponse.js` normalizers. If the server adds
// a field, the consumer test must add it too or the pact fails on the
// provider side.

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { PactV4 } from "@pact-foundation/pact";

import { createHttpClient } from "../../httpClient";
import { createNutritionEndpoints } from "../../endpoints/nutrition";
import { createPact } from "./_pact";

describe("contract @ POST /api/v1/nutrition/analyze-photo", () => {
  let pact: PactV4;
  beforeAll(() => {
    pact = createPact();
  });
  afterAll(() => {});

  it("returns NutritionPhotoResponse for an analyzed meal photo (nutrition persona)", async () => {
    await pact
      .addInteraction()
      .given(
        "authenticated user-pact-001 within nutrition daily quota; Anthropic stub returns the deterministic borscht fixture",
      )
      .uponReceiving("a POST /api/v1/nutrition/analyze-photo request")
      .withRequest("POST", "/api/v1/nutrition/analyze-photo", (req) => {
        req.headers({
          accept: "application/json",
          "content-type": "application/json",
        });
        // We deliberately send a fixed payload so the provider replays
        // a deterministic request. Real photos go through pre-upload
        // compression upstream of this client method.
        req.jsonBody({
          imageBase64: "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABAAD-pact-fixture",
          mimeType: "image/png",
          locale: "uk-UA",
        });
      })
      .willRespondWith(200, (res) => {
        res.headers({ "content-type": "application/json" });
        res.jsonBody({
          result: {
            dishName: "Борщ із сметаною",
            confidence: 0.87,
            portion: { label: "тарілка", gramsApprox: 350 },
            ingredients: [
              { name: "буряк", notes: null },
              { name: "капуста", notes: null },
              { name: "м'ясо", notes: "телятина" },
            ],
            macros: {
              kcal: 280,
              protein_g: 18,
              fat_g: 12,
              carbs_g: 22,
            },
            questions: ["Чи був хліб?", "Скільки сметани було?"],
          },
          rawText: null,
        });
      })
      .executeTest(async (mockServer) => {
        const http = createHttpClient({ baseUrl: mockServer.url });
        const nutrition = createNutritionEndpoints(http);
        const out = await nutrition.analyzePhoto({
          imageBase64: "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABAAD-pact-fixture",
          mimeType: "image/png",
          locale: "uk-UA",
        });
        expect(out.result?.dishName).toBe("Борщ із сметаною");
        expect(out.result?.macros.kcal).toBe(280);
        expect(out.result?.ingredients).toHaveLength(3);
      });
  });
});
