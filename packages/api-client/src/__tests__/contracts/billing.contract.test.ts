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

import { isApiError } from "../../ApiError";
import { createHttpClient } from "../../httpClient";
import { createBillingEndpoints } from "../../endpoints/billing";
import { CONTRACT_SUITE_OPTIONS, createPact } from "./_pact";

// Знімок доступу (`docs/work/specs/access-tiers.md`): сервер віддає стан,
// відкриті фічі реєстру і тижневі лічильники, web нічого не виводить сам.
function accessSnapshot(state: "free" | "pro") {
  const limit = (n: number) => (state === "free" ? n : null);
  const resetsAt = "2026-06-14T21:00:00.000Z";
  return {
    state,
    trialEndsAt: null,
    graceEndsAt: null,
    features: {
      "ai.actions": true,
      "ai.photo": true,
      "export.pdf": state !== "free",
      "nutrition.weekPlan": state !== "free",
      "bank.monoSync": true,
    },
    meters: {
      aiActions: { used: 3, limit: limit(20), resetsAt },
      aiPhoto: { used: 1, limit: limit(3), resetsAt },
      finykVision: { used: 0, limit: limit(5), resetsAt },
    },
  };
}

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
              cancelAtPeriodEnd: false,
            },
            access: accessSnapshot("pro"),
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
          expect(out.subscription.cancelAtPeriodEnd).toBe(false);
          expect(out.access.state).toBe("pro");
          expect(out.access.meters.aiActions.limit).toBeNull();
        });
    });

    // «Скасувати Premium» лишало рядок `active`, а `cancel_at_period_end`
    // у відповідь не потрапляв, тож UI не відрізняв «діє» від «скасовано,
    // діє до кінця періоду».
    it("returns an active subscription that is scheduled to cancel at period end", async () => {
      await pact
        .addInteraction()
        .given(
          "user-pact-001 has an active liqpay subscription with cancel_at_period_end",
        )
        .uponReceiving(
          "a GET /api/v1/billing/status request (cancel scheduled)",
        )
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
              cancelAtPeriodEnd: true,
            },
            access: accessSnapshot("pro"),
          });
        })
        .executeTest(async (mockServer) => {
          const http = createHttpClient({ baseUrl: mockServer.url });
          const billing = createBillingEndpoints(http);
          const out = await billing.status();
          // Статус лишається `active`: саме тому прапорець окремий.
          expect(out.subscription.status).toBe("active");
          expect(out.subscription.cancelAtPeriodEnd).toBe(true);
          expect(out.subscription.currentPeriodEnd).toBe(
            "2026-06-20T00:00:00.000Z",
          );
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
              cancelAtPeriodEnd: false,
            },
            access: accessSnapshot("free"),
          });
        })
        .executeTest(async (mockServer) => {
          const http = createHttpClient({ baseUrl: mockServer.url });
          const billing = createBillingEndpoints(http);
          const out = await billing.status();
          expect(out.subscription.active).toBe(false);
          expect(out.subscription.id).toBeNull();
          expect(out.subscription.plan).toBeNull();
          expect(out.access.state).toBe("free");
          expect(out.access.features["export.pdf"]).toBe(false);
          expect(out.access.meters.aiActions).toEqual({
            used: 3,
            limit: 20,
            resetsAt: "2026-06-14T21:00:00.000Z",
          });
          expect(typeof out.access.meters.aiPhoto.used).toBe("number");
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

    // Раніше роут віддавав `{ok:true}` завжди, тож «нічого скасовувати»
    // (founder, `provider='manual'`, немає підписки) виглядало як успіх.
    it("rejects with 409 NO_ACTIVE_SUBSCRIPTION when there is nothing to cancel", async () => {
      await pact
        .addInteraction()
        .given("user-pact-003 has a manual grant and no provider subscription")
        .uponReceiving(
          "a POST /api/v1/billing/cancel request (nothing to cancel)",
        )
        .withRequest("POST", "/api/v1/billing/cancel", (req) => {
          req.headers({ accept: "application/json" });
        })
        .willRespondWith(409, (res) => {
          res.headers({ "content-type": "application/json" });
          res.jsonBody({
            error: "No active subscription to cancel",
            code: "NO_ACTIVE_SUBSCRIPTION",
          });
        })
        .executeTest(async (mockServer) => {
          const http = createHttpClient({ baseUrl: mockServer.url });
          const billing = createBillingEndpoints(http);

          let caught: unknown;
          try {
            await billing.cancel();
          } catch (err) {
            caught = err;
          }

          expect(isApiError(caught)).toBe(true);
          if (!isApiError(caught)) return;
          expect(caught.status).toBe(409);
          expect(caught.serverMessage).toBe("No active subscription to cancel");
          expect(caught.body).toMatchObject({ code: "NO_ACTIVE_SUBSCRIPTION" });
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
