// @vitest-environment node
//
// Consumer contract: `GET /api/v1/mono/jars` — Monobank "банки" (jars).
// **finyk persona** — goal-progress auto-sync
// (docs/90-work/planning/specs/goal-progress-auto.md) reads a linked jar's
// `balance` to compute a goal's saved amount, and `goal` as the default
// target amount when creating a goal from a jar.
//
// Shape lives in `@sergeant/shared/schemas` (MonoJarDto). Drift here =
// silent money mis-display on the goal progress bar.

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { PactV4 } from "@pact-foundation/pact";

import { createHttpClient } from "../../httpClient";
import { createMonoWebhookEndpoints } from "../../endpoints/mono";
import { CONTRACT_SUITE_OPTIONS, createPact } from "./_pact";

describe("contract @ GET /api/v1/mono/jars", CONTRACT_SUITE_OPTIONS, () => {
  let pact: PactV4;
  beforeAll(() => {
    pact = createPact();
  });
  afterAll(() => {});

  it("returns the connected user's mono jars (finyk persona)", async () => {
    await pact
      .addInteraction()
      .given(
        "user-pact-001 has 1 connected mono jar with balance 50000 and goal 200000 (in minor units)",
      )
      .uponReceiving("a GET /api/v1/mono/jars request")
      .withRequest("GET", "/api/v1/mono/jars", (req) => {
        req.headers({ accept: "application/json" });
      })
      .willRespondWith(200, (res) => {
        res.headers({ "content-type": "application/json" });
        // Shape matches `MonoJarDtoSchema` in
        // `packages/shared/src/schemas/api.ts` — fields are the ones
        // `apps/server/src/lib/normalizers/mono.ts::normalizeMonoJar` emits
        // AFTER bigint coercion (Hard Rule #1).
        res.jsonBody([
          {
            userId: "user-pact-001",
            monoJarId: "jar-pact-001",
            sendId: "abc123",
            title: "На відпустку",
            description: "Мрія",
            currencyCode: 980,
            balance: 50000,
            goal: 200000,
            lastSeenAt: "2026-05-13T08:30:00.000Z",
          },
        ]);
      })
      .executeTest(async (mockServer) => {
        const http = createHttpClient({ baseUrl: mockServer.url });
        const mono = createMonoWebhookEndpoints(http);
        const jars = await mono.jars();
        expect(Array.isArray(jars)).toBe(true);
        expect(jars).toHaveLength(1);
        const jar = jars[0]!;
        expect(jar.monoJarId).toBe("jar-pact-001");
        expect(jar.userId).toBe("user-pact-001");
        // Hard-Rule #1 domain invariant: minor units returned as `number`,
        // not string.
        expect(typeof jar.balance).toBe("number");
        expect(jar.balance).toBe(50000);
        expect(typeof jar.goal).toBe("number");
        expect(jar.goal).toBe(200000);
        expect(jar.currencyCode).toBe(980);
      });
  });
});
