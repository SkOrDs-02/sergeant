// @vitest-environment node
//
// Consumer contract: `GET /api/v1/coach/memory` — coach memory blob
// (hub persona). The web/insights surface reads this on every Hub
// dashboard open and on the weekly-digest flow to assemble the
// "what does the coach remember about me" snapshot before calling
// `postInsight` (see `apps/web/src/core/insights/useCoachInsight.ts`).
//
// Why this contract: session-only, no Anthropic — the lightest hub
// READ. The shape is intentionally open (`memory: unknown`) because
// the blob's interior changes with weekly digest growth, but the
// envelope `{ ok: true, memory: <blob | null> }` is the stable
// integration surface every hub feature depends on.

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { PactV4 } from "@pact-foundation/pact";

import { createHttpClient } from "../../httpClient";
import { createCoachEndpoints } from "../../endpoints/coach";
import { createPact } from "./_pact";

describe("contract @ GET /api/v1/coach/memory", () => {
  let pact: PactV4;
  beforeAll(() => {
    pact = createPact();
  });
  afterAll(() => {});

  it("returns the coach memory blob for an authenticated user (hub persona)", async () => {
    await pact
      .addInteraction()
      .given(
        "an authenticated session for user-pact-001 with one weekly-digest entry in coach_memory",
      )
      .uponReceiving("a GET /api/v1/coach/memory request")
      .withRequest("GET", "/api/v1/coach/memory", (req) => {
        req.headers({ accept: "application/json" });
      })
      .willRespondWith(200, (res) => {
        res.headers({ "content-type": "application/json" });
        res.jsonBody({
          ok: true,
          memory: {
            weeklyDigests: [
              {
                weekKey: "2026-W19",
                weekRange: "2026-05-04..2026-05-10",
                generatedAt: "2026-05-11T08:00:00.000Z",
                finyk: { summary: "Spending under budget by 8%." },
                fizruk: { summary: "3 workouts done." },
                nutrition: { summary: "Protein on target." },
                routine: { summary: "Sleep 7h average." },
                overallRecommendations: [
                  "Keep weekly cardio under 4 sessions.",
                ],
              },
            ],
            lastInsightDate: "2026-05-12",
            lastInsightText: "Steady week — keep the momentum.",
          },
        });
      })
      .executeTest(async (mockServer) => {
        const http = createHttpClient({ baseUrl: mockServer.url });
        const coach = createCoachEndpoints(http);
        const out = (await coach.getMemory()) as {
          ok?: boolean;
          memory?: unknown;
        };
        // The api-client types declare `{ memory?: unknown }`; the
        // contract pins the *envelope* (ok=true) and the *root shape*
        // of the memory blob. Field-level invariants for the blob
        // interior are checked elsewhere (modules/chat/coach.test.ts).
        expect(out.ok).toBe(true);
        expect(out.memory).toBeDefined();
        const mem = out.memory as {
          weeklyDigests: Array<{ weekKey: string }>;
        };
        expect(mem.weeklyDigests).toHaveLength(1);
        expect(mem.weeklyDigests[0]!.weekKey).toBe("2026-W19");
      });
  });
});
