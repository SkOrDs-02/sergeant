/**
 * Canonical fixtures for `POST /api/csp-report` request bodies.
 *
 * The route is mounted by `apps/server/src/routes/csp-report.ts`; the
 * handler lives at `apps/server/src/modules/observability/csp-report.ts`
 * and is described in
 * `docs/security/hardening/C2-frontend-csp.md`. Each named case
 * represents a real wire shape browsers POST in production:
 *
 * - `legacyEnvelope` — Firefox + Chromium pre-Reporting-API. Sends
 *   `Content-Type: application/csp-report` with a top-level
 *   `{ "csp-report": { ... } }` envelope.
 * - `reportingApiArray` — Chromium with Reporting-API enabled (the
 *   modern path). Sends `Content-Type: application/reports+json` with a
 *   top-level array of `{ type: "csp-violation", body: {...} }`.
 * - `bareNoEnvelope` — older Safari quirk: drops the `csp-report`
 *   envelope and posts the violation fields at the top level. The
 *   handler accepts it iff at least one directive key is present.
 * - `unknownDirective` — fuzz / future-directive case. The handler
 *   normalises any unrecognised directive to the metric label `other`
 *   (`KNOWN_DIRECTIVES` set in `csp-report.ts`) so the time-series
 *   cardinality stays bounded.
 *
 * The handler ALWAYS responds `204 No Content`, regardless of payload
 * validity, so the response side of this contract is just "no body".
 * The interesting wire format is the *request*; the producer test posts
 * each fixture and asserts the route still returns 204.
 *
 * Closes audit `docs/audits/2026-05-13-security-observability-roast.md`
 * § S7 (Contract test expansion — auth, csp-report, account-recovery).
 */

import {
  CspReportBodySchema,
  CspReportLegacyEnvelopeSchema,
  CspReportingApiArraySchema,
  CspReportBareSchema,
  type CspReportBody,
} from "../schemas/api";

export const cspReportFixtures = {
  legacyEnvelope: {
    "csp-report": {
      "document-uri": "https://sergeant.vercel.app/",
      referrer: "https://sergeant.vercel.app/login",
      "violated-directive": "script-src",
      "effective-directive": "script-src-elem",
      "original-policy":
        "default-src 'self'; script-src 'self' 'unsafe-inline'; report-uri /api/csp-report",
      disposition: "report",
      "blocked-uri": "https://attacker.example/x.js",
      "line-number": 42,
      "column-number": 8,
      "source-file": "https://sergeant.vercel.app/assets/index.js",
      "status-code": 0,
      "script-sample": "",
    },
  },
  reportingApiArray: [
    {
      type: "csp-violation",
      url: "https://sergeant.vercel.app/",
      age: 12,
      user_agent:
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Chrome/123.0.0.0",
      body: {
        documentURL: "https://sergeant.vercel.app/",
        referrer: "",
        blockedURL: "inline",
        effectiveDirective: "style-src-elem",
        originalPolicy:
          "default-src 'self'; style-src 'self'; report-to default",
        sourceFile: "https://sergeant.vercel.app/",
        sample: "",
        disposition: "report",
        statusCode: 200,
        lineNumber: 1,
        columnNumber: 1,
      },
    },
  ],
  bareNoEnvelope: {
    "document-uri": "https://sergeant.vercel.app/dashboard",
    "violated-directive": "img-src",
    "effective-directive": "img-src",
    "blocked-uri": "https://tracker.example/pixel.gif",
    disposition: "enforce",
  },
  unknownDirective: {
    "csp-report": {
      "document-uri": "https://sergeant.vercel.app/",
      "violated-directive": "fenced-frame-src",
      "effective-directive": "fenced-frame-src",
      disposition: "report",
      "blocked-uri": "https://embed.example/",
    },
  },
} as const satisfies Record<string, CspReportBody>;

export type CspReportFixtureCase = keyof typeof cspReportFixtures;

/**
 * Same fixtures typed as `unknown` for `.safeParse()` exercises.
 */
export const cspReportRawFixtures: Record<CspReportFixtureCase, unknown> =
  cspReportFixtures;

/**
 * Per-case schema map so a fixture can be validated against the *exact*
 * arm of the union it belongs to (the producer module branches on the
 * envelope shape — see `cspReportHandler` in
 * `apps/server/src/modules/observability/csp-report.ts`).
 */
export const cspReportFixtureSchemas = {
  legacyEnvelope: CspReportLegacyEnvelopeSchema,
  reportingApiArray: CspReportingApiArraySchema,
  bareNoEnvelope: CspReportBareSchema,
  unknownDirective: CspReportLegacyEnvelopeSchema,
} as const;

/** Cheap self-check: every named fixture must parse through the union schema. */
export function assertCspReportFixturesValid(): void {
  for (const [name, fixture] of Object.entries(cspReportFixtures)) {
    const result = CspReportBodySchema.safeParse(fixture);
    if (!result.success) {
      throw new Error(
        `Contract fixture "csp-report.${name}" no longer matches CspReportBodySchema: ${result.error.message}`,
      );
    }
  }
}
