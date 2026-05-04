import { describe, it, expect, beforeEach, vi } from "vitest";

vi.mock("../../obs/metrics.js", () => ({
  syncV1LegacyClientsTotal: { inc: vi.fn() },
}));

import { syncV1LegacyClientsTotal } from "../../obs/metrics.js";
import {
  __resetKnownVersionsForTest,
  classifyUserAgent,
  classifyV1SyncOp,
  extractAppVersion,
  v1ClientSurveyMiddleware,
} from "./clientSurvey.js";

const incMock = syncV1LegacyClientsTotal.inc as unknown as ReturnType<
  typeof vi.fn
>;

beforeEach(() => {
  incMock.mockClear();
  __resetKnownVersionsForTest();
});

describe("classifyUserAgent", () => {
  it.each([
    [
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
      "web",
    ],
    [
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Firefox/120.0",
      "web",
    ],
    ["okhttp/4.12.0", "mobile-rn"],
    ["Sergeant/1.4.2 CFNetwork/1492.0.1 Darwin/22.6.0", "mobile-rn"],
    [
      "Mozilla/5.0 (Linux; Android 14; SM-G991B; wv) AppleWebKit/537.36 Chrome/120.0 Capacitor/6.0",
      "mobile-shell-android",
    ],
    [
      "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Capacitor/6.0",
      "mobile-shell-ios",
    ],
    ["curl/8.4.0", "other"],
    [undefined, "other"],
    [null, "other"],
    ["", "other"],
  ])("%s → %s", (ua, expected) => {
    expect(classifyUserAgent(ua)).toBe(expected);
  });

  it("safari without cfnetwork is NOT mobile-rn (false-positive guard)", () => {
    // Desktop Safari has CFNetwork but also "Safari" — must classify as web.
    const ua =
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15";
    expect(classifyUserAgent(ua)).toBe("web");
  });
});

describe("extractAppVersion", () => {
  it("normalizes major.minor.patch → major.minor", () => {
    expect(extractAppVersion({ headers: { "x-app-version": "1.4.2" } })).toBe(
      "1.4",
    );
  });

  it("accepts major.minor without patch", () => {
    expect(extractAppVersion({ headers: { "x-app-version": "2.0" } })).toBe(
      "2.0",
    );
  });

  it("strips pre-release / build suffix", () => {
    expect(
      extractAppVersion({ headers: { "x-app-version": "1.4.2-beta.1" } }),
    ).toBe("1.4");
    expect(
      extractAppVersion({ headers: { "x-app-version": "1.4.2+build.42" } }),
    ).toBe("1.4");
  });

  it("returns 'unknown' when header missing or not a semver", () => {
    expect(extractAppVersion({ headers: {} })).toBe("unknown");
    expect(extractAppVersion({ headers: { "x-app-version": "v1.4" } })).toBe(
      "unknown",
    );
    expect(extractAppVersion({ headers: { "x-app-version": "garbage" } })).toBe(
      "unknown",
    );
  });

  it("treats array-valued header as the first element", () => {
    expect(
      extractAppVersion({
        headers: {
          "x-app-version": ["1.5.0", "2.0.0"] as unknown as string,
        },
      }),
    ).toBe("1.5");
  });

  it("caps cardinality at KNOWN_VERSION_LIMIT (20)", () => {
    for (let i = 0; i < 20; i++) {
      const major = Math.floor(i / 10) + 1;
      const minor = i % 10;
      expect(
        extractAppVersion({
          headers: { "x-app-version": `${major}.${minor}.0` },
        }),
      ).toBe(`${major}.${minor}`);
    }
    // 21st distinct version goes to "old" bucket
    expect(extractAppVersion({ headers: { "x-app-version": "9.9.9" } })).toBe(
      "old",
    );
    // Already-seen version still resolves normally
    expect(extractAppVersion({ headers: { "x-app-version": "1.0.42" } })).toBe(
      "1.0",
    );
  });
});

describe("classifyV1SyncOp", () => {
  it.each([
    ["/api/sync/push", "push"],
    ["/api/sync/pull", "pull"],
    ["/api/sync/push-all", "push_all"],
    ["/api/sync/pull-all", "pull_all"],
    ["/api/sync/audit", null],
    ["/api/v2/sync/push", null],
    ["/api/healthz", null],
  ])("%s → %s", (path, expected) => {
    expect(classifyV1SyncOp(path)).toBe(expected);
  });
});

type FakeReq = {
  path: string;
  headers: Record<string, string | undefined>;
};

function fakeReq(path: string, headers: Record<string, string> = {}): FakeReq {
  return { path, headers };
}

describe("v1ClientSurveyMiddleware", () => {
  it("emits one inc per matching v1 op with correct labels", () => {
    const mw = v1ClientSurveyMiddleware();
    const next = vi.fn();
    mw(
      fakeReq("/api/sync/push", {
        "user-agent": "okhttp/4.12.0",
        "x-app-version": "2.1.0",
      }) as unknown as Parameters<typeof mw>[0],
      {} as unknown as Parameters<typeof mw>[1],
      next,
    );
    expect(next).toHaveBeenCalledOnce();
    expect(incMock).toHaveBeenCalledWith({
      user_agent_class: "mobile-rn",
      app_version: "2.1",
      op: "push",
    });
  });

  it("does NOT inc for /api/sync/audit (read-only, not a sync op)", () => {
    const mw = v1ClientSurveyMiddleware();
    const next = vi.fn();
    mw(
      fakeReq("/api/sync/audit", {
        "user-agent": "Mozilla/5.0 Chrome/120.0",
      }) as unknown as Parameters<typeof mw>[0],
      {} as unknown as Parameters<typeof mw>[1],
      next,
    );
    expect(next).toHaveBeenCalledOnce();
    expect(incMock).not.toHaveBeenCalled();
  });

  it("uses 'unknown' app_version when header is missing", () => {
    const mw = v1ClientSurveyMiddleware();
    const next = vi.fn();
    mw(
      fakeReq("/api/sync/pull", {
        "user-agent":
          "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/120.0",
      }) as unknown as Parameters<typeof mw>[0],
      {} as unknown as Parameters<typeof mw>[1],
      next,
    );
    expect(incMock).toHaveBeenCalledWith({
      user_agent_class: "web",
      app_version: "unknown",
      op: "pull",
    });
  });

  it("survives metric throws without breaking the request", () => {
    incMock.mockImplementationOnce(() => {
      throw new Error("metric backend down");
    });
    const mw = v1ClientSurveyMiddleware();
    const next = vi.fn();
    mw(
      fakeReq("/api/sync/push", {
        "user-agent": "okhttp/4.12.0",
        "x-app-version": "1.0.0",
      }) as unknown as Parameters<typeof mw>[0],
      {} as unknown as Parameters<typeof mw>[1],
      next,
    );
    // Even though inc threw, next() still ran exactly once.
    expect(next).toHaveBeenCalledOnce();
  });
});
