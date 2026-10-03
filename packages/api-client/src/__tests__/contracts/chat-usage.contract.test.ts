// @vitest-environment node
//
// Consumer contract: `GET /api/v1/chat/usage` (PR-42 chat counter) — the
// Free-tier daily AI-chat quota surfaced by `ChatUsageCounter.tsx` in
// `HubChatHeader`. Body is `{ plan, limit, remaining }`
// (`ChatUsageResponseSchema` in `@sergeant/shared`); `limit`/`remaining` are
// `null` for Pro (unlimited).

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { PactV4 } from "@pact-foundation/pact";

import { createHttpClient } from "../../httpClient";
import { createChatEndpoints } from "../../endpoints/chat";
import { CONTRACT_SUITE_OPTIONS, createPact } from "./_pact";

describe("contract @ GET /api/v1/chat/usage", CONTRACT_SUITE_OPTIONS, () => {
  let pact: PactV4;
  beforeAll(() => {
    pact = createPact();
  });
  afterAll(() => {});

  it("returns the Free-tier daily counter for an authenticated user", async () => {
    await pact
      .addInteraction()
      .given(
        "authenticated Free-plan user-pact-001 has sent 3 of 5 daily AI messages",
      )
      .uponReceiving("a GET /api/v1/chat/usage request")
      .withRequest("GET", "/api/v1/chat/usage", (req) => {
        req.headers({ accept: "application/json" });
      })
      .willRespondWith(200, (res) => {
        res.headers({ "content-type": "application/json" });
        res.jsonBody({
          plan: "free",
          limit: 5,
          remaining: 2,
        });
      })
      .executeTest(async (mockServer) => {
        const http = createHttpClient({ baseUrl: mockServer.url });
        const chat = createChatEndpoints(http);
        const out = await chat.usage();
        expect(out.plan).toBe("free");
        expect(out.limit).toBe(5);
        expect(out.remaining).toBe(2);
      });
  });

  it("returns null limit/remaining for an unlimited Pro plan", async () => {
    await pact
      .addInteraction()
      .given("authenticated Pro-plan user-pact-002 exists")
      .uponReceiving("a GET /api/v1/chat/usage request (Pro plan)")
      .withRequest("GET", "/api/v1/chat/usage", (req) => {
        req.headers({ accept: "application/json" });
      })
      .willRespondWith(200, (res) => {
        res.headers({ "content-type": "application/json" });
        res.jsonBody({
          plan: "pro",
          limit: null,
          remaining: null,
        });
      })
      .executeTest(async (mockServer) => {
        const http = createHttpClient({ baseUrl: mockServer.url });
        const chat = createChatEndpoints(http);
        const out = await chat.usage();
        expect(out.plan).toBe("pro");
        expect(out.limit).toBeNull();
        expect(out.remaining).toBeNull();
      });
  });
});
