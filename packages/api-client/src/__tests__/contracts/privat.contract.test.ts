// @vitest-environment node
//
// Consumer contract: `/api/v1/privat/*` — Privatbank corporate-API proxy
// (finyk persona, alternate to the Monobank webhook flow). Credentials are
// resolved server-side from `privat_connection` by session
// (`docs/90-work/planning/specs/beta-security-readiness.md`, F1) — no
// merchant token ever crosses the wire from the client after `connect`.
//
// Why this contract: `privat` had zero Pact coverage before this file
// (audit: 9/17 endpoint modules covered). Unlike `mono`, PrivatBank's own
// upstream API returns every numeric field as a **string** (documented in
// `packages/api-client/src/endpoints/privat.ts`) — this is a deliberate
// pass-through, not a Hard Rule #1 bigint-coercion bug, so this contract
// asserts `typeof === "string"` for those fields to lock the intentional
// shape (a future "helpful" server-side `Number()` coercion would silently
// change every currency-formatting callsite's assumptions).
//
// Types live in `packages/api-client/src/endpoints/privat.ts`
// (`PrivatConnectionStatus`, `PrivatBalanceFinalResponse`,
// `PrivatBalanceRecord`). Server handlers verified read-only against
// `apps/server/src/modules/mono/privatConnection.ts` and
// `apps/server/src/modules/mono/privat.ts`.

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { PactV4 } from "@pact-foundation/pact";

import { createHttpClient } from "../../httpClient";
import { createPrivatEndpoints } from "../../endpoints/privat";
import { CONTRACT_SUITE_OPTIONS, createPact } from "./_pact";

describe(
  "contract @ POST /api/v1/privat/connect",
  CONTRACT_SUITE_OPTIONS,
  () => {
    let pact: PactV4;
    beforeAll(() => {
      pact = createPact();
    });
    afterAll(() => {});

    it("validates + persists PrivatBank credentials for user-pact-001", async () => {
      await pact
        .addInteraction()
        .given(
          "authenticated user-pact-001 with no prior PrivatBank connection; upstream credential probe succeeds",
        )
        .uponReceiving("a POST /api/v1/privat/connect request")
        .withRequest("POST", "/api/v1/privat/connect", (req) => {
          req.headers({
            accept: "application/json",
            "content-type": "application/json",
          });
          req.jsonBody({
            merchantId: "pact-merchant-001",
            token: "pact-fake-token-not-a-real-cred",
          });
        })
        .willRespondWith(200, (res) => {
          res.headers({ "content-type": "application/json" });
          res.jsonBody({ connected: true, merchantId: "pact-merchant-001" });
        })
        .executeTest(async (mockServer) => {
          const http = createHttpClient({ baseUrl: mockServer.url });
          const privat = createPrivatEndpoints(http);
          const out = await privat.connect({
            merchantId: "pact-merchant-001",
            token: "pact-fake-token-not-a-real-cred",
          });
          expect(out.connected).toBe(true);
          expect(out.merchantId).toBe("pact-merchant-001");
        });
    });
  },
);

describe(
  "contract @ POST /api/v1/privat/disconnect",
  CONTRACT_SUITE_OPTIONS,
  () => {
    let pact: PactV4;
    beforeAll(() => {
      pact = createPact();
    });
    afterAll(() => {});

    it("wipes the stored PrivatBank credentials for user-pact-001", async () => {
      await pact
        .addInteraction()
        .given(
          "authenticated user-pact-001 with an active PrivatBank connection",
        )
        .uponReceiving("a POST /api/v1/privat/disconnect request (no body)")
        .withRequest("POST", "/api/v1/privat/disconnect", (req) => {
          req.headers({ accept: "application/json" });
        })
        .willRespondWith(200, (res) => {
          res.headers({ "content-type": "application/json" });
          res.jsonBody({ connected: false });
        })
        .executeTest(async (mockServer) => {
          const http = createHttpClient({ baseUrl: mockServer.url });
          const privat = createPrivatEndpoints(http);
          const out = await privat.disconnect();
          expect(out).toEqual({ connected: false });
        });
    });
  },
);

describe("contract @ GET /api/v1/privat/status", CONTRACT_SUITE_OPTIONS, () => {
  let pact: PactV4;
  beforeAll(() => {
    pact = createPact();
  });
  afterAll(() => {});

  it("returns connected=true with the stored merchantId", async () => {
    await pact
      .addInteraction()
      .given("authenticated user-pact-001 with an active PrivatBank connection")
      .uponReceiving("a GET /api/v1/privat/status request (connected)")
      .withRequest("GET", "/api/v1/privat/status", (req) => {
        req.headers({ accept: "application/json" });
      })
      .willRespondWith(200, (res) => {
        res.headers({ "content-type": "application/json" });
        res.jsonBody({ connected: true, merchantId: "pact-merchant-001" });
      })
      .executeTest(async (mockServer) => {
        const http = createHttpClient({ baseUrl: mockServer.url });
        const privat = createPrivatEndpoints(http);
        const out = await privat.status();
        expect(out.connected).toBe(true);
        expect(out.merchantId).toBe("pact-merchant-001");
      });
  });

  it("returns connected=false with a null merchantId when never connected", async () => {
    await pact
      .addInteraction()
      .given("authenticated user-pact-002 with no PrivatBank connection")
      .uponReceiving("a GET /api/v1/privat/status request (not connected)")
      .withRequest("GET", "/api/v1/privat/status", (req) => {
        req.headers({ accept: "application/json" });
      })
      .willRespondWith(200, (res) => {
        res.headers({ "content-type": "application/json" });
        res.jsonBody({ connected: false, merchantId: null });
      })
      .executeTest(async (mockServer) => {
        const http = createHttpClient({ baseUrl: mockServer.url });
        const privat = createPrivatEndpoints(http);
        const out = await privat.status();
        expect(out.connected).toBe(false);
        expect(out.merchantId).toBeNull();
      });
  });
});

describe("contract @ GET /api/v1/privat", CONTRACT_SUITE_OPTIONS, () => {
  let pact: PactV4;
  beforeAll(() => {
    pact = createPact();
  });
  afterAll(() => {});

  it("proxies statements/balance/final and returns PrivatBank's string-typed balances (balanceFinal helper)", async () => {
    await pact
      .addInteraction()
      .given(
        "authenticated user-pact-001 with a valid PrivatBank connection; upstream balance/final returns 1 account",
      )
      .uponReceiving(
        "a GET /api/v1/privat?path=/statements/balance/final request",
      )
      .withRequest("GET", "/api/v1/privat", (req) => {
        req.headers({ accept: "application/json" });
        req.query({
          path: "/statements/balance/final",
          country: "UA",
          showRest: "true",
        });
      })
      .willRespondWith(200, (res) => {
        res.headers({ "content-type": "application/json" });
        res.jsonBody({
          status: "SUCCESS",
          balances: [
            {
              acc: "UA213996220000026007233566001",
              currency: "980",
              balanceOut: "12345.67",
              balanceOutEq: "12345.67",
              nameACC: "Пласт. картка",
            },
          ],
          exist_next_page: false,
        });
      })
      .executeTest(async (mockServer) => {
        const http = createHttpClient({ baseUrl: mockServer.url });
        const privat = createPrivatEndpoints(http);
        const out = await privat.balanceFinal();
        expect(out.status).toBe("SUCCESS");
        expect(out.balances).toHaveLength(1);
        const acc = out.balances![0]!;
        expect(acc.acc).toBe("UA213996220000026007233566001");
        // PrivatBank's own API returns numeric fields as strings — this is
        // a documented pass-through (see `endpoints/privat.ts`), not a
        // Hard Rule #1 bigint leak. Locking `typeof === "string"` here
        // means a future server-side `Number()` "fix" would fail loudly
        // instead of silently changing every currency-formatting callsite.
        expect(typeof acc.balanceOut).toBe("string");
        expect(acc.balanceOut).toBe("12345.67");
        expect(out.exist_next_page).toBe(false);
      });
  });
});
