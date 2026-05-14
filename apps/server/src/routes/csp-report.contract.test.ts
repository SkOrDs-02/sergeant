import { describe, it, expect, beforeEach, afterAll, vi } from "vitest";
import request from "supertest";
import {
  cspReportFixtures,
  cspReportFixtureSchemas,
  CspReportBodySchema,
  assertCspReportFixturesValid,
  type CspReportFixtureCase,
} from "@sergeant/shared";

/**
 * Producer-side contract test for `POST /api/csp-report`.
 *
 * **Goal:** prove that every browser CSP-report wire format documented
 * in `@sergeant/shared/contract-fixtures/cspReport` is accepted by the
 * route handler (`apps/server/src/modules/observability/csp-report.ts`)
 * with a `204 No Content` response — including the older quirky Safari
 * "bare envelope" path and unknown-directive fuzz cases. The matching
 * schema test lives in `apps/web/src/test/contract/csp-report.contract.test.ts`.
 *
 * The contract here is **asymmetric**: there's no consumer in
 * `@sergeant/api-client` because browsers POST these reports directly
 * (the page's own CSP header sets `report-uri`/`report-to`). So the
 * "consumer" test on the web side just exercises the schema, while the
 * producer test validates that the actual route hands back 204 for
 * every fixture.
 *
 * Closes audit `docs/audits/2026-05-13-security-observability-roast.md`
 * § S7 (Contract test expansion — auth, csp-report, account-recovery).
 */

const { mockPool, queryMock } = vi.hoisted(() => {
  const queryMock = vi.fn().mockResolvedValue({ rows: [{ "?column?": 1 }] });
  const mockPool = {
    query: queryMock,
    connect: vi.fn(),
    on: vi.fn(),
    totalCount: 0,
    idleCount: 0,
    waitingCount: 0,
  };
  return { mockPool, queryMock };
});

vi.mock("./../db.js", () => ({
  default: mockPool,
  pool: mockPool,
  query: queryMock,
  ensureSchema: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("./../auth.js", () => ({
  auth: { handler: async () => new Response(null, { status: 404 }) },
  getSessionUser: vi.fn().mockResolvedValue(null),
  getSessionUserSoft: vi.fn().mockResolvedValue(null),
}));

// The CSP report route is rate-limited via `rateLimitExpress`. The limiter
// has its own Postgres-backed bucket which would otherwise pre-empt the
// handler when the mocked pool returns the limiter's "no rows" sentinel.
// Swap for passthrough so we measure the handler's wire-contract behaviour,
// not the limiter (covered by `http/rateLimit.test.ts`).
vi.mock("./../http/rateLimit.js", async () => {
  const actual = await vi.importActual<typeof import("./../http/rateLimit.js")>(
    "./../http/rateLimit.js",
  );
  return {
    ...actual,
    rateLimitExpress: () => (_req: unknown, _res: unknown, next: () => void) =>
      next(),
    authSensitiveRateLimit: (_req: unknown, _res: unknown, next: () => void) =>
      next(),
  };
});

import { createApp } from "./../app.js";

beforeEach(() => {
  queryMock.mockReset();
  queryMock.mockResolvedValue({ rows: [{ "?column?": 1 }] });
});

afterAll(() => {
  // No env vars to restore — this route is environment-agnostic.
});

/**
 * Per-fixture content-type matrix. Browsers POST CSP reports with a
 * specific content type per wire format; the route's body parser is
 * stitched in `app.ts` against both `application/csp-report` (legacy)
 * and `application/reports+json` (modern Reporting-API). The bare-no-
 * envelope case is also `application/csp-report` because Safari quirks
 * the envelope but keeps the content type.
 */
const CONTENT_TYPE_BY_FIXTURE: Record<CspReportFixtureCase, string> = {
  legacyEnvelope: "application/csp-report",
  reportingApiArray: "application/reports+json",
  bareNoEnvelope: "application/csp-report",
  unknownDirective: "application/csp-report",
};

const FIXTURE_NAMES: readonly CspReportFixtureCase[] = [
  "legacyEnvelope",
  "reportingApiArray",
  "bareNoEnvelope",
  "unknownDirective",
] as const;

describe("contract producer: POST /api/csp-report", () => {
  it("fixtures self-check — every named fixture parses through its schema", () => {
    expect(() => assertCspReportFixturesValid()).not.toThrow();
    // Per-arm schema check as well: each fixture should match the
    // specific wire-format arm of the union, not just any arm. This
    // catches a regression where (e.g.) the bare fixture starts
    // matching the legacy envelope schema due to a refactor.
    for (const name of FIXTURE_NAMES) {
      const schema = cspReportFixtureSchemas[name];
      const parsed = schema.safeParse(cspReportFixtures[name]);
      expect(parsed.success, `fixture ${name} must match its arm`).toBe(true);
    }
  });

  it.each(FIXTURE_NAMES)(
    "fixture %s — handler returns 204 No Content",
    async (name) => {
      const fixture = cspReportFixtures[name];
      const app = createApp();
      const res = await request(app)
        .post("/api/csp-report")
        .set("Content-Type", CONTENT_TYPE_BY_FIXTURE[name])
        .send(JSON.stringify(fixture));

      // Handler always 204, never 4xx — see module-level comment in
      // `csp-report.ts` ("Always responds 204"). Status-code stability
      // is part of the contract because a non-204 would feed the
      // browser's retry telemetry.
      expect(res.status).toBe(204);
      // 204 must carry no body — RFC 9110 § 15.3.5.
      expect(res.text).toBe("");
    },
  );

  it("body without recognised directive fields — handler still returns 204", async () => {
    // The handler swallows noise (empty objects, unknown keys) with 204
    // because a 4xx here would just feed retry storms from misbehaving
    // browsers / scanners. We use a valid-JSON-but-empty body so we hit
    // the *handler's* defensive path, not the body-parser's 400-on-junk
    // path (which is already covered by Express's parser config and is
    // intentionally outside this contract's surface).
    const app = createApp();
    const res = await request(app)
      .post("/api/csp-report")
      .set("Content-Type", "application/csp-report")
      .send(JSON.stringify({}));

    expect(res.status).toBe(204);
    expect(res.text).toBe("");
  });

  it("response is byte-stable between /api/csp-report and /api/v1/csp-report", async () => {
    // `apiVersionRewrite` (`apps/server/src/app.ts`) mirrors `/api/*` ↔
    // `/api/v1/*`. CSP reports are never going to be versioned but the
    // rewrite still applies — we verify the mirror doesn't accidentally
    // change the response shape.
    const app = createApp();
    const fixture = cspReportFixtures.legacyEnvelope;

    const legacy = await request(app)
      .post("/api/csp-report")
      .set("Content-Type", "application/csp-report")
      .send(JSON.stringify(fixture));
    const v1 = await request(app)
      .post("/api/v1/csp-report")
      .set("Content-Type", "application/csp-report")
      .send(JSON.stringify(fixture));

    expect(legacy.status).toBe(204);
    expect(v1.status).toBe(204);
    expect(v1.text).toBe(legacy.text);
  });

  it("union schema accepts every fixture as `unknown` wire JSON (consumer-style guard)", () => {
    // Mirror of the consumer-side schema assertion — kept here so the
    // producer suite can fail fast on schema/fixture drift without
    // depending on the web app's test runner.
    for (const name of FIXTURE_NAMES) {
      const result = CspReportBodySchema.safeParse(cspReportFixtures[name]);
      expect(result.success, `fixture ${name} must pass union schema`).toBe(
        true,
      );
    }
  });
});
