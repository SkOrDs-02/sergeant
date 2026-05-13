// @vitest-environment node
//
// Consumer contract: `POST /api/v1/chat` (non-streaming) — **hub
// persona** HubChat conversational interface. Body is a Claude-style
// `{ context, messages, tool_results?, tool_calls_raw?, stream? }`,
// response is `{ text?, tool_calls?, … }` (see `ChatResponse` in
// `packages/api-client/src/endpoints/chat.ts`).
//
// We only contract the non-streaming variant here. Streaming uses
// `res.body` as SSE which Pact JSON cannot express; the streaming
// adapter has its own integration test in `apps/web`. The non-streaming
// `send()` path is what HubChat falls back to when SSE is blocked
// (corporate proxies, mobile cellular shaping).

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { PactV4 } from "@pact-foundation/pact";

import { createHttpClient } from "../../httpClient";
import { createChatEndpoints } from "../../endpoints/chat";
import { createPact } from "./_pact";

describe("contract @ POST /api/v1/chat (non-streaming)", () => {
  let pact: PactV4;
  beforeAll(() => {
    pact = createPact();
  });
  afterAll(() => {});

  it("returns assistant text for a simple user prompt (hub persona)", async () => {
    await pact
      .addInteraction()
      .given(
        "authenticated user-pact-001 with a clean conversation; Anthropic stub returns fixed assistant text",
      )
      .uponReceiving(
        "a POST /api/v1/chat request without tool-calls (non-streaming)",
      )
      .withRequest("POST", "/api/v1/chat", (req) => {
        req.headers({
          accept: "application/json",
          "content-type": "application/json",
        });
        req.jsonBody({
          context: "hub",
          messages: [{ role: "user", content: "Привіт, як справи?" }],
          stream: false,
        });
      })
      .willRespondWith(200, (res) => {
        res.headers({ "content-type": "application/json" });
        res.jsonBody({
          text: "Все ок, що треба зробити?",
        });
      })
      .executeTest(async (mockServer) => {
        const http = createHttpClient({ baseUrl: mockServer.url });
        const chat = createChatEndpoints(http);
        const out = await chat.send({
          context: "hub",
          messages: [{ role: "user", content: "Привіт, як справи?" }],
          stream: false,
        });
        expect(out.text).toBe("Все ок, що треба зробити?");
        expect(out.tool_calls).toBeUndefined();
        expect(out.error).toBeUndefined();
      });
  });
});
