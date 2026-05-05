import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

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
  __resetSunsetCacheForTest,
  buildLinkHeader,
  parseSunsetEnv,
  v1SunsetHeadersMiddleware,
} from "./sunsetHeaders.js";

const warnMock = logger.warn as unknown as ReturnType<typeof vi.fn>;

const ORIGINAL_ENV = process.env["CLOUDSYNC_V1_SUNSET_AT"];

beforeEach(() => {
  __resetSunsetCacheForTest();
  warnMock.mockClear();
  delete process.env["CLOUDSYNC_V1_SUNSET_AT"];
});

afterEach(() => {
  if (ORIGINAL_ENV === undefined) {
    delete process.env["CLOUDSYNC_V1_SUNSET_AT"];
  } else {
    process.env["CLOUDSYNC_V1_SUNSET_AT"] = ORIGINAL_ENV;
  }
});

describe("parseSunsetEnv", () => {
  it("parses ISO 8601 date-only", () => {
    const r = parseSunsetEnv("2026-12-31");
    expect(r).not.toBeNull();
    // toUTCString format: 'Wed, 31 Dec 2026 00:00:00 GMT'
    expect(r?.httpDate).toMatch(
      /^[A-Z][a-z]{2}, \d{2} [A-Z][a-z]{2} 2026 \d{2}:\d{2}:\d{2} GMT$/,
    );
    expect(r?.httpDate).toContain("Dec 2026");
  });

  it("parses ISO 8601 with time and Z", () => {
    const r = parseSunsetEnv("2027-03-15T12:00:00Z");
    expect(r?.httpDate).toContain("Mar 2027");
    expect(r?.httpDate).toContain("12:00:00 GMT");
  });

  it.each([
    [undefined, null],
    [null, null],
    ["", null],
    ["   ", null],
    ["not-a-date", null],
    ["2026-13-99", null],
  ])("rejects %s", (input, _expected) => {
    expect(parseSunsetEnv(input as unknown as string)).toBeNull();
  });

  it("trims surrounding whitespace", () => {
    const r = parseSunsetEnv("  2026-12-31  ");
    expect(r?.raw).toBe("2026-12-31");
  });
});

describe("buildLinkHeader", () => {
  it("includes successor-version pointing to /api/v2/sync/push", () => {
    const link = buildLinkHeader();
    expect(link).toContain('</api/v2/sync/push>; rel="successor-version"');
  });

  it("includes deprecation pointing to the initiative doc", () => {
    const link = buildLinkHeader();
    expect(link).toContain(
      '</docs/initiatives/0003-sync-v2-rollout-and-v1-sunset.md>; rel="deprecation"',
    );
  });

  it("uses comma-separated form (RFC 8288)", () => {
    const link = buildLinkHeader();
    // Two link-values joined by ", "
    expect(link.split(", ")).toHaveLength(2);
  });
});

type FakeRes = {
  headers: Record<string, string>;
  setHeader: (name: string, value: string) => void;
};

function fakeRes(): FakeRes {
  const headers: Record<string, string> = {};
  return {
    headers,
    setHeader(name, value) {
      headers[name] = value;
    },
  };
}

describe("v1SunsetHeadersMiddleware", () => {
  it("always sets Deprecation: true", () => {
    const mw = v1SunsetHeadersMiddleware();
    const res = fakeRes();
    const next = vi.fn();
    mw(
      {} as unknown as Parameters<typeof mw>[0],
      res as unknown as Parameters<typeof mw>[1],
      next,
    );
    expect(res.headers["Deprecation"]).toBe("true");
    expect(next).toHaveBeenCalledOnce();
  });

  it("always sets Link with both successor-version and deprecation rels", () => {
    const mw = v1SunsetHeadersMiddleware();
    const res = fakeRes();
    mw(
      {} as unknown as Parameters<typeof mw>[0],
      res as unknown as Parameters<typeof mw>[1],
      vi.fn(),
    );
    expect(res.headers["Link"]).toContain('rel="successor-version"');
    expect(res.headers["Link"]).toContain('rel="deprecation"');
  });

  it("does NOT set Sunset when env var is unset", () => {
    const mw = v1SunsetHeadersMiddleware();
    const res = fakeRes();
    mw(
      {} as unknown as Parameters<typeof mw>[0],
      res as unknown as Parameters<typeof mw>[1],
      vi.fn(),
    );
    expect(res.headers["Sunset"]).toBeUndefined();
  });

  it("sets Sunset when env var is a valid ISO date", () => {
    process.env["CLOUDSYNC_V1_SUNSET_AT"] = "2026-12-31";
    __resetSunsetCacheForTest();
    const mw = v1SunsetHeadersMiddleware();
    const res = fakeRes();
    mw(
      {} as unknown as Parameters<typeof mw>[0],
      res as unknown as Parameters<typeof mw>[1],
      vi.fn(),
    );
    expect(res.headers["Sunset"]).toContain("Dec 2026");
    expect(res.headers["Sunset"]).toMatch(/GMT$/);
  });

  it("does NOT set Sunset and warns once when env var is malformed", () => {
    process.env["CLOUDSYNC_V1_SUNSET_AT"] = "garbage";
    __resetSunsetCacheForTest();
    const mw = v1SunsetHeadersMiddleware();
    const res = fakeRes();
    mw(
      {} as unknown as Parameters<typeof mw>[0],
      res as unknown as Parameters<typeof mw>[1],
      vi.fn(),
    );
    expect(res.headers["Sunset"]).toBeUndefined();
    expect(warnMock).toHaveBeenCalledWith(
      expect.objectContaining({ msg: "cloudsync_v1_sunset_env_invalid" }),
    );
  });

  it("does not warn twice for the same env value (cached)", () => {
    process.env["CLOUDSYNC_V1_SUNSET_AT"] = "garbage";
    __resetSunsetCacheForTest();
    const mw = v1SunsetHeadersMiddleware();
    for (let i = 0; i < 5; i++) {
      mw(
        {} as unknown as Parameters<typeof mw>[0],
        fakeRes() as unknown as Parameters<typeof mw>[1],
        vi.fn(),
      );
    }
    expect(warnMock).toHaveBeenCalledTimes(1);
  });

  it("re-resolves cache when env value changes", () => {
    const mw = v1SunsetHeadersMiddleware();

    process.env["CLOUDSYNC_V1_SUNSET_AT"] = "2026-12-31";
    const r1 = fakeRes();
    mw(
      {} as unknown as Parameters<typeof mw>[0],
      r1 as unknown as Parameters<typeof mw>[1],
      vi.fn(),
    );
    expect(r1.headers["Sunset"]).toContain("Dec 2026");

    process.env["CLOUDSYNC_V1_SUNSET_AT"] = "2027-06-15";
    const r2 = fakeRes();
    mw(
      {} as unknown as Parameters<typeof mw>[0],
      r2 as unknown as Parameters<typeof mw>[1],
      vi.fn(),
    );
    expect(r2.headers["Sunset"]).toContain("Jun 2027");
  });

  it("survives setHeader throw without breaking the request", () => {
    const mw = v1SunsetHeadersMiddleware();
    const next = vi.fn();
    const res = {
      setHeader: () => {
        throw new Error("response already sent");
      },
    } as unknown as Parameters<typeof mw>[1];
    mw({} as unknown as Parameters<typeof mw>[0], res, next);
    expect(next).toHaveBeenCalledOnce();
  });
});
