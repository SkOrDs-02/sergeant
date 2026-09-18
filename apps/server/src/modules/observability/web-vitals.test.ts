import { describe, it, expect, beforeEach, vi } from "vitest";
import type { Request, Response } from "express";
import webVitalsHandler from "./web-vitals.js";
import {
  register,
  webVitalsCls,
  webVitalsDurationMs,
} from "../../obs/metrics.js";
import { logger } from "../../obs/logger.js";

interface TestRes {
  statusCode: number;
  _body: unknown;
  status(code: number): TestRes;
  json(obj: unknown): TestRes;
  end(): TestRes;
}

function makeRes(): TestRes & Response {
  const res: TestRes = {
    statusCode: 200,
    _body: null,
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(obj: unknown) {
      this._body = obj;
      return this;
    },
    end() {
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

describe("webVitalsHandler", () => {
  beforeEach(() => {
    webVitalsDurationMs.reset();
    webVitalsCls.reset();
  });

  // Method-guard перенесений у роутер (див. server/routes/web-vitals.js:
  // router.post(...)), хендлер більше не відповідає 405.
  it("returns 204 on invalid payload and does not throw", async () => {
    const req = { method: "POST", body: { foo: "bar" } };
    const res = makeRes();
    webVitalsHandler(asReq(req), res);
    expect(res.statusCode).toBe(204);
  });

  it("records LCP/INP/FCP/TTFB into web_vitals_duration_ms", async () => {
    const req = {
      method: "POST",
      body: {
        metrics: [
          { name: "LCP", value: 1200, rating: "good" },
          { name: "INP", value: 250, rating: "needs-improvement" },
          { name: "FCP", value: 900, rating: "good" },
          { name: "TTFB", value: 50, rating: "good" },
        ],
      },
    };
    const res = makeRes();
    webVitalsHandler(asReq(req), res);

    expect(res.statusCode).toBe(204);
    const text = await getMetricText();
    expect(text).toMatch(
      /web_vitals_duration_ms_count\{metric="LCP",rating="good"\} 1/,
    );
    expect(text).toMatch(
      /web_vitals_duration_ms_count\{metric="INP",rating="needs-improvement"\} 1/,
    );
    expect(text).toMatch(
      /web_vitals_duration_ms_count\{metric="FCP",rating="good"\} 1/,
    );
    expect(text).toMatch(
      /web_vitals_duration_ms_count\{metric="TTFB",rating="good"\} 1/,
    );
  });

  it("records CLS into web_vitals_cls with unitless bucketing", async () => {
    const req = {
      method: "POST",
      body: {
        metrics: [
          { name: "CLS", value: 0.08, rating: "good" },
          { name: "CLS", value: 0.3, rating: "poor" },
        ],
      },
    };
    const res = makeRes();
    webVitalsHandler(asReq(req), res);

    expect(res.statusCode).toBe(204);
    const text = await getMetricText();
    expect(text).toMatch(/web_vitals_cls_count\{rating="good"\} 1/);
    expect(text).toMatch(/web_vitals_cls_count\{rating="poor"\} 1/);
  });

  it("rejects value out of range without throwing", async () => {
    const req = {
      method: "POST",
      body: {
        metrics: [{ name: "LCP", value: 999999999, rating: "poor" }],
      },
    };
    const res = makeRes();
    webVitalsHandler(asReq(req), res);

    expect(res.statusCode).toBe(204);
    const text = await getMetricText();
    expect(text).not.toMatch(/web_vitals_duration_ms_count\{metric="LCP"/);
  });

  it("rejects CLS with timing-sized value (separate upper-bound)", async () => {
    // CLS — безрозмірний (0..1+). Зловмисник міг би надіслати value=100000
    // якби max був спільний з таймінгами (120_000ms) — це знищило б
    // `web_vitals_cls_sum` і зробило baseline марним.
    const req = {
      method: "POST",
      body: {
        metrics: [{ name: "CLS", value: 100000, rating: "poor" }],
      },
    };
    const res = makeRes();
    webVitalsHandler(asReq(req), res);

    expect(res.statusCode).toBe(204);
    const text = await getMetricText();
    expect(text).not.toMatch(/web_vitals_cls_count\{rating="poor"\}/);
  });

  it("accepts CLS at realistic upper-bound (value=5)", async () => {
    const req = {
      method: "POST",
      body: {
        metrics: [{ name: "CLS", value: 5, rating: "poor" }],
      },
    };
    const res = makeRes();
    webVitalsHandler(asReq(req), res);

    expect(res.statusCode).toBe(204);
    const text = await getMetricText();
    expect(text).toMatch(/web_vitals_cls_count\{rating="poor"\} 1/);
  });

  it("rejects batch of 11 metrics (enforces max=10)", async () => {
    const metrics = Array.from({ length: 11 }, () => ({
      name: "LCP",
      value: 1000,
      rating: "good",
    }));
    const req = { method: "POST", body: { metrics } };
    const res = makeRes();
    webVitalsHandler(asReq(req), res);

    expect(res.statusCode).toBe(204);
    const text = await getMetricText();
    expect(text).not.toMatch(/web_vitals_duration_ms_count\{metric="LCP"/);
  });

  // M12 — explicit metric-name allowlist + UA normaliser regression. Card
  // recommendation: подивитись, що "evil-metric" не приймається + warn-лог
  // несе нормалізований `ua_family`, не сирий `User-Agent`.
  describe("M12 — payload allowlist and UA normalisation", () => {
    it("rejects metric name outside allowlist (LCP/INP/FCP/TTFB/CLS)", async () => {
      const req = {
        method: "POST",
        body: {
          metrics: [{ name: "evil-metric", value: 100, rating: "good" }],
        },
      };
      const res = makeRes();
      webVitalsHandler(asReq(req), res);

      expect(res.statusCode).toBe(204);
      const text = await getMetricText();
      expect(text).not.toMatch(/web_vitals_duration_ms_count\{metric="evil/);
      expect(text).not.toMatch(/web_vitals_cls_count.*evil/);
    });

    it("warn-логує canonical ua_family (не сирий User-Agent) на invalid payload", async () => {
      // Форсимо лог-ємісію, обходячи Math.random sample-у — наш warn-callback
      // має 1% шанс на викид; тут перехоплюємо щоб тест був детермінованим.
      const warnSpy = vi.spyOn(logger, "warn").mockImplementation(() => {});
      const randomSpy = vi.spyOn(Math, "random").mockReturnValue(0);

      try {
        const req = {
          method: "POST",
          body: { metrics: [{ name: "GARBAGE", value: 1, rating: "x" }] },
          headers: {
            "user-agent":
              "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Safari/605.1.15",
          },
        };
        const res = makeRes();
        webVitalsHandler(asReq(req), res);

        expect(res.statusCode).toBe(204);
        expect(warnSpy).toHaveBeenCalledTimes(1);
        const logged = warnSpy!.mock.calls[0]![0] as {
          msg: string;
          ua_family: string;
        };
        expect(logged.msg).toBe("web_vitals_invalid_payload");
        // Канонічна форма — "safari 17", НЕ сирий UA-string з версією patch.
        expect(logged.ua_family).toBe("safari 17");
      } finally {
        warnSpy.mockRestore();
        randomSpy.mockRestore();
      }
    });

    it("warn-логує ua_family='unknown' на безголовому запиті (без User-Agent)", async () => {
      const warnSpy = vi.spyOn(logger, "warn").mockImplementation(() => {});
      const randomSpy = vi.spyOn(Math, "random").mockReturnValue(0);

      try {
        const req = {
          method: "POST",
          body: { foo: "bar" },
          headers: {},
        };
        const res = makeRes();
        webVitalsHandler(asReq(req), res);

        expect(warnSpy).toHaveBeenCalledTimes(1);
        const logged = warnSpy!.mock.calls[0]![0] as { ua_family: string };
        expect(logged.ua_family).toBe("unknown");
      } finally {
        warnSpy.mockRestore();
        randomSpy.mockRestore();
      }
    });
  });
});
