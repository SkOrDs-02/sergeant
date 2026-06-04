/**
 * Producer-side contract test for `GET /api/barcode?barcode=…`.
 *
 * **Goal:** lock down the wire shape emitted by
 * `apps/server/src/modules/nutrition/barcode.ts` so any server-side
 * regression in the response envelope fails CI before it reaches the
 * consumers (`packages/api-client`, `apps/web`, `apps/mobile`).
 *
 * Mirrors the consumer-side test at
 * `apps/web/src/test/contract/barcode.contract.test.ts` (PR-T29).
 * Together they close AGENTS.md Hard Rule #3 (server response shape ↔
 * api-client types ↔ test) for this endpoint:
 *
 *   - Consumer test: mocks fetch, asserts the api-client parses the
 *     fixture correctly.
 *   - This producer test: calls the server handler with mocked upstream
 *     fetch, asserts the emitted JSON matches `BarcodeLookupSuccessSchema` /
 *     `BarcodeLookupErrorSchema` exactly.
 *
 * Fixtures are imported from `packages/shared/src/contract-fixtures/barcode`
 * (the SSOT for wire shapes). If a fixture no longer parses through its
 * schema the `assertBarcodeFixturesValid()` guard in the fixture file
 * detects it before any handler code runs.
 *
 * Route: `GET /api/barcode` (v0 alias) and `GET /api/v1/barcode` (canonical).
 * Handler: `apps/server/src/modules/nutrition/barcode.ts` (default export).
 */

import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import type { Request, Response } from "express";

import {
  assertBarcodeFixturesValid,
  barcodeErrorFixtures,
  barcodeSuccessFixtures,
  BarcodeLookupSuccessSchema,
  BarcodeLookupErrorSchema,
  type BarcodeSuccessFixtureCase,
  type BarcodeErrorFixtureCase,
} from "@sergeant/shared";

// ──────────────────────────────────────────────────────────────────────────────
// Dynamic import to pick up __barcodeTestHooks for cache reset.
// ──────────────────────────────────────────────────────────────────────────────
import handler, { __barcodeTestHooks } from "../modules/nutrition/barcode.js";

// ──────────────────────────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────────────────────────

interface TestRes {
  statusCode: number;
  body: unknown;
  status(code: number): TestRes;
  json(payload: unknown): TestRes;
}

function makeRes(): TestRes & Response {
  const res: TestRes = {
    statusCode: 200,
    body: undefined,
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(payload: unknown) {
      this.body = payload;
      return this;
    },
  };
  return res as TestRes & Response;
}

function makeReq(barcode: string): Request {
  return { query: { barcode } } as unknown as Request;
}

/**
 * Build a minimal OFF/USDA/UPCitemdb upstream response that the cascade
 * handler treats as a hit. The shape here matches what the real upstreams
 * return; the normalizers extract the typed fields the handler then
 * emits in the success envelope.
 */
function offUpstreamHit(overrides: Record<string, unknown> = {}): unknown {
  return {
    status: 1,
    product: {
      product_name: "Test Product",
      brands: "Test Brand",
      serving_size: "100 g",
      serving_quantity: 100,
      nutriments: {
        "energy-kcal_100g": 52,
        proteins_100g: 2.8,
        fat_100g: 2.5,
        carbohydrates_100g: 4.7,
      },
      ...overrides,
    },
  };
}

let originalFetch: typeof globalThis.fetch;

beforeEach(() => {
  originalFetch = globalThis.fetch;
  __barcodeTestHooks().reset();
});

afterEach(() => {
  globalThis.fetch = originalFetch;
  vi.restoreAllMocks();
});

// ──────────────────────────────────────────────────────────────────────────────
// Fixture self-check (fires before any handler test)
// ──────────────────────────────────────────────────────────────────────────────

describe("contract: /api/barcode producer — fixture integrity", () => {
  it("every named fixture in @sergeant/shared parses through its schema", () => {
    expect(() => assertBarcodeFixturesValid()).not.toThrow();
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// Success shape — handler emits { product: BarcodeProduct }
// ──────────────────────────────────────────────────────────────────────────────

const SUCCESS_NAMES: readonly BarcodeSuccessFixtureCase[] = [
  "offFull",
  "usdaBranded",
  "upcitemdbPartial",
  "nullableMacros",
] as const;

describe("contract: /api/barcode producer — success envelope", () => {
  it.each(SUCCESS_NAMES)(
    "success fixture %s is accepted by BarcodeLookupSuccessSchema",
    (name) => {
      const fixture = barcodeSuccessFixtures[name];
      const result = BarcodeLookupSuccessSchema.safeParse(fixture);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toEqual(fixture);
      }
    },
  );

  it("handler emits a BarcodeLookupSuccess-shaped response for an OFF cache hit", async () => {
    // Prime the upstream mock with a minimal OFF hit so the cascade resolves
    // in the first step (avoids USDA / UPCitemdb calls).
    globalThis.fetch = (async () => ({
      ok: true,
      status: 200,
      json: async () => offUpstreamHit(),
    })) as unknown as typeof fetch;

    const res = makeRes();
    await handler(makeReq("4820010840443"), res);

    expect(res.statusCode).toBe(200);
    // The body must parse through the canonical success schema from @sergeant/shared.
    const parsed = BarcodeLookupSuccessSchema.safeParse(res.body);
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      const product = parsed.data.product;
      expect(typeof product.name).toBe("string");
      expect(product.name.length).toBeGreaterThan(0);
      expect(product.source).toBe("off");
      // Macros must be `number | null` — never a bare string or undefined.
      expect(
        typeof product.kcal_100g === "number" || product.kcal_100g === null,
      ).toBe(true);
      expect(
        typeof product.protein_100g === "number" ||
          product.protein_100g === null,
      ).toBe(true);
    }
  });

  it("handler emits a complete product envelope (all BarcodeProduct keys present)", async () => {
    globalThis.fetch = (async () => ({
      ok: true,
      status: 200,
      json: async () => offUpstreamHit(),
    })) as unknown as typeof fetch;

    const res = makeRes();
    await handler(makeReq("5901234123457"), res);

    expect(res.statusCode).toBe(200);
    const body = res.body as { product?: Record<string, unknown> };
    expect(body).toHaveProperty("product");
    const product = body.product!;
    // All keys from BarcodeProductSchema must be present in the serialized output.
    for (const key of [
      "name",
      "brand",
      "kcal_100g",
      "protein_100g",
      "fat_100g",
      "carbs_100g",
      "servingSize",
      "servingGrams",
      "source",
    ]) {
      expect(product).toHaveProperty(key);
    }
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// Error shape — handler emits { error: string }
// ──────────────────────────────────────────────────────────────────────────────

const ERROR_NAMES: readonly BarcodeErrorFixtureCase[] = [
  "notFound",
  "badRequest",
  "upstreamTimeout",
] as const;

describe("contract: /api/barcode producer — error envelope", () => {
  it.each(ERROR_NAMES)(
    "error fixture %s is accepted by BarcodeLookupErrorSchema",
    (name) => {
      const fixture = barcodeErrorFixtures[name];
      const result = BarcodeLookupErrorSchema.safeParse(fixture);
      expect(result.success).toBe(true);
    },
  );

  it("handler emits { error: string } with status 400 for invalid (too-short) barcode", async () => {
    // '123' is only 3 digits — handler rejects before touching upstream.
    const res = makeRes();
    await handler(makeReq("123"), res);

    expect(res.statusCode).toBe(400);
    const parsed = BarcodeLookupErrorSchema.safeParse(res.body);
    expect(parsed.success).toBe(true);
  });

  it("handler emits { error: string } with status 404 when all upstreams miss", async () => {
    // All three upstreams return a miss-response (status 1 but no product, or 404).
    globalThis.fetch = (async () => ({
      ok: true,
      status: 200,
      json: async () => ({ status: 0 }), // OFF: status != 1 → miss
    })) as unknown as typeof fetch;

    const res = makeRes();
    await handler(makeReq("12345678"), res);

    expect(res.statusCode).toBe(404);
    const parsed = BarcodeLookupErrorSchema.safeParse(res.body);
    expect(parsed.success).toBe(true);
  });

  it("handler emits { error: string } with status 404 when every upstream aborts (transient miss, not cached)", async () => {
    // Each upstream lookup is wrapped in its own try/catch inside the
    // cascade, so an AbortError from all three is swallowed as a transient
    // failure (`upstreamThrew = true`) rather than propagating to the outer
    // catch. The contract is therefore a 404 "not found" envelope that is
    // explicitly NOT cached, so a retry re-runs the full cascade. (The
    // dedicated 504 branch only fires for an abort raised outside the
    // per-upstream cascade.)
    globalThis.fetch = (async () => {
      const err = new Error("The operation was aborted");
      err.name = "AbortError";
      throw err;
    }) as unknown as typeof fetch;

    const res = makeRes();
    await handler(makeReq("12345678901"), res);

    expect(res.statusCode).toBe(404);
    const parsed = BarcodeLookupErrorSchema.safeParse(res.body);
    expect(parsed.success).toBe(true);
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// Cross-side invariants — ensure producer and consumer shapes are compatible
// ──────────────────────────────────────────────────────────────────────────────

describe("contract: /api/barcode producer ↔ consumer shape invariants", () => {
  it("shared success fixtures that parse on producer side also encode to the same JSON the consumer expects", () => {
    for (const name of SUCCESS_NAMES) {
      const fixture = barcodeSuccessFixtures[name];
      // Round-trip through the schema (simulates what res.json does on the
      // server and what the api-client parses on the consumer side).
      const parsed = BarcodeLookupSuccessSchema.parse(fixture);
      expect(parsed).toEqual(fixture);
    }
  });

  it("`BarcodeLookupErrorSchema` rejects an empty `error` string (scanner UI invariant)", () => {
    // Consumer (scanner UI) displays `error` verbatim; empty = silent failure.
    const result = BarcodeLookupErrorSchema.safeParse({ error: "" });
    expect(result.success).toBe(false);
  });

  it("`BarcodeLookupSuccessSchema` rejects an unknown `source` value (no undocumented upstreams)", () => {
    const broken = {
      product: {
        ...barcodeSuccessFixtures.offFull.product,
        source: "unknown_upstream",
      },
    };
    const result = BarcodeLookupSuccessSchema.safeParse(broken);
    expect(result.success).toBe(false);
  });
});
