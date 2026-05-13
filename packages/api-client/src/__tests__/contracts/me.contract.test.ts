// @vitest-environment node
//
// Consumer contract: `GET /api/v1/me` — auth-protected "who am I"
// endpoint used by every persona's shell on app boot to resolve the
// active user.
//
// Why this contract: covers the simplest auth-protected READ shape and
// `MeResponseSchema` from `@sergeant/shared`. If this drifts, every
// surface (web, mobile, openclaw front-end if it ever grows one)
// breaks at app-start.

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { PactV4 } from "@pact-foundation/pact";

import { createHttpClient } from "../../httpClient";
import { createMeEndpoints } from "../../endpoints/me";
import { createPact } from "./_pact";

describe("contract @ GET /api/v1/me", () => {
  let pact: PactV4;
  beforeAll(() => {
    pact = createPact();
  });
  afterAll(() => {
    // PactV4.executeTest auto-writes the merged pact on each successful
    // interaction; nothing to do here. Hook kept for symmetry / future
    // teardown.
  });

  it("returns MeResponse for an authenticated session (hub/shell persona)", async () => {
    await pact
      .addInteraction()
      .given("an authenticated session for user-pact-001 exists")
      .uponReceiving("a GET /api/v1/me request")
      .withRequest("GET", "/api/v1/me", (req) => {
        req.headers({ accept: "application/json" });
      })
      .willRespondWith(200, (res) => {
        res.headers({ "content-type": "application/json" });
        res.jsonBody({
          user: {
            id: "user-pact-001",
            email: "pact-consumer@sergeant.test",
            name: "Pact Consumer",
            image: null,
            emailVerified: true,
            createdAt: "2026-01-15T08:30:00.000Z",
          },
        });
      })
      .executeTest(async (mockServer) => {
        const http = createHttpClient({ baseUrl: mockServer.url });
        const me = createMeEndpoints(http);
        const res = await me.get();
        expect(res.user.id).toBe("user-pact-001");
        expect(res.user.emailVerified).toBe(true);
        expect(res.user.createdAt).toBe("2026-01-15T08:30:00.000Z");
      });
  });
});
