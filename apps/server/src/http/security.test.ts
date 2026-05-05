import { afterEach, beforeEach, describe, it, expect } from "vitest";
import { buildApiCspDirectives, apiHelmetMiddleware } from "./security.js";

describe("buildApiCspDirectives", () => {
  const d = buildApiCspDirectives();

  it("default-src заблоковано", () => {
    expect(d.defaultSrc).toEqual(["'none'"]);
  });

  it("frame-ancestors блокує clickjacking", () => {
    expect(d.frameAncestors).toEqual(["'none'"]);
  });

  it("base-uri заборонено", () => {
    expect(d.baseUri).toEqual(["'none'"]);
  });

  it("form-action заборонено", () => {
    expect(d.formAction).toEqual(["'none'"]);
  });

  it("script-src і style-src повністю заблоковано (API не віддає HTML)", () => {
    expect(d.scriptSrc).toEqual(["'none'"]);
    expect(d.styleSrc).toEqual(["'none'"]);
  });

  it("connect-src 'self' — дозволяє preflight з того самого origin", () => {
    expect(d.connectSrc).toEqual(["'self'"]);
  });

  it("img-src дозволяє data: (favicon, inline error pages)", () => {
    expect(d.imgSrc).toContain("'self'");
    expect(d.imgSrc).toContain("data:");
  });
});

describe("apiHelmetMiddleware", () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function captureCsp(middleware: (...args: any[]) => void) {
    let csp: { name: string; value: string } | undefined;
    const res = {
      setHeader(name: string, value: string) {
        if (/content-security-policy/i.test(name)) csp = { name, value };
      },
      getHeader() {},
      removeHeader() {},
    };
    middleware({ method: "GET", headers: {} }, res, () => {});
    return csp;
  }

  /**
   * Captures every `res.setHeader(name, value)` call the middleware makes,
   * keyed by lower-cased header name (so the test does not depend on
   * Helmet's canonicalisation choosing `X-DNS-Prefetch-Control` vs
   * `x-dns-prefetch-control`). Helmet's default headers include:
   *   - `X-Content-Type-Options: nosniff` (`noSniff: true` default — L6)
   *   - `X-DNS-Prefetch-Control: off` (`dnsPrefetchControl: { allow: false }`
   *     default — L5)
   * Both are regression-locked below so a future Helmet upgrade or a
   * misconfigured option (e.g. `noSniff: false`) trips CI.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function captureHeaders(middleware: (...args: any[]) => void) {
    const headers = new Map<string, string>();
    const res = {
      setHeader(name: string, value: string) {
        headers.set(name.toLowerCase(), String(value));
      },
      getHeader() {},
      removeHeader() {},
    };
    middleware({ method: "GET", headers: {} }, res, () => {});
    return headers;
  }

  it("API-only (default) → виставляє строгу CSP", () => {
    const csp = captureCsp(apiHelmetMiddleware());
    expect(csp).toBeTruthy();
    expect(csp!.name).toBe("Content-Security-Policy");
    expect(String(csp!.value)).toContain("default-src 'none'");
    expect(String(csp!.value)).toContain("script-src 'none'");
  });

  it("servesFrontend=true → CSP вимкнена (не ламає SPA на Replit)", () => {
    const csp = captureCsp(apiHelmetMiddleware({ servesFrontend: true }));
    expect(csp).toBeUndefined();
  });

  // M1 — `docs/security/hardening/M1-csp-disable-runtime-flag.md`
  // CSP_DISABLE=1 більше не існує. Хто б його не виставив у env, CSP
  // мусить лишатись активною. Це регресія-захист — щоб ніхто випадково
  // не повернув kill-switch без code-review.
  describe("M1 — CSP_DISABLE runtime flag removal", () => {
    let originalDisable: string | undefined;
    let originalReportOnly: string | undefined;

    beforeEach(() => {
      originalDisable = process.env.CSP_DISABLE;
      originalReportOnly = process.env.CSP_REPORT_ONLY;
      delete process.env.CSP_DISABLE;
      delete process.env.CSP_REPORT_ONLY;
    });
    afterEach(() => {
      if (originalDisable === undefined) delete process.env.CSP_DISABLE;
      else process.env.CSP_DISABLE = originalDisable;
      if (originalReportOnly === undefined) delete process.env.CSP_REPORT_ONLY;
      else process.env.CSP_REPORT_ONLY = originalReportOnly;
    });

    it("CSP_DISABLE=1 НЕ вимикає CSP (kill-switch видалено)", () => {
      process.env.CSP_DISABLE = "1";
      const csp = captureCsp(apiHelmetMiddleware());
      expect(csp).toBeTruthy();
      expect(String(csp!.value)).toContain("default-src 'none'");
    });

    it("CSP_DISABLE=true (legacy truthy) НЕ вимикає CSP", () => {
      process.env.CSP_DISABLE = "true";
      const csp = captureCsp(apiHelmetMiddleware());
      expect(csp).toBeTruthy();
    });

    it("CSP_REPORT_ONLY=1 → переводить у Report-Only header", () => {
      process.env.CSP_REPORT_ONLY = "1";
      const csp = captureCsp(apiHelmetMiddleware());
      expect(csp).toBeTruthy();
      expect(csp!.name).toBe("Content-Security-Policy-Report-Only");
    });

    it("CSP_DISABLE=1 + CSP_REPORT_ONLY=1 → CSP активна у Report-Only (kill-switch ігнорується)", () => {
      process.env.CSP_DISABLE = "1";
      process.env.CSP_REPORT_ONLY = "1";
      const csp = captureCsp(apiHelmetMiddleware());
      expect(csp).toBeTruthy();
      expect(csp!.name).toBe("Content-Security-Policy-Report-Only");
    });
  });

  // L5 — `docs/security/hardening/L5-dns-prefetch-control.md`
  // L6 — `docs/security/hardening/L6-no-sniff-explicit.md`
  // The audit caught both as "explicit assertion" items: Helmet ships them
  // by default, but a future option override (`noSniff: false`,
  // `dnsPrefetchControl: { allow: true }`) would silently downgrade the
  // posture without a test failure. These cases lock the defaults.
  describe("L5 + L6 — explicit response-header defaults", () => {
    it("L6 — sets X-Content-Type-Options: nosniff on API responses", () => {
      const headers = captureHeaders(apiHelmetMiddleware());
      expect(headers.get("x-content-type-options")).toBe("nosniff");
    });

    it("L5 — sets X-DNS-Prefetch-Control: off on API responses", () => {
      const headers = captureHeaders(apiHelmetMiddleware());
      expect(headers.get("x-dns-prefetch-control")).toBe("off");
    });

    it("L5 + L6 — same defaults still apply on the Replit servesFrontend mode", () => {
      // The Replit-mode disables CSP (the SPA needs inline scripts) but the
      // sniff/prefetch defaults must keep firing because they cost the SPA
      // nothing and protect text/* responses (e.g. health endpoints) from
      // MIME-confusion attacks regardless of CSP state.
      const headers = captureHeaders(
        apiHelmetMiddleware({ servesFrontend: true }),
      );
      expect(headers.get("x-content-type-options")).toBe("nosniff");
      expect(headers.get("x-dns-prefetch-control")).toBe("off");
    });
  });
});
