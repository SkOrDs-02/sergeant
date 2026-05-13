// @vitest-environment node
//
// Consumer contract: `GET /api/v1/mono/sync-state` — Monobank webhook
// connection state (status / webhookActive / lastEventAt /
// lastBackfillAt / accountsCount). Hot endpoint for the **finyk
// persona** — `useMonobankWebhook` polls it on every Finyk dashboard
// open + every reconnect attempt (see `apps/web/src/modules/finyk/`).
//
// Schema lives in `@sergeant/shared` (`MonoSyncStateSchema`). Drift on
// any field silently breaks the "Connect Monobank" gate (UI keeps
// rendering the form even when the row is `active`).

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { PactV4 } from "@pact-foundation/pact";

import { createHttpClient } from "../../httpClient";
import { createMonoWebhookEndpoints } from "../../endpoints/mono";
import { createPact } from "./_pact";

describe("contract @ GET /api/v1/mono/sync-state", () => {
  let pact: PactV4;
  beforeAll(() => {
    pact = createPact();
  });
  afterAll(() => {});

  it("returns MonoSyncState for a connected, active webhook (finyk persona)", async () => {
    await pact
      .addInteraction()
      .given(
        "an authenticated session for user-pact-001 with an active Monobank webhook (2 accounts)",
      )
      .uponReceiving("a GET /api/v1/mono/sync-state request")
      .withRequest("GET", "/api/v1/mono/sync-state", (req) => {
        req.headers({ accept: "application/json" });
      })
      .willRespondWith(200, (res) => {
        res.headers({ "content-type": "application/json" });
        res.jsonBody({
          status: "active",
          webhookActive: true,
          lastEventAt: "2026-05-13T08:30:00.000Z",
          lastBackfillAt: "2026-05-12T22:00:00.000Z",
          accountsCount: 2,
        });
      })
      .executeTest(async (mockServer) => {
        const http = createHttpClient({ baseUrl: mockServer.url });
        const mono = createMonoWebhookEndpoints(http);
        const state = await mono.syncState();
        expect(state.status).toBe("active");
        expect(state.webhookActive).toBe(true);
        expect(state.lastEventAt).toBe("2026-05-13T08:30:00.000Z");
        expect(state.lastBackfillAt).toBe("2026-05-12T22:00:00.000Z");
        expect(state.accountsCount).toBe(2);
      });
  });
});
