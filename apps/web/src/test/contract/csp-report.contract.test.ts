/**
 * Contract test (consumer side) for `POST /api/csp-report`.
 *
 * **Goal:** prove that the canonical wire-shape fixtures in
 * `@sergeant/shared/contract-fixtures/cspReport` are accepted by the
 * union schema (`CspReportBodySchema`) byte-for-byte. The matching
 * producer-side test (which hits the actual handler with each fixture
 * and asserts 204) lives in
 * `apps/server/src/routes/csp-report.contract.test.ts`.
 *
 * The CSP report endpoint is asymmetric: browsers POST it directly off
 * the page's `Content-Security-Policy` `report-uri`/`report-to`
 * directives, so the web app never builds the body itself. The contract
 * here exists so that if a Sergeant SDK ever surfaces a "test your CSP"
 * helper, or a mobile WebView shim forwards reports, the wire shape
 * stays locked.
 *
 * Closes audit `docs/audits/2026-05-13-security-observability-roast.md`
 * § S7 (Contract test expansion — auth, csp-report, account-recovery).
 */

import { describe, expect, it } from "vitest";
import {
  cspReportFixtures,
  cspReportRawFixtures,
  cspReportFixtureSchemas,
  assertCspReportFixturesValid,
  CspReportBodySchema,
  CspReportLegacyEnvelopeSchema,
  CspReportingApiArraySchema,
  CspReportBareSchema,
  type CspReportFixtureCase,
} from "@sergeant/shared";

const FIXTURE_NAMES: readonly CspReportFixtureCase[] = [
  "legacyEnvelope",
  "reportingApiArray",
  "bareNoEnvelope",
  "unknownDirective",
] as const;

describe("contract: /api/csp-report", () => {
  it("every named fixture parses through CspReportBodySchema (sanity)", () => {
    expect(() => assertCspReportFixturesValid()).not.toThrow();
  });

  it.each(FIXTURE_NAMES)(
    "fixture %s — raw JSON view parses to its typed fixture",
    (name) => {
      const raw = cspReportRawFixtures[name];
      const parsed = CspReportBodySchema.parse(raw);
      expect(parsed).toEqual(cspReportFixtures[name]);
    },
  );

  it("legacy envelope fixtures match CspReportLegacyEnvelopeSchema exactly", () => {
    // The narrower schema is what the server's handler branches on for
    // the legacy code path. A regression where the union's parse picks
    // a different arm for the same fixture is a contract drift.
    const parsed = CspReportLegacyEnvelopeSchema.parse(
      cspReportFixtures.legacyEnvelope,
    );
    expect(parsed).toEqual(cspReportFixtures.legacyEnvelope);
  });

  it("reporting-API array fixture matches CspReportingApiArraySchema exactly", () => {
    const parsed = CspReportingApiArraySchema.parse(
      cspReportFixtures.reportingApiArray,
    );
    expect(parsed).toEqual(cspReportFixtures.reportingApiArray);
  });

  it("bare-no-envelope fixture matches CspReportBareSchema exactly", () => {
    const parsed = CspReportBareSchema.parse(cspReportFixtures.bareNoEnvelope);
    expect(parsed).toEqual(cspReportFixtures.bareNoEnvelope);
  });

  it("unknown-directive fixture still parses (handler normalises to `other` label)", () => {
    // The schema is permissive on directive *names* because we don't
    // want a new W3C directive (e.g. `fenced-frame-src`) to start
    // failing the contract test before the metric label mapping is
    // updated. The server-side `KNOWN_DIRECTIVES` set in
    // `apps/server/src/modules/observability/csp-report.ts` is the
    // place to add new label mappings — the schema follows.
    const result = CspReportBodySchema.safeParse(
      cspReportFixtures.unknownDirective,
    );
    expect(result.success).toBe(true);
  });

  it("rejects a top-level non-object, non-array body (drift detection)", () => {
    // A regression where a future schema arm accepted bare strings or
    // numbers would let metrics-poisoning input slip past the contract
    // gate. Mirrors the handler's "silently 204" path for bad bytes but
    // at the schema level we want a hard fail.
    expect(() => CspReportBodySchema.parse("not-a-report")).toThrow();
    expect(() => CspReportBodySchema.parse(42)).toThrow();
    expect(() => CspReportBodySchema.parse(null)).toThrow();
  });

  it("rejects a bare body missing every directive key (drift detection)", () => {
    // The bare arm requires at least one directive-naming key. A
    // regression that relaxed that refine would accept arbitrary
    // objects — defeating the metric-attribution contract.
    const empty: Record<string, unknown> = { foo: "bar" };
    expect(() => CspReportBodySchema.parse(empty)).toThrow();
  });

  it("rejects an extra top-level key on the legacy envelope (strict)", () => {
    // The legacy envelope schema is `.strict()` — any extra top-level
    // key (e.g. an attacker piggy-backing fields onto the report POST)
    // must fail. Inner body fields stay permissive on purpose.
    const drifted = {
      ...cspReportFixtures.legacyEnvelope,
      shouldNotBeHere: 1,
    };
    expect(() => CspReportLegacyEnvelopeSchema.parse(drifted)).toThrow();
  });

  it("per-fixture schema map round-trips through `safeParse()`", () => {
    // The fixture map is what producer / consumer tests use to validate
    // arm-specific behaviour. Keep it byte-for-byte consistent with the
    // canonical fixtures.
    for (const name of FIXTURE_NAMES) {
      const schema = cspReportFixtureSchemas[name];
      const parsed = schema.safeParse(cspReportFixtures[name]);
      expect(parsed.success, `fixture ${name} must match arm-schema`).toBe(
        true,
      );
    }
  });
});
