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

import { sumMacrosNullable } from "@sergeant/shared";

import { createHttpClient } from "../../httpClient";
import { createNutritionEndpoints } from "../../endpoints/nutrition";
import { CONTRACT_SUITE_OPTIONS, createPact } from "./_pact";

describe(
  "contract @ POST /api/v1/nutrition/analyze-photo",
  CONTRACT_SUITE_OPTIONS,
  () => {
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
              isFood: true,
              notFoodKind: null,
              dishName: "Борщ із сметаною",
              confidence: 0.87,
              portion: { label: "тарілка", gramsApprox: 350 },
              ingredients: [
                { name: "буряк", notes: null },
                { name: "капуста", notes: null },
                { name: "мʼясо", notes: "телятина" },
              ],
              items: [
                {
                  name: "Борщ",
                  macros: {
                    kcal: 220,
                    protein_g: 14,
                    fat_g: 8,
                    carbs_g: 20,
                  },
                  gramsApprox: 300,
                  confidence: 0.88,
                },
                {
                  name: "Сметана",
                  macros: {
                    kcal: 60,
                    protein_g: 4,
                    fat_g: 4,
                    carbs_g: 2,
                  },
                  gramsApprox: 50,
                  confidence: 0.72,
                },
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
          expect(out.result?.isFood).toBe(true);
          expect(out.result?.notFoodKind).toBeNull();
          expect(out.result?.dishName).toBe("Борщ із сметаною");
          expect(out.result?.macros.kcal).toBe(280);
          expect(out.result?.ingredients).toHaveLength(3);
          expect(out.result?.items).toHaveLength(2);

          // Підсумок мусить бути сумою позицій, інакше видалення рядка на
          // картці нічого не змінює — рівно той баг, від якого тікає
          // ініціатива 0023. Сервер рахує його через `sumMacrosNullable`;
          // пакт пінить рівність на боці споживача.
          expect(out.result?.macros).toEqual(
            sumMacrosNullable((out.result?.items ?? []).map((i) => i.macros)),
          );
        });
    });
  },
);
