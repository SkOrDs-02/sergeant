/**
 * Проби (`/health`, `/readyz`, `/livez`) не пишуть access-log і не входять у
 * лічильники запитів, але їх латентність мусить потрапляти в
 * `http_request_duration_ms`: з неї рахується `job:health_p95_5m`, вхід
 * алерту `BackendHealthP95High`. До 2026-10-08 ранній `return` пропускав
 * і гістограму.
 */
import { EventEmitter } from "node:events";
import type { NextFunction, Request, Response } from "express";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { logger } from "../obs/logger.js";
import {
  httpRequestDurationMs,
  httpRequestsTotal,
  register,
} from "../obs/metrics.js";
import { requestLogMiddleware } from "./requestLog.js";

function fakeReq(url: string, routePath?: string): Request {
  return {
    originalUrl: url,
    method: "GET",
    baseUrl: "",
    route: routePath ? { path: routePath } : undefined,
    ip: "127.0.0.1",
    get: () => undefined,
  } as unknown as Request;
}

function fakeRes(statusCode = 200): Response & EventEmitter {
  const res = new EventEmitter() as Response & EventEmitter;
  res.statusCode = statusCode;
  res.getHeader = (() => undefined) as Response["getHeader"];
  return res;
}

async function histogramCount(path: string): Promise<number> {
  const { values } = await httpRequestDurationMs.get();
  return values
    .filter(
      (v) =>
        v.metricName === "http_request_duration_ms_count" &&
        v.labels.path === path,
    )
    .reduce((sum, v) => sum + v.value, 0);
}

async function requestsTotal(path: string): Promise<number> {
  const { values } = await httpRequestsTotal.get();
  return values
    .filter((v) => v.labels.path === path)
    .reduce((sum, v) => sum + v.value, 0);
}

function run(req: Request, res: Response): NextFunction {
  const next = vi.fn();
  requestLogMiddleware(req, res, next);
  return next;
}

describe("requestLogMiddleware — проби", () => {
  beforeEach(() => {
    register.resetMetrics();
    vi.restoreAllMocks();
  });

  it.each(["/health", "/readyz", "/livez"])(
    "%s пише семпл у гістограму латентності",
    async (url) => {
      const res = fakeRes(200);
      const next = run(fakeReq(url, url), res);
      res.emit("finish");

      expect(next).toHaveBeenCalledOnce();
      expect(await histogramCount(url)).toBe(1);
    },
  );

  it("проба не пише access-log і не рахується в http_requests_total", async () => {
    const info = vi.spyOn(logger, "info");
    const res = fakeRes(200);
    run(fakeReq("/health", "/health"), res);
    res.emit("finish");

    expect(info).not.toHaveBeenCalled();
    expect(await requestsTotal("/health")).toBe(0);
  });

  it("503 від проби потрапляє в гістограму з status_class 5xx", async () => {
    const res = fakeRes(503);
    run(fakeReq("/health", "/health"), res);
    res.emit("finish");

    const { values } = await httpRequestDurationMs.get();
    const count = values.find(
      (v) =>
        v.metricName === "http_request_duration_ms_count" &&
        v.labels.path === "/health",
    );
    expect(count?.labels.status_class).toBe("5xx");
    expect(count?.value).toBe(1);
  });

  it("звичайний запит і далі пише лог і обидві метрики", async () => {
    const info = vi.spyOn(logger, "info").mockImplementation(() => undefined);
    const res = fakeRes(200);
    run(fakeReq("/api/me", "/api/me"), res);
    res.emit("finish");

    expect(info).toHaveBeenCalledOnce();
    expect(await requestsTotal("/api/me")).toBe(1);
    expect(await histogramCount("/api/me")).toBe(1);
  });

  it("статика не пише ні логу, ні метрик", async () => {
    const info = vi.spyOn(logger, "info");
    const res = fakeRes(200);
    run(fakeReq("/assets/index.js"), res);
    res.emit("finish");

    expect(info).not.toHaveBeenCalled();
    const { values } = await httpRequestDurationMs.get();
    expect(
      values.filter((v) => v.metricName === "http_request_duration_ms_count"),
    ).toHaveLength(0);
  });
});
