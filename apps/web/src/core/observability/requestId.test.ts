import { afterEach, describe, expect, it, vi } from "vitest";

import {
  extractRequestId,
  isServerLikeError,
  makeCopyDoneCallback,
} from "./requestId";

describe("requestId helpers", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("extracts non-empty string request ids from duck-typed errors", () => {
    expect(extractRequestId({ requestId: "req_123" })).toBe("req_123");
    expect(extractRequestId({ requestId: "" })).toBeUndefined();
    expect(extractRequestId({ requestId: 123 })).toBeUndefined();
    expect(extractRequestId(new Error("boom"))).toBeUndefined();
    expect(extractRequestId(null)).toBeUndefined();
    expect(extractRequestId("boom")).toBeUndefined();
  });

  it("classifies 5xx status codes as server-like errors", () => {
    expect(isServerLikeError({ status: 500 })).toBe(true);
    expect(isServerLikeError({ status: 599 })).toBe(true);
    expect(isServerLikeError({ status: 499 })).toBe(false);
    expect(isServerLikeError({ status: 600 })).toBe(false);
    expect(isServerLikeError({ status: "500" })).toBe(false);
  });

  it("classifies network and parse kinds as server-like errors", () => {
    expect(isServerLikeError({ kind: "network" })).toBe(true);
    expect(isServerLikeError({ kind: "parse" })).toBe(true);
    expect(isServerLikeError({ kind: "validation" })).toBe(false);
    expect(isServerLikeError(null)).toBe(false);
    expect(isServerLikeError("network")).toBe(false);
  });

  it("builds a copied-state callback that resets after the confirm window", () => {
    vi.useFakeTimers();
    const setState = vi.fn();
    const onDone = makeCopyDoneCallback(setState);

    onDone();

    expect(setState).toHaveBeenCalledTimes(1);
    expect(setState).toHaveBeenLastCalledWith({ copied: true });

    vi.runOnlyPendingTimers();

    expect(setState).toHaveBeenCalledTimes(2);
    expect(setState).toHaveBeenLastCalledWith({ copied: false });
  });
});
