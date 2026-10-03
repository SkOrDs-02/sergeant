/**
 * Last validated: 2026-09-11
 * Status: Active
 *
 * A3: класифікація причин недоступності. Головне тут — не покриття
 * гілок, а один інваріант: **дві природи відмови не зливаються**.
 */
import { describe, expect, it } from "vitest";
import { ApiError } from "@sergeant/api-client";

import { resolveDenial, isSignInFixable } from "./accessDenial";

function httpError(
  status: number,
  body?: unknown,
  extra: { retryAfterMs?: number } = {},
): ApiError {
  return new ApiError({
    kind: "http",
    message: `HTTP ${status}`,
    status,
    body,
    url: "/api/test",
    ...extra,
  });
}

describe("resolveDenial", () => {
  it("reads 401 as «треба увійти»", () => {
    expect(resolveDenial(httpError(401, { code: "UNAUTHORIZED" }))).toEqual({
      reason: "sign-in-required",
    });
  });

  it("reads 401 without a body too — not every route sends one", () => {
    // `requireSession` на частині маршрутів віддає голий 401 без тіла
    // (`apps/server/src/http/requireSession.ts:112-119`), тож статус
    // мусить лишатись робочим фолбеком.
    expect(resolveDenial(httpError(401))).toEqual({
      reason: "sign-in-required",
    });
  });

  it("keeps «потрібен план» separate from «треба увійти»", () => {
    // ЦЕ головний інваріант модуля. Фото їжі за ADR-0068 має для Free
    // рівно 0 спроб; пропонувати тут вхід означало б пропонувати його
    // тому, хто вже увійшов.
    const denial = resolveDenial(
      httpError(402, { code: "PLAN_REQUIRED", requiredPlan: "pro" }),
    );
    expect(denial).toEqual({ reason: "plan-required", requiredPlan: "pro" });
    expect(isSignInFixable(denial!)).toBe(false);
  });

  it("keeps «не той акаунт» separate as well", () => {
    const denial = resolveDenial(httpError(403, { error: "Forbidden" }));
    expect(denial).toEqual({ reason: "wrong-account" });
    expect(isSignInFixable(denial!)).toBe(false);
  });

  it("reads the AI quota as its own reason, not as a rate limit", () => {
    expect(
      resolveDenial(httpError(429, { code: "AI_QUOTA", limit: 20 })),
    ).toEqual({ reason: "quota-exhausted", limit: 20, preset: false });
  });

  it("marks the profile-preset quota apart — it has its own way out", () => {
    // «Дозаповни вручну в Профілі, це безкоштовно» — інша дія, ніж
    // «спробуй завтра», тож причина мусить нести цю різницю.
    expect(
      resolveDenial(httpError(429, { code: "AI_QUOTA_PRESET", limit: 3 })),
    ).toEqual({ reason: "quota-exhausted", limit: 3, preset: true });
  });

  it("reads gateway failures as «провайдер лежить», with the retry hint", () => {
    expect(
      resolveDenial(httpError(503, null, { retryAfterMs: 12_000 })),
    ).toEqual({ reason: "provider-down", retryAfterMs: 12_000 });
  });

  it("does not claim a plain 429 is an AI quota", () => {
    // Звичайний rate-limit має власний текст із часом очікування
    // (`friendlyApiError`), і підміняти його квотою не можна.
    expect(
      resolveDenial(httpError(429, { error: "Забагато запитів" })),
    ).toBeNull();
  });

  it("returns null for errors that are not about access at all", () => {
    expect(resolveDenial(httpError(500))).toBeNull();
    expect(resolveDenial(httpError(413))).toBeNull();
    expect(resolveDenial(new Error("boom"))).toBeNull();
    expect(resolveDenial(null)).toBeNull();
  });

  it("reads a genuinely offline network error, but not every network error", () => {
    const offline = new ApiError({
      kind: "network",
      message: "Failed to fetch",
      url: "/api/test",
    });
    const wasOnline = navigator.onLine;
    Object.defineProperty(navigator, "onLine", {
      configurable: true,
      value: false,
    });
    try {
      expect(resolveDenial(offline)).toEqual({ reason: "offline" });
    } finally {
      Object.defineProperty(navigator, "onLine", {
        configurable: true,
        value: wasOnline,
      });
    }
  });
});
