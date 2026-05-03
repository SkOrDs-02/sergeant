import { ApiError } from "@sergeant/api-client";
import { describe, expect, it } from "vitest";
import { isRetryableError, toSyncError } from "./errorNormalizer";

const makeApi = (init: Partial<ConstructorParameters<typeof ApiError>[0]>) =>
  new ApiError({
    kind: "http",
    message: "x",
    url: "https://example.com/api",
    ...init,
  } as ConstructorParameters<typeof ApiError>[0]);

describe("toSyncError", () => {
  it("classifies network errors as retryable", () => {
    const err = makeApi({ kind: "network", message: "offline" });
    expect(toSyncError(err)).toEqual({
      message: "offline",
      type: "network",
      retryable: true,
    });
  });

  it("classifies aborted errors as network but non-retryable", () => {
    const err = makeApi({ kind: "aborted", message: "cancelled" });
    expect(toSyncError(err)).toEqual({
      message: "cancelled",
      type: "network",
      retryable: false,
    });
  });

  it("marks 5xx responses retryable", () => {
    const err = makeApi({ kind: "http", status: 503, message: "5xx" });
    expect(toSyncError(err)).toEqual({
      message: "5xx",
      type: "server",
      retryable: true,
    });
  });

  it("marks 4xx responses non-retryable", () => {
    const err = makeApi({ kind: "http", status: 404, message: "missing" });
    expect(toSyncError(err)).toEqual({
      message: "missing",
      type: "server",
      retryable: false,
    });
  });

  it("prefers serverMessage over generic message for HTTP errors", () => {
    const err = makeApi({
      kind: "http",
      status: 422,
      message: "fallback",
      body: { error: "Validation failed", requestId: "req-1" },
    });
    expect(toSyncError(err).message).toBe("Validation failed");
  });

  it("falls back to `HTTP <status>` when neither message nor serverMessage is set", () => {
    const err = makeApi({ kind: "http", status: 418, message: "" });
    expect(toSyncError(err).message).toBe("HTTP 418");
  });

  it("classifies parse errors as non-retryable server errors", () => {
    const err = makeApi({ kind: "parse", message: "bad json" });
    expect(toSyncError(err)).toEqual({
      message: "bad json",
      type: "server",
      retryable: false,
    });
  });

  it("classifies plain Error as unknown / non-retryable", () => {
    expect(toSyncError(new Error("boom"))).toEqual({
      message: "boom",
      type: "unknown",
      retryable: false,
    });
  });

  it("uses 'Unknown error' default for Error without message", () => {
    expect(toSyncError(new Error())).toEqual({
      message: "Unknown error",
      type: "unknown",
      retryable: false,
    });
  });

  it("stringifies unknown thrown values", () => {
    expect(toSyncError("string-error")).toEqual({
      message: "string-error",
      type: "unknown",
      retryable: false,
    });
    expect(toSyncError(42)).toEqual({
      message: "42",
      type: "unknown",
      retryable: false,
    });
    expect(toSyncError(null)).toEqual({
      message: "null",
      type: "unknown",
      retryable: false,
    });
  });
});

describe("isRetryableError", () => {
  it("retries network errors", () => {
    expect(isRetryableError(makeApi({ kind: "network", message: "x" }))).toBe(
      true,
    );
  });

  it("retries 5xx HTTP errors", () => {
    expect(
      isRetryableError(makeApi({ kind: "http", status: 500, message: "x" })),
    ).toBe(true);
    expect(
      isRetryableError(makeApi({ kind: "http", status: 599, message: "x" })),
    ).toBe(true);
  });

  it("does not retry 4xx HTTP errors", () => {
    expect(
      isRetryableError(makeApi({ kind: "http", status: 401, message: "x" })),
    ).toBe(false);
    expect(
      isRetryableError(makeApi({ kind: "http", status: 499, message: "x" })),
    ).toBe(false);
  });

  it("does not retry 600+ statuses (defensive)", () => {
    expect(
      isRetryableError(makeApi({ kind: "http", status: 600, message: "x" })),
    ).toBe(false);
  });

  it("does not retry aborted requests", () => {
    expect(isRetryableError(makeApi({ kind: "aborted", message: "x" }))).toBe(
      false,
    );
  });

  it("does not retry parse errors", () => {
    expect(isRetryableError(makeApi({ kind: "parse", message: "x" }))).toBe(
      false,
    );
  });

  it("does not retry plain Errors or unknown values", () => {
    expect(isRetryableError(new Error("boom"))).toBe(false);
    expect(isRetryableError("oops")).toBe(false);
    expect(isRetryableError(undefined)).toBe(false);
  });
});
