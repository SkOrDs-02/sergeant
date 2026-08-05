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
//
// Also covers two Stage-2 (pre-beta schema-debt audit) additions, both
// re-exported verbatim from `@sergeant/shared` per Hard Rule #3:
//
//   - `GET/PATCH /api/v1/me/preferences` — new `healthDataConsent` field
//     (GDPR Art. 9 explicit consent, migration 111). Default `false`.
//   - `GET/PUT /api/v1/me/profile` — write-through profile/biometrics blob
//     (migration 115, NOT oplog-sync). "Defaults, not 404":
//     `{ profile: {}, updatedAt: null }` for a brand-new user.

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { PactV4 } from "@pact-foundation/pact";

import { createHttpClient } from "../../httpClient";
import { createMeEndpoints } from "../../endpoints/me";
import { CONTRACT_SUITE_OPTIONS, createPact } from "./_pact";

describe("contract @ GET /api/v1/me", CONTRACT_SUITE_OPTIONS, () => {
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

describe(
  "contract @ GET /api/v1/me/preferences",
  CONTRACT_SUITE_OPTIONS,
  () => {
    let pact: PactV4;
    beforeAll(() => {
      pact = createPact();
    });
    afterAll(() => {});

    it("includes healthDataConsent for a user who has explicitly consented", async () => {
      await pact
        .addInteraction()
        .given(
          "user-pact-001 has opted into health-adjacent data processing (GDPR Art. 9)",
        )
        .uponReceiving("a GET /api/v1/me/preferences request (consented)")
        .withRequest("GET", "/api/v1/me/preferences", (req) => {
          req.headers({ accept: "application/json" });
        })
        .willRespondWith(200, (res) => {
          res.headers({ "content-type": "application/json" });
          res.jsonBody({
            analytics: false,
            aiMemory: true,
            pushNotifications: true,
            sergeantNudges: false,
            healthDataConsent: true,
            updatedAt: "2026-08-01T12:00:00.000Z",
          });
        })
        .executeTest(async (mockServer) => {
          const http = createHttpClient({ baseUrl: mockServer.url });
          const me = createMeEndpoints(http);
          const out = await me.getPreferences();
          expect(out.healthDataConsent).toBe(true);
          expect(typeof out.healthDataConsent).toBe("boolean");
        });
    });

    it("defaults healthDataConsent to false when a pre-migration server omits the field", async () => {
      // Rolling-deploy window (web on Vercel, server on Coolify): an old
      // server response is missing the field entirely. The client's
      // `.default(false)` must fill it in rather than throw ZodError, same
      // "defaults, not 404" guarantee as `sergeantNudges`.
      await pact
        .addInteraction()
        .given("user-pact-002 predates the healthDataConsent column")
        .uponReceiving(
          "a GET /api/v1/me/preferences request (legacy server, no healthDataConsent field)",
        )
        .withRequest("GET", "/api/v1/me/preferences", (req) => {
          req.headers({ accept: "application/json" });
        })
        .willRespondWith(200, (res) => {
          res.headers({ "content-type": "application/json" });
          res.jsonBody({
            analytics: true,
            aiMemory: false,
            pushNotifications: false,
            sergeantNudges: true,
            updatedAt: null,
          });
        })
        .executeTest(async (mockServer) => {
          const http = createHttpClient({ baseUrl: mockServer.url });
          const me = createMeEndpoints(http);
          const out = await me.getPreferences();
          expect(out.healthDataConsent).toBe(false);
        });
    });
  },
);

describe(
  "contract @ GET/PUT /api/v1/me/profile",
  CONTRACT_SUITE_OPTIONS,
  () => {
    let pact: PactV4;
    beforeAll(() => {
      pact = createPact();
    });
    afterAll(() => {});

    it("returns the default { profile: {}, updatedAt: null } for a brand-new user", async () => {
      await pact
        .addInteraction()
        .given("user-pact-003 has no user_profile row yet")
        .uponReceiving("a GET /api/v1/me/profile request (new user, no row)")
        .withRequest("GET", "/api/v1/me/profile", (req) => {
          req.headers({ accept: "application/json" });
        })
        .willRespondWith(200, (res) => {
          res.headers({ "content-type": "application/json" });
          res.jsonBody({ profile: {}, updatedAt: null });
        })
        .executeTest(async (mockServer) => {
          const http = createHttpClient({ baseUrl: mockServer.url });
          const me = createMeEndpoints(http);
          const out = await me.getProfile();
          expect(out).toEqual({ profile: {}, updatedAt: null });
          expect(out.updatedAt).toBeNull();
        });
    });

    it("PUT roundtrips the profile payload and returns a fresh updatedAt", async () => {
      const storedProfile = { heightCm: 170, weightKg: 62, sex: "f" };
      await pact
        .addInteraction()
        .given("user-pact-003 authenticated session")
        .uponReceiving(
          "a PUT /api/v1/me/profile request with a small biometrics payload",
        )
        .withRequest("PUT", "/api/v1/me/profile", (req) => {
          req.headers({
            accept: "application/json",
            "content-type": "application/json",
          });
          req.jsonBody({ profile: storedProfile });
        })
        .willRespondWith(200, (res) => {
          res.headers({ "content-type": "application/json" });
          res.jsonBody({
            profile: storedProfile,
            updatedAt: "2026-08-01T12:05:00.000Z",
          });
        })
        .executeTest(async (mockServer) => {
          const http = createHttpClient({ baseUrl: mockServer.url });
          const me = createMeEndpoints(http);
          const out = await me.updateProfile(storedProfile);
          expect(out.profile).toEqual(storedProfile);
          // `updatedAt` must be a real ISO string, not null/undefined, once a
          // row has been written — mirrors the "defaults, not 404" contract
          // in the opposite direction (row now exists).
          expect(typeof out.updatedAt).toBe("string");
          expect(out.updatedAt).toBe("2026-08-01T12:05:00.000Z");
        });
    });
  },
);
