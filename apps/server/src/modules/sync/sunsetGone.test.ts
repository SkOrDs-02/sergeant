import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import type { Request, Response } from "express";

vi.mock("../../obs/logger.js", async () => {
  const actual = await vi.importActual("../../obs/logger.js");
  return {
    ...actual,
    logger: {
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      fatal: vi.fn(),
    },
  };
});

import { logger } from "../../obs/logger.js";
import {
  __resetSunsetSinceCacheForTests,
  resolveSunsetSince,
  respondV1Gone,
} from "./sunsetGone.js";

const infoMock = logger.info as unknown as ReturnType<typeof vi.fn>;
const warnMock = logger.warn as unknown as ReturnType<typeof vi.fn>;

const ORIGINAL_ENV = process.env["CLOUDSYNC_V1_GONE_SINCE"];

beforeEach(() => {
  __resetSunsetSinceCacheForTests();
  infoMock.mockClear();
  warnMock.mockClear();
  delete process.env["CLOUDSYNC_V1_GONE_SINCE"];
});

afterEach(() => {
  if (ORIGINAL_ENV === undefined) {
    delete process.env["CLOUDSYNC_V1_GONE_SINCE"];
  } else {
    process.env["CLOUDSYNC_V1_GONE_SINCE"] = ORIGINAL_ENV;
  }
});

function fakeReq(
  overrides: Partial<Request> & {
    headers?: Record<string, string | string[] | undefined>;
  } = {},
): Request {
  return {
    method: "POST",
    url: "/api/sync/push",
    originalUrl: "/api/sync/push",
    headers: {},
    ...overrides,
  } as unknown as Request;
}

function fakeRes(): {
  res: Response;
  status: ReturnType<typeof vi.fn>;
  json: ReturnType<typeof vi.fn>;
  setHeader: ReturnType<typeof vi.fn>;
} {
  const status = vi.fn();
  const json = vi.fn();
  const setHeader = vi.fn();
  const res = {
    status: status.mockImplementation(() => res),
    json,
    setHeader,
  } as unknown as Response;
  // status() chains to .json(), so make status return the same object.
  (
    status as unknown as { mockReturnValue: (r: Response) => void }
  ).mockReturnValue(res);
  return { res, status, json, setHeader };
}

describe("resolveSunsetSince", () => {
  it("returns 'unknown' when env unset", () => {
    expect(resolveSunsetSince()).toBe("unknown");
  });

  it("returns 'unknown' when env is empty string", () => {
    process.env["CLOUDSYNC_V1_GONE_SINCE"] = "   ";
    __resetSunsetSinceCacheForTests();
    expect(resolveSunsetSince()).toBe("unknown");
  });

  it("returns ISO 8601 string when env is parseable date-only", () => {
    process.env["CLOUDSYNC_V1_GONE_SINCE"] = "2026-05-06";
    __resetSunsetSinceCacheForTests();
    expect(resolveSunsetSince()).toBe("2026-05-06T00:00:00.000Z");
  });

  it("returns ISO 8601 string when env is parseable full timestamp", () => {
    process.env["CLOUDSYNC_V1_GONE_SINCE"] = "2026-05-06T08:00:00Z";
    __resetSunsetSinceCacheForTests();
    expect(resolveSunsetSince()).toBe("2026-05-06T08:00:00.000Z");
  });

  it("returns 'unknown' and warns once when env unparseable", () => {
    process.env["CLOUDSYNC_V1_GONE_SINCE"] = "not-a-date";
    __resetSunsetSinceCacheForTests();
    expect(resolveSunsetSince()).toBe("unknown");
    expect(warnMock).toHaveBeenCalledWith(
      expect.objectContaining({ msg: "cloudsync_v1_gone_since_env_invalid" }),
    );
  });

  it("caches per-process — does not re-parse on subsequent calls", () => {
    process.env["CLOUDSYNC_V1_GONE_SINCE"] = "2026-05-06";
    __resetSunsetSinceCacheForTests();
    resolveSunsetSince();
    resolveSunsetSince();
    resolveSunsetSince();
    expect(warnMock).not.toHaveBeenCalled();
  });
});

describe("respondV1Gone", () => {
  it("returns 410 with stable body shape", () => {
    process.env["CLOUDSYNC_V1_GONE_SINCE"] = "2026-05-06T08:00:00Z";
    __resetSunsetSinceCacheForTests();
    const { res, status, json, setHeader } = fakeRes();
    respondV1Gone(fakeReq(), res);
    expect(status).toHaveBeenCalledWith(410);
    expect(setHeader).toHaveBeenCalledWith("Cache-Control", "no-store");
    expect(json).toHaveBeenCalledWith({
      error: "cloudsync_v1_sunset",
      successor: "/api/v2/sync",
      since: "2026-05-06T08:00:00.000Z",
      guide: "/docs/initiatives/0003-sync-v2-rollout-and-v1-sunset.md",
    });
  });

  it("uses 'unknown' for since when env unset", () => {
    const { res, json } = fakeRes();
    respondV1Gone(fakeReq(), res);
    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({ since: "unknown" }),
    );
  });

  it("logs structured event with userId when available", () => {
    const { res } = fakeRes();
    const req = fakeReq({
      method: "POST",
      url: "/api/sync/push",
      originalUrl: "/api/sync/push",
      headers: {
        "user-agent": "test-ua/1.0",
        "x-app-version": "0.1.0",
      },
    });
    (req as unknown as { user: { id: string } }).user = {
      id: "user_abc123",
    };
    respondV1Gone(req, res);
    expect(infoMock).toHaveBeenCalledWith(
      expect.objectContaining({
        msg: "cloudsync_v1_gone_response",
        path: "/api/sync/push",
        method: "POST",
        userId: "user_abc123",
        userAgent: "test-ua/1.0",
        appVersion: "0.1.0",
      }),
    );
  });

  it("logs null userId when req.user is missing", () => {
    const { res } = fakeRes();
    respondV1Gone(fakeReq(), res);
    expect(infoMock).toHaveBeenCalledWith(
      expect.objectContaining({ userId: null }),
    );
  });

  it("truncates long user-agent and app-version headers", () => {
    const { res } = fakeRes();
    const longUA = "a".repeat(300);
    const longVersion = "v".repeat(100);
    const req = fakeReq({
      headers: {
        "user-agent": longUA,
        "x-app-version": longVersion,
      },
    });
    respondV1Gone(req, res);
    const call = infoMock.mock.calls[0]?.[0];
    expect(call.userAgent).toHaveLength(256);
    expect(call.appVersion).toHaveLength(64);
  });
});
