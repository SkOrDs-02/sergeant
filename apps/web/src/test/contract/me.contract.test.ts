/**
 * Contract test for `GET /api/me` / `GET /api/v1/me`.
 *
 * **Goal:** prove that the canonical wire-shape fixtures in
 * `@sergeant/shared/contract-fixtures/me` are accepted by the
 * api-client consumer side **byte-for-byte**, so any future drift
 * between the schema (`MeResponseSchema`) and either the fixture or
 * the consumer's parser fails CI here — not in production.
 *
 * Closes diagnostic
 * [`docs/diagnostics/2026-05-03-web-deep-dive/04-security-observability-testing-devx.md`](../../../../../docs/diagnostics/2026-05-03-web-deep-dive/04-security-observability-testing-devx.md) §7.4
 * (web↔server contract gap).
 *
 * The matching producer-side test lives in
 * `apps/server/src/routes/me.contract.test.ts`. Together they form the
 * minimal viable contract for `/api/me`. New endpoints follow the same
 * 2-file pattern (consumer + producer over a shared fixture).
 */

import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";
import {
  meFixtures,
  meRawFixtures,
  assertMeFixturesValid,
  MeResponseSchema,
  type MeFixtureCase,
} from "@sergeant/shared";
import { createHttpClient } from "@sergeant/api-client";
import { createMeEndpoints } from "@sergeant/api-client";

const FIXTURE_NAMES: readonly MeFixtureCase[] = [
  "minimal",
  "full",
  "legacyNoCreatedAt",
  "unverified",
] as const;

function jsonResponse(body: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
    ...init,
  });
}

let originalFetch: typeof fetch;

beforeEach(() => {
  originalFetch = globalThis.fetch;
});

afterEach(() => {
  globalThis.fetch = originalFetch;
  vi.restoreAllMocks();
});

describe("contract: /api/me", () => {
  it("every named fixture parses through MeResponseSchema (sanity)", () => {
    // assertMeFixturesValid throws on the first fixture that no longer
    // matches the schema. Keep it cheap so this whole test file can be
    // a quick CI gate.
    expect(() => assertMeFixturesValid()).not.toThrow();
  });

  it.each(FIXTURE_NAMES)(
    "fixture %s round-trips through the api-client consumer",
    async (name) => {
      const fixture = meRawFixtures[name];

      // Mock the network so the api-client receives the canonical JSON
      // verbatim. If the schema gets stricter or the fixture loses a
      // required field, `MeResponseSchema.parse()` inside `me.get()`
      // throws a ZodError — and CI fails here, not in browser logs.
      const fetchMock = vi.fn(async () => jsonResponse(fixture));
      globalThis.fetch = fetchMock as unknown as typeof fetch;

      const http = createHttpClient({ baseUrl: "http://contract.test" });
      const me = createMeEndpoints(http);

      const result = await me.get();

      // Deep-equal: api-client must NOT silently strip unknown fields,
      // remap nullables, or coerce strings to numbers without explicit
      // schema support.
      expect(result).toEqual(meFixtures[name]);
      expect(fetchMock).toHaveBeenCalledOnce();
    },
  );

  it("rejects a payload missing a required field (drift detection)", async () => {
    // Drop `emailVerified` to simulate a server regression where the
    // serializer forgets a Hard Rule #3 update. The api-client must
    // refuse the response — masking it would silently drop the
    // verification banner in the UI.
    const broken = {
      user: {
        id: "user_broken_001",
        email: "broken@example.com",
        name: null,
        image: null,
        // emailVerified missing on purpose.
        createdAt: "2026-01-01T00:00:00.000Z",
      },
    };
    globalThis.fetch = vi.fn(
      async () => jsonResponse(broken),
    ) as unknown as typeof fetch;

    const http = createHttpClient({ baseUrl: "http://contract.test" });
    const me = createMeEndpoints(http);

    await expect(me.get()).rejects.toThrow();
  });

  it("`MeResponseSchema` accepts every fixture as `unknown` JSON", () => {
    // This is the producer-side guarantee mirrored on the consumer:
    // the same schema accepts the same fixtures from both directions.
    for (const name of FIXTURE_NAMES) {
      const parsed = MeResponseSchema.parse(meRawFixtures[name]);
      expect(parsed).toEqual(meFixtures[name]);
    }
  });
});
