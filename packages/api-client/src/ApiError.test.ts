import { describe, it, expect } from "vitest";
import { ApiError, isApiError } from "./ApiError";

describe("ApiError", () => {
  it("витягує serverMessage із body.error", () => {
    const err = new ApiError({
      kind: "http",
      message: "HTTP 500",
      status: 500,
      body: { error: "boom" },
      url: "/api/x",
    });
    expect(err.serverMessage).toBe("boom");
    expect(err.status).toBe(500);
    expect(err.kind).toBe("http");
    expect(err.name).toBe("ApiError");
  });

  it("ігнорує не-рядковий body.error", () => {
    const err = new ApiError({
      kind: "http",
      message: "HTTP 500",
      status: 500,
      body: { error: 42 },
      url: "/api/x",
    });
    expect(err.serverMessage).toBeUndefined();
  });

  it("isAuth=true для 401/403", () => {
    const e401 = new ApiError({
      kind: "http",
      message: "x",
      status: 401,
      url: "/",
    });
    const e403 = new ApiError({
      kind: "http",
      message: "x",
      status: 403,
      url: "/",
    });
    const e500 = new ApiError({
      kind: "http",
      message: "x",
      status: 500,
      url: "/",
    });
    expect(e401.isAuth).toBe(true);
    expect(e403.isAuth).toBe(true);
    expect(e500.isAuth).toBe(false);
  });

  it("isOffline=true лише для network + navigator.onLine=false", () => {
    const originalNavigator = globalThis.navigator;
    const setOnline = (value: boolean) =>
      Object.defineProperty(globalThis, "navigator", {
        value: { onLine: value },
        configurable: true,
        writable: true,
      });

    setOnline(false);
    const netErr = new ApiError({
      kind: "network",
      message: "x",
      url: "/",
    });
    const httpErr = new ApiError({
      kind: "http",
      message: "x",
      status: 500,
      url: "/",
    });
    expect(netErr.isOffline).toBe(true);
    expect(httpErr.isOffline).toBe(false);
    setOnline(true);
    expect(netErr.isOffline).toBe(false);
    Object.defineProperty(globalThis, "navigator", {
      value: originalNavigator,
      configurable: true,
      writable: true,
    });
  });

  it("isApiError type-guard", () => {
    const err = new ApiError({ kind: "network", message: "x", url: "/" });
    expect(isApiError(err)).toBe(true);
    expect(isApiError(new Error("plain"))).toBe(false);
    expect(isApiError(null)).toBe(false);
    expect(isApiError({ kind: "http" })).toBe(false);
  });

  it("retryAfterMs зберігається, якщо > 0", () => {
    // Потрібно, щоб Monobank-pagination міг `if (err.retryAfterMs)` без
    // додаткових null-чеків — нормалізація на рівні конструктора.
    const err = new ApiError({
      kind: "http",
      message: "rate",
      status: 429,
      url: "/api/mono",
      retryAfterMs: 45_000,
    });
    expect(err.retryAfterMs).toBe(45_000);
  });

  it("retryAfterMs=0/негативне/нечислове → undefined", () => {
    const cases: Array<number | undefined> = [0, -1, Number.NaN, undefined];
    for (const v of cases) {
      const err = new ApiError({
        kind: "http",
        message: "x",
        status: 429,
        url: "/",
        retryAfterMs: v,
      });
      expect(err.retryAfterMs).toBeUndefined();
    }
  });
});
