import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  startAppleSecretRefresher,
  APPLE_SECRET_REFRESH_INTERVAL_MS,
} from "./appleClientSecretCache.js";

const { loggerMock } = vi.hoisted(() => {
  const loggerMock = { info: vi.fn(), error: vi.fn(), warn: vi.fn() };
  return { loggerMock };
});

vi.mock("../obs/logger.js", () => ({ logger: loggerMock }));

describe("Apple client_secret refresh scheduler", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("does NOT call generateSecret or onNewJwt before the interval fires", () => {
    const generate = vi.fn().mockResolvedValue("jwt-initial");
    const onNewJwt = vi.fn();

    const cleanup = startAppleSecretRefresher(generate, onNewJwt);

    // One millisecond before the threshold — nothing should fire.
    vi.advanceTimersByTime(APPLE_SECRET_REFRESH_INTERVAL_MS - 1);

    expect(generate).not.toHaveBeenCalled();
    expect(onNewJwt).not.toHaveBeenCalled();

    cleanup();
  });

  it("calls generateSecret and onNewJwt once the interval fires", async () => {
    const jwt = "eyJ.fresh.token";
    const generate = vi.fn().mockResolvedValue(jwt);
    const onNewJwt = vi.fn();

    const cleanup = startAppleSecretRefresher(generate, onNewJwt);

    await vi.advanceTimersByTimeAsync(APPLE_SECRET_REFRESH_INTERVAL_MS);

    expect(generate).toHaveBeenCalledOnce();
    expect(onNewJwt).toHaveBeenCalledOnce();
    expect(onNewJwt).toHaveBeenCalledWith(jwt);

    cleanup();
  });

  it("calls onNewJwt on each successive interval tick", async () => {
    const generate = vi
      .fn()
      .mockResolvedValueOnce("jwt-tick-1")
      .mockResolvedValueOnce("jwt-tick-2");
    const onNewJwt = vi.fn();

    const cleanup = startAppleSecretRefresher(generate, onNewJwt);

    await vi.advanceTimersByTimeAsync(APPLE_SECRET_REFRESH_INTERVAL_MS);
    await vi.advanceTimersByTimeAsync(APPLE_SECRET_REFRESH_INTERVAL_MS);

    expect(onNewJwt).toHaveBeenCalledTimes(2);
    expect(onNewJwt).toHaveBeenNthCalledWith(1, "jwt-tick-1");
    expect(onNewJwt).toHaveBeenNthCalledWith(2, "jwt-tick-2");

    cleanup();
  });

  it("logs an error and does NOT call onNewJwt when generateSecret rejects", async () => {
    const generate = vi.fn().mockRejectedValue(new Error("PEM parse failure"));
    const onNewJwt = vi.fn();

    const cleanup = startAppleSecretRefresher(generate, onNewJwt);

    await vi.advanceTimersByTimeAsync(APPLE_SECRET_REFRESH_INTERVAL_MS);

    expect(onNewJwt).not.toHaveBeenCalled();
    expect(loggerMock.error).toHaveBeenCalledWith(
      expect.objectContaining({
        event: "auth.apple.client_secret.refresh_failed",
        err: "PEM parse failure",
      }),
      expect.any(String),
    );

    cleanup();
  });

  it("cleanup() stops the interval — no further calls after it is invoked", async () => {
    const generate = vi.fn().mockResolvedValue("jwt");
    const onNewJwt = vi.fn();

    const cleanup = startAppleSecretRefresher(generate, onNewJwt);
    cleanup();

    // Advance several intervals — nothing should fire.
    await vi.advanceTimersByTimeAsync(APPLE_SECRET_REFRESH_INTERVAL_MS * 3);

    expect(generate).not.toHaveBeenCalled();
    expect(onNewJwt).not.toHaveBeenCalled();
  });
});
