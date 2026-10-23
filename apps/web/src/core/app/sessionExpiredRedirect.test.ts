// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { sessionExpiredRedirectTarget } from "./sessionExpiredRedirect";
import {
  clearSessionExpired,
  markSessionExpired,
} from "../auth/sessionExpiredMarker";

describe("sessionExpiredRedirectTarget (sec-18)", () => {
  beforeEach(() => window.localStorage.clear());
  afterEach(() => window.localStorage.clear());

  it("без маркера анонімний хаб лишається (свідомий вихід / новий пристрій)", () => {
    expect(sessionExpiredRedirectTarget("unauthenticated", "/", "")).toBeNull();
  });

  it("з маркером веде на /sign-in з next на поточний маршрут", () => {
    markSessionExpired();
    expect(
      sessionExpiredRedirectTarget(
        "unauthenticated",
        "/finyk/transactions",
        "",
      ),
    ).toBe("/sign-in?next=%2Ffinyk%2Ftransactions");
    expect(
      sessionExpiredRedirectTarget("unauthenticated", "/", "?tab=profile"),
    ).toBe("/sign-in?next=%2F%3Ftab%3Dprofile");
  });

  it("корінь і /welcome ведуть на чистий /sign-in", () => {
    markSessionExpired();
    expect(sessionExpiredRedirectTarget("unauthenticated", "/", "")).toBe(
      "/sign-in",
    );
    expect(
      sessionExpiredRedirectTarget("unauthenticated", "/welcome", ""),
    ).toBe("/sign-in");
  });

  it("не втручається, поки особистість невідома або сесія жива", () => {
    markSessionExpired();
    expect(sessionExpiredRedirectTarget("loading", "/", "")).toBeNull();
    expect(sessionExpiredRedirectTarget("authenticated", "/", "")).toBeNull();
    expect(
      sessionExpiredRedirectTarget("pending_deletion", "/", ""),
    ).toBeNull();
  });

  it.each([
    "/sign-in",
    "/login",
    "/reset-password",
    "/verify-email",
    "/pricing",
    "/status",
    "/offline",
    "/500",
    "/legal/privacy",
  ])("публічний маршрут %s лишається доступним", (path) => {
    markSessionExpired();
    expect(
      sessionExpiredRedirectTarget("unauthenticated", path, ""),
    ).toBeNull();
  });

  it("після clearSessionExpired (вхід / вихід / пропустити) редіректу нема", () => {
    markSessionExpired();
    clearSessionExpired();
    expect(sessionExpiredRedirectTarget("unauthenticated", "/", "")).toBeNull();
  });
});
