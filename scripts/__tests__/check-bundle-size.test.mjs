// scripts/__tests__/check-bundle-size.test.mjs
//
// Unit tests for the bundle-size gate's prefix-matching layer.
//
// History: prior to 2026-05-24 the BUDGETS prefixes did not match the
// actual Rollup output filenames (`<Name>App-<hash>.js` for module
// chunks, `vendor-<name>-<hash>.js` for vendor chunks). Every chunk fell
// into the "uncategorized" bucket and `violations.length` was always 0
// — the gate silently passed every regression. These tests pin the
// convention so a future Vite/Rollup change breaks the test, not prod.
//
// Run with:
//   node --test scripts/__tests__/check-bundle-size.test.mjs

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { BUDGETS, getChunkCategory } from "../check-bundle-size.mjs";

// ── Real-world fixture filenames ─────────────────────────────────────────────
// These mirror what Rollup actually emits into `apps/web/dist/assets/`.
// Hash format is `[a-z0-9]{8,}` produced by Vite's default `chunkFileNames`.

const REAL_CHUNK_FIXTURES = [
  // Module chunks — derived from the imported source file name.
  { name: "FinykApp-abc12345.js", expectedDesc: "Finyk module" },
  { name: "FizrukApp-def67890.js", expectedDesc: "Fizruk module" },
  { name: "RoutineApp-aaaabbbb.js", expectedDesc: "Routine module" },
  { name: "NutritionApp-99887766.js", expectedDesc: "Nutrition module" },

  // Vendor chunks — named by `manualChunks(id)` in `vite.config.js`.
  { name: "vendor-react-cafebabe.js", expectedDesc: "React runtime" },
  { name: "vendor-router-deadbeef.js", expectedDesc: "React Router" },
  { name: "vendor-react-query-12345abc.js", expectedDesc: "TanStack Query" },
  { name: "vendor-sentry-feedface.js", expectedDesc: "Sentry SDK" },
  { name: "vendor-virtuoso-baadf00d.js", expectedDesc: "Virtuoso list" },
  { name: "vendor-auth-1234abcd.js", expectedDesc: "Better Auth client" },
  { name: "vendor-zod-aabbccdd.js", expectedDesc: "Zod + resolvers" },
  { name: "vendor-zxing-99aabbcc.js", expectedDesc: "ZXing barcode scanner" },
  { name: "vendor-sqlite-deadc0de.js", expectedDesc: "sqlite-wasm + drizzle" },
  { name: "vendor-web-vitals-11223344.js", expectedDesc: "Web Vitals" },

  // Main entry
  { name: "index-aabbccdd.js", expectedDesc: "Main entry" },
];

describe("getChunkCategory — real fixture filenames", () => {
  for (const { name, expectedDesc } of REAL_CHUNK_FIXTURES) {
    it(`matches ${name} → ${expectedDesc}`, () => {
      const cat = getChunkCategory(name);
      assert.ok(cat, `expected a category for ${name}, got null`);
      assert.equal(cat.description, expectedDesc);
    });
  }
});

// ── Catch-all + uncategorized behaviour ──────────────────────────────────────

describe("getChunkCategory — catch-all + uncategorized", () => {
  it("falls into the `vendor-` catch-all for unknown vendor chunks", () => {
    // Future-Vite/manualChunks could introduce a new vendor split. The
    // catch-all must absorb it (with a generous Misc budget) instead of
    // silently dropping it.
    const cat = getChunkCategory("vendor-unknown-future-abc123.js");
    assert.ok(cat);
    assert.equal(cat.description, "Misc vendor (catch-all)");
    assert.equal(cat.prefix, "vendor-");
  });

  it("returns null for filenames that match no prefix at all", () => {
    // Things like a stray polyfill chunk or a stylesheet sidecar should
    // surface as `📁 Other chunks` in the CLI report — that's the signal
    // someone needs to add a new BUDGETS entry.
    assert.equal(getChunkCategory("polyfills-legacy-xyz.js"), null);
    assert.equal(getChunkCategory("assets-manifest.json"), null);
    assert.equal(getChunkCategory("workbox-precache-abc.js"), null);
  });
});

// ── Regression guards ────────────────────────────────────────────────────────
// The exact bug we just paid for: prefixes that no longer match what
// Rollup actually emits. These tests would have caught the 2026-05-24
// silent no-op.

describe("getChunkCategory — regression guards for prior bug", () => {
  it("vendor chunks REQUIRE the `vendor-` prefix (regression #1)", () => {
    // The historical bug had `"react-": { ... }` instead of
    // `"vendor-react-": { ... }`. Rollup never emits a bare `react-…`
    // filename, so the gate matched nothing. Re-introducing that
    // mistake would land here.
    assert.equal(
      getChunkCategory("react-abc.js"),
      null,
      "bare `react-` must not exist as a BUDGETS key — chunks are named `vendor-react-`",
    );
    assert.equal(getChunkCategory("router-abc.js"), null);
    assert.equal(getChunkCategory("sentry-abc.js"), null);
    assert.equal(getChunkCategory("virtuoso-abc.js"), null);
    assert.equal(getChunkCategory("tanstack-abc.js"), null);
  });

  it("module chunks REQUIRE the `App` suffix in their prefix (regression #2)", () => {
    // Module chunks are derived from the imported source file
    // `FinykApp.tsx`, not the module folder `finyk/`. A regression to
    // `finyk-` would silently match nothing.
    assert.equal(getChunkCategory("finyk-abc.js"), null);
    assert.equal(getChunkCategory("fizruk-abc.js"), null);
    assert.equal(getChunkCategory("routine-abc.js"), null);
    assert.equal(getChunkCategory("nutrition-abc.js"), null);
  });

  it("every non-catch-all BUDGETS prefix matches at least one real fixture", () => {
    // Without this, an orphan budget (like the prior `recharts-` entry
    // for a dep we don't ship) silently rots. The catch-all `vendor-`
    // and `_total` meta-key are exempt.
    const EXEMPT = new Set(["vendor-", "_total"]);
    const fixtures = REAL_CHUNK_FIXTURES.map((f) => f.name);

    for (const prefix of Object.keys(BUDGETS)) {
      if (EXEMPT.has(prefix)) continue;
      const hasMatch = fixtures.some((f) => f.startsWith(prefix));
      assert.ok(
        hasMatch,
        `BUDGETS prefix "${prefix}" matches no fixture — either add a fixture or remove the orphan budget`,
      );
    }
  });

  it("`_total` meta-key is never returned as a chunk match", () => {
    // `getChunkCategory` skips `_total` explicitly. Re-shuffling
    // BUDGETS must not regress that guard.
    const cat = getChunkCategory("_total-something.js");
    assert.equal(cat, null);
  });
});

// ── BUDGETS shape sanity ─────────────────────────────────────────────────────

describe("BUDGETS shape", () => {
  it("every entry has a positive numeric maxSize and a description", () => {
    for (const [prefix, cfg] of Object.entries(BUDGETS)) {
      assert.equal(
        typeof cfg.maxSize,
        "number",
        `${prefix} maxSize must be number`,
      );
      assert.ok(cfg.maxSize > 0, `${prefix} maxSize must be > 0`);
      assert.equal(
        typeof cfg.description,
        "string",
        `${prefix} needs description`,
      );
      assert.ok(cfg.description.length > 0);
    }
  });

  it("contains the `_total` meta-budget", () => {
    assert.ok(BUDGETS._total);
    assert.equal(typeof BUDGETS._total.maxSize, "number");
  });
});
