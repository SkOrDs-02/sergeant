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
 * 1. The `Content-Security-Policy-Report-Only` response header sent by
 *    Vercel via `apps/web/vercel.json` headers config — the canonical
 *    policy in production.
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
 * This test is the regression guard against both failure modes.
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

function readVercelCsp(): string {
  const cfg = JSON.parse(
    readFileSync(resolve(process.cwd(), "vercel.json"), "utf8"),
  ) as {
    headers: Array<{
      source: string;
      headers: Array<{ key: string; value: string }>;
    }>;
  };
  const wildcard = cfg.headers.find((h) => h.source === "/(.*)");
  if (!wildcard) throw new Error("vercel.json missing wildcard header block");
  const cspHeader = wildcard.headers.find(
    (h) =>
      h.key === "Content-Security-Policy-Report-Only" ||
      h.key === "Content-Security-Policy",
  );
  if (!cspHeader)
    throw new Error("vercel.json wildcard block missing CSP header");
  return cspHeader.value;
}

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
// must be rejected. `wss:` / `ws:` are intentionally permitted today
// (real-time sync + better-auth WebSocket) — see audit-exceptions.md.
const FORBIDDEN_BARE_SOURCES = ["https:", "http:", "*", "data:", "blob:"];

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
      // Allow the documented WebSocket schemes (see audit-exceptions.md
      // "CSP wildcards"), every other source must be either `'self'` or
      // an `https://<vendor>.<host>` URL with at least one literal label.
      const allowedNonHttps = new Set([
        "'self'",
        "http://localhost:3000",
        "http://127.0.0.1:3000",
        "wss:",
        "ws:",
      ]);
      for (const src of csp["connect-src"] ?? []) {
        if (allowedNonHttps.has(src)) continue;
        expect(src).toMatch(/^https:\/\/[^*\s]*\*?\.[a-z0-9.-]+$/i);
      }
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
    const vercelCsp = parseCsp(readVercelCsp());
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

    it("connect-src is identical (set equality)", () => {
      expect(new Set(metaCsp["connect-src"])).toEqual(
        new Set(vercelCsp["connect-src"]),
      );
    });

    it("script-src is identical (set equality)", () => {
      expect(new Set(metaCsp["script-src"])).toEqual(
        new Set(vercelCsp["script-src"]),
      );
    });

    it("meta CSP is a subset of vercel CSP (modulo HTML-spec exclusions)", () => {
      for (const [directive, sources] of Object.entries(metaCsp)) {
        if (META_NOT_ALLOWED.has(directive)) continue;
        const vercelSources = vercelCsp[directive] ?? [];
        for (const src of sources) {
          expect(
            vercelSources,
            `meta CSP ${directive} has source ${src} that vercel.json does not`,
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
      'directive "%s" — source list is set-equal in both policies',
      (directive) => {
        const vercelSources = vercelMap.get(directive) ?? new Set<string>();
        const metaSources = metaMap.get(directive) ?? new Set<string>();
        expect(
          metaSources,
          `"${directive}" source sets differ between meta and vercel.json`,
        ).toEqual(vercelSources);
      },
    );
  });
});
