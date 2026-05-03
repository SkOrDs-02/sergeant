import { describe, it, expect } from "vitest";
import { ApiError } from "@shared/api";
import { isRetriableError } from "./queryClient";

describe("isRetriableError", () => {
  const mk = (
    kind: "http" | "network" | "parse" | "aborted",
    status = 0,
  ): ApiError => new ApiError({ kind, message: "x", status, url: "/api/x" });

  it("ретраїть network / parse ApiError", () => {
    expect(isRetriableError(mk("network"))).toBe(true);
    expect(isRetriableError(mk("parse"))).toBe(true);
  });

  it("не ретраїть aborted ApiError (користувач пішов)", () => {
    expect(isRetriableError(mk("aborted"))).toBe(false);
  });

  it("ретраїть HTTP 408 / 429 / 5xx, не ретраїть інші 4xx", () => {
    expect(isRetriableError(mk("http", 408))).toBe(true);
    expect(isRetriableError(mk("http", 429))).toBe(true);
    expect(isRetriableError(mk("http", 500))).toBe(true);
    expect(isRetriableError(mk("http", 502))).toBe(true);
    expect(isRetriableError(mk("http", 599))).toBe(true);

    expect(isRetriableError(mk("http", 400))).toBe(false);
    expect(isRetriableError(mk("http", 401))).toBe(false);
    expect(isRetriableError(mk("http", 403))).toBe(false);
    expect(isRetriableError(mk("http", 404))).toBe(false);
    expect(isRetriableError(mk("http", 422))).toBe(false);
  });

  it("legacy-фолбек: читає .status / .response.status", () => {
    expect(isRetriableError({ status: 500 })).toBe(true);
    expect(isRetriableError({ status: 408 })).toBe(true);
    expect(isRetriableError({ response: { status: 429 } })).toBe(true);
    expect(isRetriableError({ status: 400 })).toBe(false);
    expect(isRetriableError({ response: { status: 404 } })).toBe(false);
  });

  it("невідома форма помилки → ретрай (оптимістично)", () => {
    expect(isRetriableError(new TypeError("Failed to fetch"))).toBe(true);
    expect(isRetriableError("string")).toBe(true);
  });

  it("falsy → не ретраїть", () => {
    expect(isRetriableError(null)).toBe(false);
    expect(isRetriableError(undefined)).toBe(false);
    expect(isRetriableError(0)).toBe(false);
    expect(isRetriableError("")).toBe(false);
  });
});
