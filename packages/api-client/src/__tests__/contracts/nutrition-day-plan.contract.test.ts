// @vitest-environment node
//
// Consumer contract: `POST /api/v1/nutrition/day-plan` — generate
// a one-day meal plan (nutrition persona). LLM-gated (Anthropic) —
// see `apps/server/src/modules/nutrition/day-plan.ts`. The api-client
// returns `NutritionDayPlanResponse` with a `plan` whose meals carry
// nullable macro fields + a stable meal-type enum.
//
// Why this contract: anchors the **response envelope** (plan.meals[],
// totalKcal/Protein/Fat/Carbs, note + optional rawText) so a future
// LLM-prompt refactor that accidentally drops `note` or returns
// `rawText: ""` instead of `null` is caught at PR-time. The matching
// provider-side replay stubs the Anthropic call (see
// `apps/server/src/__tests__/contracts/provider.test.ts`).

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { PactV4 } from "@pact-foundation/pact";

import { createHttpClient } from "../../httpClient";
import { createNutritionEndpoints } from "../../endpoints/nutrition";
import { createPact } from "./_pact";

describe("contract @ POST /api/v1/nutrition/day-plan", () => {
  let pact: PactV4;
  beforeAll(() => {
    pact = createPact();
  });
  afterAll(() => {});

  it("returns a normalized NutritionDayPlan for the given targets (nutrition persona)", async () => {
    await pact
      .addInteraction()
      .given(
        "an authenticated session with Anthropic key + AI quota available; pantry has milk, oats, eggs",
      )
      .uponReceiving(
        "a POST /api/v1/nutrition/day-plan request with targets and a small pantry",
      )
      .withRequest("POST", "/api/v1/nutrition/day-plan", (req) => {
        req.headers({
          accept: "application/json",
          "content-type": "application/json",
        });
        req.jsonBody({
          targets: { kcal: 2000, protein_g: 120, fat_g: 70, carbs_g: 220 },
          pantry: [
            { name: "milk", qty: 1, unit: "L" },
            { name: "oats", qty: 500, unit: "g" },
            { name: "eggs", qty: 6, unit: "pcs" },
          ],
          locale: "uk-UA",
        });
      })
      .willRespondWith(200, (res) => {
        res.headers({ "content-type": "application/json" });
        res.jsonBody({
          plan: {
            meals: [
              {
                type: "breakfast",
                label: "Сніданок",
                name: "Вівсянка з молоком",
                description: "Тепла вівсяна каша з молоком 2% і ягодами.",
                ingredients: ["вівсянка 80г", "молоко 250мл", "ягоди 100г"],
                kcal: 420,
                protein_g: 18,
                fat_g: 10,
                carbs_g: 65,
              },
              {
                type: "lunch",
                label: "Обід",
                name: "Омлет з овочами",
                description: "З 3 яєць, шпинатом, чорним хлібом.",
                ingredients: ["яйця 3шт", "шпинат 80г", "хліб 60г"],
                kcal: 540,
                protein_g: 32,
                fat_g: 24,
                carbs_g: 40,
              },
            ],
            totalKcal: 960,
            totalProtein_g: 50,
            totalFat_g: 34,
            totalCarbs_g: 105,
            note: "Партіальний план — лише сніданок і обід для прикладу.",
          },
          rawText: null,
        });
      })
      .executeTest(async (mockServer) => {
        const http = createHttpClient({ baseUrl: mockServer.url });
        const nutrition = createNutritionEndpoints(http);
        const out = await nutrition.dayPlan({
          targets: { kcal: 2000, protein_g: 120, fat_g: 70, carbs_g: 220 },
          pantry: [
            { name: "milk", qty: 1, unit: "L" },
            { name: "oats", qty: 500, unit: "g" },
            { name: "eggs", qty: 6, unit: "pcs" },
          ],
          locale: "uk-UA",
        });
        expect(out.plan.meals).toHaveLength(2);
        expect(out.plan.meals[0]!.type).toBe("breakfast");
        expect(out.plan.meals[1]!.type).toBe("lunch");
        // Numeric envelope (Hard Rule #1 sibling — LLM JSON often
        // arrives stringified; the normalizer in day-plan.ts must coerce).
        expect(typeof out.plan.totalKcal).toBe("number");
        expect(out.plan.totalKcal).toBe(960);
        expect(out.plan.note).toContain("Партіальний");
        expect(out.rawText).toBeNull();
      });
  });
});
