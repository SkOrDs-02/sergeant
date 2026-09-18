// @vitest-environment node
//
// Consumer contract: `/api/v1/billing/*` — Stripe/LiqPay/Plata checkout +
// subscription-status + customer-portal + cancel + enabled-providers
// (ADR-0068, reverse-trial UA billing). No persona is exclusive here — every
// surface that renders `/pricing` or `/settings#billing` depends on this
// shape.
//
// Why this contract: before this file `billing`/`privat`/`finyk` were the
// three endpoint modules with zero Pact coverage (audit: 9/17 covered).
// `billing` carries no bigint/minor-units fields directly, but
// `BillingStatusResponse.subscription.id` is a nullable integer — the same
// "coerced-or-leaked" shape class Hard Rule #1 guards for money fields, so
// we assert its `typeof` the same way.
//
// Schemas live in `@sergeant/shared` (`BillingCheckoutResponseSchema`,
// `BillingStatusResponseSchema`, `BillingPortalResponseSchema`,
// `BillingCancelResponseSchema`, `BillingProvidersResponseSchema`) and are
// re-exported verbatim by `packages/api-client/src/endpoints/billing.ts`
// (`BillingCheckoutResponseBodySchema`, etc.) — no hand-redeclared shapes.
// Server serializers verified read-only against `apps/server/src/routes/billing.ts`.

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { PactV4 } from "@pact-foundation/pact";

import { createHttpClient } from "../../httpClient";
import { createBillingEndpoints } from "../../endpoints/billing";
import { CONTRACT_SUITE_OPTIONS, createPact } from "./_pact";

describe(
  "contract @ POST /api/v1/billing/checkout",
  CONTRACT_SUITE_OPTIONS,
  () => {
    let pact: PactV4;
    beforeAll(() => {
      pact = createPact();
    });
    afterAll(() => {});

    it("creates a LiqPay checkout session for the pro plan", async () => {
      await pact
        .addInteraction()
        .given(
          "authenticated user-pact-001 in UA with liqpay enabled; no existing subscription",
        )
        .uponReceiving(
          "a POST /api/v1/billing/checkout request (plan=pro, provider=liqpay)",
        )
        .withRequest("POST", "/api/v1/billing/checkout", (req) => {
          req.headers({
            accept: "application/json",
            "content-type": "application/json",
          });
          req.jsonBody({ plan: "pro", provider: "liqpay" });
        })
        .willRespondWith(200, (res) => {
          res.headers({ "content-type": "application/json" });
          res.jsonBody({
            ok: true,
            mode: "live",
            sessionId: "cs_pact_liqpay_001",
            url: "https://www.liqpay.ua/checkout/cs_pact_liqpay_001",
          });
        })
        .executeTest(async (mockServer) => {
          const http = createHttpClient({ baseUrl: mockServer.url });
          const billing = createBillingEndpoints(http);
          const out = await billing.createCheckout({
            plan: "pro",
            provider: "liqpay",
          });
          expect(out.ok).toBe(true);
          expect(out.mode).toBe("live");
          expect(out.sessionId).toBe("cs_pact_liqpay_001");
          expect(typeof out.sessionId).toBe("string");
          expect(out.url).toBe(
            "https://www.liqpay.ua/checkout/cs_pact_liqpay_001",
          );
        });
    });
  },
);

describe(
  "contract @ GET /api/v1/billing/status",
  CONTRACT_SUITE_OPTIONS,
  () => {
    let pact: PactV4;
    beforeAll(() => {
      pact = createPact();
    });
    afterAll(() => {});

    it("returns an active pro subscription", async () => {
      await pact
        .addInteraction()
        .given("user-pact-001 has an active pro subscription via liqpay")
        .uponReceiving("a GET /api/v1/billing/status request (active pro)")
        .withRequest("GET", "/api/v1/billing/status", (req) => {
          req.headers({ accept: "application/json" });
        })
        .willRespondWith(200, (res) => {
          res.headers({ "content-type": "application/json" });
          res.jsonBody({
            subscription: {
              id: 42,
              provider: "liqpay",
              plan: "pro",
              status: "active",
              active: true,
              currentPeriodEnd: "2026-06-20T00:00:00.000Z",
            },
          });
        })
        .executeTest(async (mockServer) => {
          const http = createHttpClient({ baseUrl: mockServer.url });
          const billing = createBillingEndpoints(http);
          const out = await billing.status();
          expect(out.subscription.active).toBe(true);
          expect(out.subscription.plan).toBe("pro");
          // `id` is a nullable integer, not a bigint-string — same class of
          // leak Hard Rule #1 guards for money fields.
          expect(typeof out.subscription.id).toBe("number");
          expect(out.subscription.id).toBe(42);
        });
    });

    it("returns a null subscription when the user has no billing history", async () => {
      await pact
        .addInteraction()
        .given("user-pact-002 has never subscribed")
        .uponReceiving("a GET /api/v1/billing/status request (no subscription)")
        .withRequest("GET", "/api/v1/billing/status", (req) => {
          req.headers({ accept: "application/json" });
        })
        .willRespondWith(200, (res) => {
          res.headers({ "content-type": "application/json" });
          res.jsonBody({
            subscription: {
              id: null,
              provider: null,
              plan: null,
              status: null,
              active: false,
              currentPeriodEnd: null,
            },
          });
        })
        .executeTest(async (mockServer) => {
          const http = createHttpClient({ baseUrl: mockServer.url });
          const billing = createBillingEndpoints(http);
          const out = await billing.status();
          expect(out.subscription.active).toBe(false);
          expect(out.subscription.id).toBeNull();
          expect(out.subscription.plan).toBeNull();
        });
    });
  },
);

describe(
  "contract @ POST /api/v1/billing/portal",
  CONTRACT_SUITE_OPTIONS,
  () => {
    let pact: PactV4;
    beforeAll(() => {
      pact = createPact();
    });
    afterAll(() => {});

    it("creates a customer-portal session for an active subscriber", async () => {
      await pact
        .addInteraction()
        .given("user-pact-001 has an active liqpay subscription")
        .uponReceiving("a POST /api/v1/billing/portal request (no body)")
        .withRequest("POST", "/api/v1/billing/portal", (req) => {
          req.headers({ accept: "application/json" });
        })
        .willRespondWith(200, (res) => {
          res.headers({ "content-type": "application/json" });
          res.jsonBody({
            ok: true,
            url: "https://sergeant.app/settings?billing=manage",
          });
        })
        .executeTest(async (mockServer) => {
          const http = createHttpClient({ baseUrl: mockServer.url });
          const billing = createBillingEndpoints(http);
          const out = await billing.createPortal();
          expect(out.ok).toBe(true);
          expect(out.url).toBe("https://sergeant.app/settings?billing=manage");
        });
    });
  },
);

describe(
  "contract @ POST /api/v1/billing/cancel",
  CONTRACT_SUITE_OPTIONS,
  () => {
    let pact: PactV4;
    beforeAll(() => {
      pact = createPact();
    });
    afterAll(() => {});

    it("cancels the active subscription (best-effort across providers)", async () => {
      await pact
        .addInteraction()
        .given("user-pact-001 has an active liqpay subscription")
        .uponReceiving("a POST /api/v1/billing/cancel request (no body)")
        .withRequest("POST", "/api/v1/billing/cancel", (req) => {
          req.headers({ accept: "application/json" });
        })
        .willRespondWith(200, (res) => {
          res.headers({ "content-type": "application/json" });
          res.jsonBody({ ok: true });
        })
        .executeTest(async (mockServer) => {
          const http = createHttpClient({ baseUrl: mockServer.url });
          const billing = createBillingEndpoints(http);
          const out = await billing.cancel();
          expect(out).toEqual({ ok: true });
        });
    });
  },
);

describe(
  "contract @ GET /api/v1/billing/providers",
  CONTRACT_SUITE_OPTIONS,
  () => {
    let pact: PactV4;
    beforeAll(() => {
      pact = createPact();
    });
    afterAll(() => {});

    it("returns the enabled providers for a UA-geo user", async () => {
      await pact
        .addInteraction()
        .given("user-pact-001 resolves to country=UA")
        .uponReceiving("a GET /api/v1/billing/providers request")
        .withRequest("GET", "/api/v1/billing/providers", (req) => {
          req.headers({ accept: "application/json" });
        })
        .willRespondWith(200, (res) => {
          res.headers({ "content-type": "application/json" });
          res.jsonBody({ providers: ["liqpay", "plata"] });
        })
        .executeTest(async (mockServer) => {
          const http = createHttpClient({ baseUrl: mockServer.url });
          const billing = createBillingEndpoints(http);
          const out = await billing.providers();
          expect(out.providers).toEqual(["liqpay", "plata"]);
        });
    });
  },
);
