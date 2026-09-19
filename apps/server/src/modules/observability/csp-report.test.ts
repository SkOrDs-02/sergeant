import { describe, it, expect, beforeEach, vi } from "vitest";
import type { Request, Response } from "express";
import cspReportHandler from "./csp-report.js";
import { logger } from "../../obs/logger.js";
import { register, cspViolationTotal } from "../../obs/metrics.js";

interface TestRes {
  statusCode: number;
  ended: boolean;
  status(code: number): TestRes;
  end(): TestRes;
  json(obj: unknown): TestRes;
}

function makeRes(): TestRes & Response {
  const res: TestRes = {
    statusCode: 200,
    ended: false,
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    end() {
      this.ended = true;
      return this;
    },
    json() {
      return this;
    },
  };
  return res as TestRes & Response;
}

function asReq(r: unknown): Request {
  return r as Request;
}

async function getMetricText() {
  return register.metrics();
}

describe("cspReportHandler", () => {
  beforeEach(() => {
    cspViolationTotal.reset();
  });

  it("accepts legacy report-uri envelope and increments the metric", async () => {
    const req = {
      method: "POST",
      body: {
        "csp-report": {
          "violated-directive": "script-src 'self'",
          "blocked-uri": "https://evil.example.com/x.js",
          "document-uri": "https://app.example.com/",
          disposition: "report",
        },
      },
    };
    const res = makeRes();
    cspReportHandler(asReq(req), res);

    expect(res.statusCode).toBe(204);
    expect(res.ended).toBe(true);

    const text = await getMetricText();
    expect(text).toMatch(
      /csp_violation_total\{directive="script-src",disposition="report"\} 1/,
    );
  });

  it("accepts a bare legacy report (no envelope) when fields look like a violation", async () => {
    const req = {
      method: "POST",
      body: {
        "violated-directive": "img-src",
        "blocked-uri": "https://evil.example.com/pix.gif",
      },
    };
    const res = makeRes();
    cspReportHandler(asReq(req), res);

    expect(res.statusCode).toBe(204);
    const text = await getMetricText();
    expect(text).toMatch(
      /csp_violation_total\{directive="img-src",disposition="unknown"\} 1/,
    );
  });

  it("accepts Reporting-API array payload and only counts csp-violation entries", async () => {
    const req = {
      method: "POST",
      body: [
        {
          type: "csp-violation",
          body: {
            effectiveDirective: "connect-src",
            blockedURL: "https://evil.example.com/exfil",
            disposition: "enforce",
          },
        },
        {
          // Different report type shipped via the same Reporting-API
          // delivery — must NOT be counted as a CSP violation.
          type: "deprecation",
          body: { id: "stuff" },
        },
      ],
    };
    const res = makeRes();
    cspReportHandler(asReq(req), res);

    expect(res.statusCode).toBe(204);
    const text = await getMetricText();
    expect(text).toMatch(
      /csp_violation_total\{directive="connect-src",disposition="enforce"\} 1/,
    );
    // No deprecation -> directive=other counter — entry was skipped.
    expect(text).not.toMatch(
      /csp_violation_total\{directive="other",disposition="unknown"\}/,
    );
  });

  it("buckets unknown directives into 'other' so cardinality stays bounded", async () => {
    const req = {
      method: "POST",
      body: {
        "csp-report": {
          "violated-directive": "made-up-directive 'self'",
        },
      },
    };
    const res = makeRes();
    cspReportHandler(asReq(req), res);

    const text = await getMetricText();
    expect(text).toMatch(
      /csp_violation_total\{directive="other",disposition="unknown"\} 1/,
    );
  });

  it("prefers effective-directive over violated-directive when both are present", async () => {
    const req = {
      method: "POST",
      body: {
        "csp-report": {
          "violated-directive": "default-src 'self'",
          "effective-directive": "style-src",
        },
      },
    };
    const res = makeRes();
    cspReportHandler(asReq(req), res);

    const text = await getMetricText();
    expect(text).toMatch(
      /csp_violation_total\{directive="style-src",disposition="unknown"\} 1/,
    );
    // Did not also count under default-src.
    expect(text).not.toMatch(/csp_violation_total\{directive="default-src"/);
  });

  it("returns 204 on missing/garbage payload without throwing", () => {
    for (const body of [undefined, null, "", "raw-string", 42, true]) {
      const req = { method: "POST", body };
      const res = makeRes();
      cspReportHandler(asReq(req), res);
      expect(res.statusCode).toBe(204);
    }
  });

  it("returns 204 on empty array Reporting-API payload", () => {
    const req = { method: "POST", body: [] };
    const res = makeRes();
    cspReportHandler(asReq(req), res);
    expect(res.statusCode).toBe(204);
  });

  describe("редакція URL-полів у sample-лозі", () => {
    /**
     * Sample-лог має 5% шанс на викид — форсимо `Math.random() === 0`, щоб
     * тест був детермінованим, і перехоплюємо `logger.info`, щоб дивитись на
     * той самий обʼєкт, що пішов би в Pino.
     */
    function captureLoggedReport(reportBody: Record<string, unknown>) {
      const infoSpy = vi.spyOn(logger, "info").mockImplementation(() => {});
      const randomSpy = vi.spyOn(Math, "random").mockReturnValue(0);
      try {
        const res = makeRes();
        cspReportHandler(
          asReq({ method: "POST", body: { "csp-report": reportBody } }),
          res,
        );
        expect(res.statusCode).toBe(204);
        expect(infoSpy).toHaveBeenCalledTimes(1);
        return infoSpy.mock.calls[0]![0] as Record<string, unknown>;
      } finally {
        infoSpy.mockRestore();
        randomSpy.mockRestore();
      }
    }

    it("маскує токен скидання пароля в document-uri", () => {
      const logged = captureLoggedReport({
        "violated-directive": "style-src-elem",
        "document-uri":
          "https://app.example.com/reset-password?token=live-secret-abc123&utm=mail",
        "blocked-uri": "inline",
      });

      expect(logged["documentUri"]).toBe(
        "https://app.example.com/reset-password?token=[redacted]&utm=mail",
      );
      // Живий токен не має лишитись у лог-рядку в жодному вигляді.
      expect(JSON.stringify(logged)).not.toContain("live-secret-abc123");
    });

    it("маскує чутливі query-ключі в blocked-uri і source-file теж", () => {
      const logged = captureLoggedReport({
        "violated-directive": "connect-src",
        "blocked-uri": "https://evil.example.com/exfil?access_token=zzz999",
        "source-file": "https://app.example.com/verify?otp=424242",
      });

      expect(logged["blockedUri"]).toBe(
        "https://evil.example.com/exfil?access_token=[redacted]",
      );
      expect(logged["sourceFile"]).toBe(
        "https://app.example.com/verify?otp=[redacted]",
      );
    });

    it("обрізає атакер-контрольований URL до стелі логування", () => {
      const huge = `https://app.example.com/${"a".repeat(16_000)}`;
      const logged = captureLoggedReport({
        "violated-directive": "img-src",
        "blocked-uri": huge,
      });

      const blockedUri = logged["blockedUri"] as string;
      // 512 символів + маркер обрізання — далеко від 16 KB, які пропускає
      // body-parser цього роуту.
      expect(blockedUri.length).toBeLessThan(600);
      expect(blockedUri.endsWith("…[truncated]")).toBe(true);
    });

    it("нормалізує відсутні URL-поля в null, а не в undefined-рядок", () => {
      const logged = captureLoggedReport({
        "violated-directive": "script-src",
      });

      expect(logged["documentUri"]).toBeNull();
      expect(logged["blockedUri"]).toBeNull();
      expect(logged["sourceFile"]).toBeNull();
    });
  });
});
