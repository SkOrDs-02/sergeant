import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Mock } from "vitest";

vi.mock("../obs/metrics.js", () => ({
  externalHttpDurationMs: {
    observe: vi.fn(),
  },
  externalHttpRequestsTotal: {
    inc: vi.fn(),
  },
}));

import {
  externalHttpDurationMs,
  externalHttpRequestsTotal,
} from "../obs/metrics.js";
import { recordExternalHttp } from "./externalHttp.js";

const requestsInc = externalHttpRequestsTotal.inc as Mock;
const durationObserve = externalHttpDurationMs.observe as Mock;

describe("recordExternalHttp", () => {
  beforeEach(() => {
    requestsInc.mockReset();
    durationObserve.mockReset();
  });

  it("increments request count and observes duration when provided", () => {
    recordExternalHttp("monobank", "ok", 42.5);

    expect(requestsInc).toHaveBeenCalledWith({
      upstream: "monobank",
      outcome: "ok",
    });
    expect(durationObserve).toHaveBeenCalledWith(
      { upstream: "monobank", outcome: "ok" },
      42.5,
    );
  });

  it("does not observe duration for nullish timings", () => {
    recordExternalHttp("privatbank", "timeout", null);
    recordExternalHttp("privatbank", "error", undefined);

    expect(requestsInc).toHaveBeenCalledTimes(2);
    expect(durationObserve).not.toHaveBeenCalled();
  });

  it("swallows metric client failures", () => {
    requestsInc.mockImplementationOnce(() => {
      throw new Error("prometheus down");
    });

    expect(() => recordExternalHttp("upstream", "error", 1)).not.toThrow();
  });
});
