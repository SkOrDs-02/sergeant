/// <reference types="node" />
// `apps/web/tsconfig.json` ships `"types": ["vite/client"]` so the standalone
// `tsc-files` pre-commit (initiative 0009 PR 1.3) cannot see Node's globals
// when this file is checked in isolation. The triple-slash reference adds
// `@types/node` only for this file — vitest config already pulls it in for
// `pnpm typecheck`, so this is a no-op in the project-wide build.
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { parseCsp as parseCspToMap } from "./helpers/parseCsp.js";

/**
 * L11 — `docs/security/hardening/L11-csp-monitoring-allowlist.md`.
 *
 * The C2 frontend CSP is shipped from two sources:
 *
 * 1. The ENFORCED `Content-Security-Policy` response header sent by
 *    Vercel via `apps/web/vercel.json` headers config — the canonical
 *    policy in production. It also carries `report-uri` / `report-to`
 *    pointing at `/api/csp-report`, so violations of the enforced policy
 *    still feed the `csp_violation_total` metric.
 * 2. A `<meta http-equiv="Content-Security-Policy">` tag in
 *    `apps/web/index.html` — defense-in-depth fallback for contexts
 *    where Vercel headers are absent (file://, local Vite preview).
 *
 * The two MUST stay in sync for the monitoring allowlist (Sentry +
 * PostHog), otherwise:
 *   - a Vercel-served session reports CSP violations into Sentry while
 *     the meta-tag-served session silently drops them, OR
 *   - one of them widens to `https:` / `*` and quietly re-opens an
 *     egress channel for an XSS payload to exfiltrate to an arbitrary
 *     host.
 *
 * There is deliberately NO `Content-Security-Policy-Report-Only` header any
 * more (C2 Phase 2, 2026-10-03): it was strictly looser than the enforced
 * policy, so anything it could report the enforced policy already reports.
 * The guard below keeps it gone.
 *
 * This test is the regression guard against all of the above.
 */

interface CspDirectives {
  [name: string]: string[];
}

function parseCsp(csp: string): CspDirectives {
  const out: CspDirectives = {};
  for (const raw of csp.split(";")) {
    const directive = raw.trim();
    if (!directive) continue;
    const [name, ...sources] = directive.split(/\s+/);
    out[name!] = sources;
  }
  return out;
}

interface VercelHeaderBlock {
  source: string;
  headers: Array<{ key: string; value: string }>;
}

function readVercelHeaderBlocks(): VercelHeaderBlock[] {
  const cfg = JSON.parse(
    readFileSync(resolve(process.cwd(), "vercel.json"), "utf8"),
  ) as { headers: VercelHeaderBlock[] };
  return cfg.headers;
}

function readVercelWildcardHeaders(): VercelHeaderBlock["headers"] {
  const wildcard = readVercelHeaderBlocks().find((h) => h.source === "/(.*)");
  if (!wildcard) throw new Error("vercel.json missing wildcard header block");
  return wildcard.headers;
}

/**
 * The ENFORCED `Content-Security-Policy` header — the only CSP header
 * `vercel.json` ships. Parity with the `<meta>` fallback is anchored on it.
 *
 * History worth keeping: this used to be paired with a looser Report-Only
 * baseline, and anchoring parity on that baseline is what let the meta tag keep
 * `script-src 'unsafe-inline'` for months after the enforced header dropped it —
 * both "matched", so the guard stayed green while the fallback policy was
 * strictly weaker than the one real users get (spec beta-security-readiness, F4).
 */
function readVercelCsp(): string {
  const enforced = readVercelWildcardHeaders().find(
    (h) => h.key === "Content-Security-Policy",
  );
  if (!enforced)
    throw new Error("vercel.json wildcard block missing enforced CSP header");
  return enforced.value;
}

/**
 * Origins the meta fallback may carry that the production header must NOT.
 * The meta tag is what applies under `file://` and local `vite preview`, where
 * the dev server and HMR socket live on loopback. Anything outside loopback
 * is a real divergence and must fail.
 */
const META_DEV_ONLY_SOURCES = new Set([
  "http://localhost:3000",
  "http://127.0.0.1:3000",
  "ws://localhost:*",
  "ws://127.0.0.1:*",
]);

/** Keywords that make a policy weaker; never allowed to appear only in meta. */
const UNSAFE_KEYWORDS = new Set([
  "'unsafe-inline'",
  "'unsafe-eval'",
  "'unsafe-hashes'",
]);

function readMetaCsp(): string {
  const html = readFileSync(resolve(process.cwd(), "index.html"), "utf8");
  const match = html.match(
    /<meta[^>]*http-equiv="Content-Security-Policy"[^>]*content="([^"]+)"/i,
  );
  if (!match)
    throw new Error("index.html missing <meta http-equiv> CSP fallback");
  return match[1]!;
}

const REQUIRED_CONNECT_SRC = [
  "'self'",
  "https://*.sentry.io",
  "https://*.ingest.sentry.io",
  "https://*.posthog.com",
];

const REQUIRED_SCRIPT_SRC = [
  "'self'",
  "https://*.posthog.com",
  "https://*.sentry-cdn.com",
  "https://*.sentry.io",
  "https://js.sentry-cdn.com",
];

// `connect-src` is the egress channel an XSS would use to exfiltrate;
// any of these tokens collapses the policy to "anywhere on the web" and
// must be rejected. Bare `wss:` / `ws:` are in the list because `apps/web`
// opens no WebSocket at all — they were dropped from the enforced policy
// (spec beta-security-readiness, F4) and must not creep back in. The meta
// fallback keeps only the loopback `ws://localhost:*` HMR origins, which are
// not bare schemes.
const FORBIDDEN_BARE_SOURCES = [
  "https:",
  "http:",
  "*",
  "data:",
  "blob:",
  "wss:",
  "ws:",
];

describe("L11: CSP monitoring allowlist", () => {
  describe("vercel.json (production response header)", () => {
    const csp = parseCsp(readVercelCsp());

    it.each(REQUIRED_CONNECT_SRC)("connect-src includes %s", (host) => {
      expect(csp["connect-src"]).toContain(host);
    });

    it.each(REQUIRED_SCRIPT_SRC)("script-src includes %s", (host) => {
      expect(csp["script-src"]).toContain(host);
    });

    it.each(FORBIDDEN_BARE_SOURCES)(
      "connect-src excludes bare wildcard %s",
      (token) => {
        expect(csp["connect-src"]).not.toContain(token);
      },
    );

    it("connect-src has no bare-host wildcards beyond documented vendor subdomains", () => {
      // The enforced policy carries no dev loopback origins and no
      // WebSocket schemes, so every source must be either `'self'` or an
      // `https://<vendor>.<host>` URL with at least one literal label.
      const allowedNonHttps = new Set(["'self'"]);
      for (const src of csp["connect-src"] ?? []) {
        if (allowedNonHttps.has(src)) continue;
        expect(src).toMatch(/^https:\/\/[^*\s]*\*?\.[a-z0-9.-]+$/i);
      }
    });
  });

  describe("vercel.json ships only the enforced CSP (C2 Phase 2)", () => {
    // C2 dropped the `Content-Security-Policy-Report-Only` header on
    // 2026-10-03: it was strictly looser than the enforced policy (extra
    // `script-src 'unsafe-inline'`; extra `connect-src` loopback + `wss: ws:`),
    // so every violation it could report the enforced policy reports too, to
    // the same sink. Keeping it only doubled `csp_violation_total` noise and
    // left a second, weaker policy to drift. If you are deliberately running a
    // Report-Only canary for a stricter policy, relax this guard in the same PR
    // and remove the canary again after the soak (docs/operations/deploy/vercel.md).
    it("has no Content-Security-Policy-Report-Only header in any block", () => {
      for (const block of readVercelHeaderBlocks()) {
        const keys = block.headers.map((h) => h.key.toLowerCase());
        expect(
          keys,
          `vercel.json block "${block.source}" re-introduced a Report-Only CSP`,
        ).not.toContain("content-security-policy-report-only");
      }
    });

    it("has no Report-Only header in the wildcard block", () => {
      const keys = readVercelWildcardHeaders().map((h) => h.key.toLowerCase());
      expect(keys).not.toContain("content-security-policy-report-only");
      expect(keys).toContain("content-security-policy");
    });

    it("enforced CSP still reports to /api/csp-report via report-uri and report-to", () => {
      const csp = parseCsp(readVercelCsp());
      // Host-agnostic on purpose: the API host may move, the sink path and the
      // `report-uri` ↔ `Reporting-Endpoints` pairing must not.
      expect(csp["report-uri"]).toHaveLength(1);
      const reportUri = csp["report-uri"]![0]!;
      expect(reportUri).toMatch(/^https:\/\/[^/\s]+\/api\/csp-report$/);
      expect(csp["report-to"]).toEqual(["csp-endpoint"]);

      const reportingEndpoints = readVercelWildcardHeaders().find(
        (h) => h.key === "Reporting-Endpoints",
      );
      expect(
        reportingEndpoints,
        "vercel.json wildcard block missing Reporting-Endpoints header",
      ).toBeDefined();
      expect(reportingEndpoints!.value).toBe(`csp-endpoint="${reportUri}"`);
    });
  });

  describe("apps/web/index.html (fallback meta CSP)", () => {
    const csp = parseCsp(readMetaCsp());

    it.each(REQUIRED_CONNECT_SRC)("connect-src includes %s", (host) => {
      expect(csp["connect-src"]).toContain(host);
    });

    it.each(REQUIRED_SCRIPT_SRC)("script-src includes %s", (host) => {
      expect(csp["script-src"]).toContain(host);
    });

    it.each(FORBIDDEN_BARE_SOURCES)(
      "connect-src excludes bare wildcard %s",
      (token) => {
        expect(csp["connect-src"]).not.toContain(token);
      },
    );
  });

  describe("parity between vercel.json and meta fallback", () => {
    const metaCsp = parseCsp(readMetaCsp());

    // The HTML spec disallows `report-uri`, `report-to`, `frame-ancestors`,
    // and `sandbox` inside `<meta http-equiv>`; the meta tag is allowed to
    // be a strict subset of the response-header policy on those keys
    // only. Everything else must match byte-for-byte (modulo source
    // ordering).
    const META_NOT_ALLOWED = new Set([
      "report-uri",
      "report-to",
      "frame-ancestors",
      "sandbox",
    ]);

    // Per-directive parity now lives in the S11 block below, anchored on the
    // ENFORCED header. What stays here is the one property that block cannot
    // express as cleanly: the meta fallback must never grant an origin that
    // the enforced policy withholds — dev loopback origins excepted.
    it("meta CSP grants nothing beyond the enforced policy + dev loopback", () => {
      const enforced = parseCsp(readVercelCsp());
      for (const [directive, sources] of Object.entries(metaCsp)) {
        if (META_NOT_ALLOWED.has(directive)) continue;
        const enforcedSources = enforced[directive] ?? [];
        for (const src of sources) {
          if (META_DEV_ONLY_SOURCES.has(src)) continue;
          expect(
            enforcedSources,
            `meta CSP ${directive} grants ${src}, which the enforced policy does not`,
          ).toContain(src);
        }
      }
    });
  });

  /**
   * S11 — full directive-set parity.
   *
   * The narrower parity block above only spot-checks `connect-src` and
   * `script-src`. This block verifies that every comparable directive
   * is set-equal between the Vercel response header and the `<meta>`
   * fallback — catching silent drift when a new directive (e.g.
   * `style-src`, `img-src`, `font-src`) receives a new source in one
   * location but not the other.
   *
   * Uses `parseCsp` from `./helpers/parseCsp.ts` which returns a proper
   * `Map<directive, Set<source>>` for clean set-equality assertions.
   */
  describe("S11: full directive-set parity (vercel.json ↔ index.html meta)", () => {
    // Parse both CSP strings with the shared helper so assertions use
    // Set semantics (source order does not matter).
    const vercelMap = parseCspToMap(readVercelCsp());
    const metaMap = parseCspToMap(readMetaCsp());

    // Directives forbidden inside <meta http-equiv="Content-Security-Policy">
    // by the HTML Living Standard §7.10. The meta tag is allowed to omit
    // these; every other directive must be set-equal.
    const META_FORBIDDEN = new Set([
      "report-uri",
      "report-to",
      "frame-ancestors",
      "sandbox",
    ]);

    // Collect the comparable directives: everything in vercel that the meta
    // tag is allowed to carry.
    const comparableDirectives = [...vercelMap.keys()].filter(
      (d) => !META_FORBIDDEN.has(d),
    );

    it("meta CSP contains every comparable directive present in vercel CSP", () => {
      for (const directive of comparableDirectives) {
        expect(
          metaMap.has(directive),
          `meta CSP is missing directive "${directive}" that vercel.json carries`,
        ).toBe(true);
      }
    });

    it("meta CSP has no extra directives absent from vercel CSP (excluding HTML-spec exclusions)", () => {
      for (const directive of metaMap.keys()) {
        if (META_FORBIDDEN.has(directive)) continue;
        expect(
          vercelMap.has(directive),
          `meta CSP carries directive "${directive}" that vercel.json does not`,
        ).toBe(true);
      }
    });

    it.each(comparableDirectives)(
      'directive "%s" — source list matches the enforced policy (modulo dev-only origins)',
      (directive) => {
        const vercelSources = vercelMap.get(directive) ?? new Set<string>();
        const metaSources = metaMap.get(directive) ?? new Set<string>();

        // Everything the meta tag allows must either be allowed by the
        // enforced policy or be an explicitly-listed loopback dev origin.
        const metaExtras = [...metaSources].filter(
          (src) => !vercelSources.has(src) && !META_DEV_ONLY_SOURCES.has(src),
        );
        expect(
          metaExtras,
          `"${directive}": meta allows sources the enforced policy does not`,
        ).toEqual([]);

        // And it must not silently drop a source the enforced policy grants —
        // that would make local preview fail in ways production never does.
        const metaMissing = [...vercelSources].filter(
          (src) => !metaSources.has(src),
        );
        expect(
          metaMissing,
          `"${directive}": meta is missing sources the enforced policy grants`,
        ).toEqual([]);
      },
    );

    it.each(comparableDirectives)(
      'directive "%s" — meta carries no unsafe keyword the enforced policy dropped',
      (directive) => {
        const vercelSources = vercelMap.get(directive) ?? new Set<string>();
        const metaSources = metaMap.get(directive) ?? new Set<string>();
        // The regression this whole file exists to catch: a fallback policy
        // that is WEAKER than the one production enforces.
        const weakening = [...metaSources].filter(
          (src) => UNSAFE_KEYWORDS.has(src) && !vercelSources.has(src),
        );
        expect(
          weakening,
          `"${directive}": meta fallback is weaker than the enforced policy`,
        ).toEqual([]);
      },
    );
  });
});
