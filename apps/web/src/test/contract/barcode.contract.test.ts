/**
 * Contract test for `GET /api/barcode?barcode=…` /
 * `GET /api/v1/barcode?barcode=…`.
 *
 * **Goal:** lock down the wire shape for the barcode-lookup endpoint
 * between the producer (`apps/server/src/modules/nutrition/barcode.ts`)
 * and the consumer (`packages/api-client/src/endpoints/barcode.ts`) so
 * AGENTS.md Hard Rule #3 (server response shape ↔ api-client types ↔
 * test) fails CI on drift instead of silently breaking the scanner UI.
 *
 * Mirrors the structure of `me.contract.test.ts`. Together they exhaust
 * two of the four envelopes in `packages/shared/src/schemas/nutrition.ts`
 * (success + error); the remaining `/api/food-search` and
 * `/api/parse-pantry` endpoints follow the same pattern — track in
 * PR-T30 of `docs/testing/2026-05-05-tests-pr-plan.md`.
 *
 * Closes contract slice PR-T29 (web `/api/barcode` consumer contract).
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  assertBarcodeFixturesValid,
  barcodeErrorFixtures,
  barcodeErrorRawFixtures,
  barcodeSuccessFixtures,
  barcodeSuccessRawFixtures,
  BarcodeLookupErrorSchema,
  BarcodeLookupResponseSchema,
  BarcodeLookupSuccessSchema,
  type BarcodeErrorFixtureCase,
  type BarcodeSuccessFixtureCase,
} from "@sergeant/shared";
import { createBarcodeEndpoints, createHttpClient } from "@sergeant/api-client";

const SUCCESS_NAMES: readonly BarcodeSuccessFixtureCase[] = [
  "offFull",
  "usdaBranded",
  "upcitemdbPartial",
  "nullableMacros",
] as const;

const ERROR_NAMES: readonly BarcodeErrorFixtureCase[] = [
  "notFound",
  "badRequest",
  "upstreamTimeout",
] as const;

const ERROR_STATUS: Record<BarcodeErrorFixtureCase, number> = {
  notFound: 404,
  badRequest: 400,
  upstreamTimeout: 504,
};

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

describe("contract: /api/barcode", () => {
  it("every named fixture parses through its schema (sanity)", () => {
    expect(() => assertBarcodeFixturesValid()).not.toThrow();
  });

  it.each(SUCCESS_NAMES)(
    "success fixture %s round-trips through the api-client consumer",
    async (name) => {
      const fixture = barcodeSuccessRawFixtures[name];
      const fetchMock = vi.fn(
        async (
          _input: RequestInfo | URL,
          _init?: RequestInit,
        ): Promise<Response> => jsonResponse(fixture),
      );
      globalThis.fetch = fetchMock as unknown as typeof fetch;

      const http = createHttpClient({ baseUrl: "http://contract.test" });
      const barcode = createBarcodeEndpoints(http);

      const result = await barcode.lookup("0000000000017");

      expect(result).toEqual(barcodeSuccessFixtures[name]);
      expect(fetchMock).toHaveBeenCalledOnce();
      const [requested] = fetchMock.mock.calls[0] ?? [undefined];
      let url = "";
      if (typeof requested === "string") {
        url = requested;
      } else if (requested instanceof URL) {
        url = requested.toString();
      } else if (
        requested &&
        typeof (requested as { url?: unknown }).url === "string"
      ) {
        url = (requested as { url: string }).url;
      }
      expect(url).toContain("/api/v1/barcode");
      expect(url).toContain("barcode=0000000000017");
    },
  );

  it.each(ERROR_NAMES)(
    "error fixture %s round-trips through the api-client consumer",
    async (name) => {
      const fixture = barcodeErrorRawFixtures[name];
      const status = ERROR_STATUS[name];
      const fetchMock = vi.fn(async () => jsonResponse(fixture, { status }));
      globalThis.fetch = fetchMock as unknown as typeof fetch;

      const http = createHttpClient({ baseUrl: "http://contract.test" });
      const barcode = createBarcodeEndpoints(http);

      // Non-2xx responses throw `ApiError` with `serverMessage` preserved
      // verbatim. The api-client must surface the error envelope without
      // silently swallowing it — the scanner UI relies on the message to
      // distinguish "not found" from "upstream timeout".
      await expect(barcode.lookup("0000000000017")).rejects.toMatchObject({
        status,
        serverMessage: barcodeErrorFixtures[name].error,
      });
    },
  );

  it("`BarcodeLookupResponseSchema` accepts every success fixture as `unknown`", () => {
    for (const name of SUCCESS_NAMES) {
      const parsed = BarcodeLookupResponseSchema.parse(
        barcodeSuccessRawFixtures[name],
      );
      expect(parsed).toEqual(barcodeSuccessFixtures[name]);
    }
  });

  it("`BarcodeLookupResponseSchema` accepts every error fixture as `unknown`", () => {
    for (const name of ERROR_NAMES) {
      const parsed = BarcodeLookupResponseSchema.parse(
        barcodeErrorRawFixtures[name],
      );
      expect(parsed).toEqual(barcodeErrorFixtures[name]);
    }
  });

  it("`BarcodeLookupSuccessSchema` rejects a payload missing the required `name` field", () => {
    // Drop `product.name` to simulate a server regression where the
    // normaliser forgets to backfill the product label. The schema must
    // refuse the response — the scanner UI assumes `name` is always a
    // non-empty string and would crash on `undefined.toLowerCase()`.
    const broken = {
      product: {
        // name missing on purpose.
        brand: null,
        kcal_100g: null,
        protein_100g: null,
        fat_100g: null,
        carbs_100g: null,
        servingSize: null,
        servingGrams: null,
        source: "off",
      },
    };
    const result = BarcodeLookupSuccessSchema.safeParse(broken);
    expect(result.success).toBe(false);
  });

  it("`BarcodeLookupSuccessSchema` rejects an unknown `source` enum value", () => {
    const broken = {
      product: {
        ...barcodeSuccessFixtures.offFull.product,
        // 'fdc' is a real upstream we considered but never wired up;
        // the schema must reject anything outside the registered enum.
        source: "fdc",
      },
    };
    const result = BarcodeLookupSuccessSchema.safeParse(broken);
    expect(result.success).toBe(false);
  });

  it("`BarcodeLookupErrorSchema` rejects an empty error message", () => {
    // The scanner UI shows the error string verbatim; an empty message
    // would leave the user with a silent failure. `z.string().min(1)`
    // is the contract guarantee.
    const result = BarcodeLookupErrorSchema.safeParse({ error: "" });
    expect(result.success).toBe(false);
  });
});
