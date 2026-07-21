import type { NextFunction, Request, Response } from "express";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  loggerWarn: vi.fn(),
}));

vi.mock("../env.js", () => ({
  env: {
    REQUEST_TIMEOUT_MS: 25,
  },
}));

vi.mock("../obs/logger.js", () => ({
  logger: {
    warn: mocks.loggerWarn,
  },
}));

import { requestTimeout } from "./timeout.js";

type ResponseEvent = "finish" | "close";

function makeHarness({ headersSent = false }: { headersSent?: boolean } = {}) {
  const events = new Map<ResponseEvent, () => void>();
  const originalStatus = vi.fn(function status(_code: number) {
    return res;
  });
  const originalJson = vi.fn(function json(_body: unknown) {
    return res;
  });
  const originalSend = vi.fn(function send(_body: unknown) {
    return res;
  });
  const originalEnd = vi.fn(function end() {
    return res;
  });
  const req = {
    destroy: vi.fn(),
    id: "req-1",
    method: "POST",
    path: "/slow",
  } as unknown as Request;
  const res = {
    headersSent,
    status: originalStatus,
    json: originalJson,
    send: originalSend,
    end: originalEnd,
    on: vi.fn((event: ResponseEvent, cb: () => void) => {
      events.set(event, cb);
      return res;
    }),
  } as unknown as Response;
  const next = vi.fn() as NextFunction;
  return { events, next, originalEnd, originalJson, originalSend, req, res };
}

describe("requestTimeout", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    mocks.loggerWarn.mockClear();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("is a no-op middleware when timeout is disabled", () => {
    const { next, req, res } = makeHarness();

    requestTimeout(0)(req, res, next);
    vi.advanceTimersByTime(1_000);

    expect(next).toHaveBeenCalledTimes(1);
    expect(res.status).not.toHaveBeenCalled();
  });

  it("marks a 408 timeout response and destroys the request", () => {
    const { next, req, res } = makeHarness();

    requestTimeout(10)(req, res, next);
    vi.advanceTimersByTime(10);

    expect(next).toHaveBeenCalledTimes(1);
    expect(mocks.loggerWarn).toHaveBeenCalledWith({
      msg: "request_timeout",
      method: "POST",
      path: "/slow",
      timeoutMs: 10,
      requestId: "req-1",
    });
    expect(res.status).toHaveBeenCalledWith(408);
    expect(req.destroy).toHaveBeenCalledTimes(1);
  });

  it("does not send a second response when headers were already sent", () => {
    const { originalJson, req, res, next } = makeHarness({ headersSent: true });

    requestTimeout(10)(req, res, next);
    vi.advanceTimersByTime(10);

    expect(next).toHaveBeenCalledTimes(1);
    expect(res.status).not.toHaveBeenCalled();
    expect(originalJson).not.toHaveBeenCalled();
    expect(req.destroy).toHaveBeenCalledTimes(1);
  });

  it("clears the timer when the response finishes or closes", () => {
    const finishHarness = makeHarness();
    requestTimeout(10)(
      finishHarness.req,
      finishHarness.res,
      finishHarness.next,
    );
    finishHarness.events.get("finish")?.();
    vi.advanceTimersByTime(10);
    expect(finishHarness.res.status).not.toHaveBeenCalled();

    const closeHarness = makeHarness();
    requestTimeout(10)(closeHarness.req, closeHarness.res, closeHarness.next);
    closeHarness.events.get("close")?.();
    vi.advanceTimersByTime(10);
    expect(closeHarness.res.status).not.toHaveBeenCalled();
  });

  it("suppresses late json/send/end writes after a timeout fired", () => {
    const { originalEnd, originalJson, originalSend, req, res, next } =
      makeHarness();

    requestTimeout(10)(req, res, next);
    vi.advanceTimersByTime(10);
    expect(originalJson).not.toHaveBeenCalled();

    res.json({ late: true });
    res.send("late");
    res.end();

    expect(originalJson).not.toHaveBeenCalled();
    expect(originalSend).not.toHaveBeenCalled();
    expect(originalEnd).not.toHaveBeenCalled();
  });
});
