import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  buildUnsubscribeUrl,
  signUnsubscribeToken,
  verifyUnsubscribeToken,
} from "./ftuxUnsubscribeToken.js";

describe("ftux unsubscribe token", () => {
  const ORIGINAL_SECRET = process.env.BETTER_AUTH_SECRET;

  beforeEach(() => {
    process.env.BETTER_AUTH_SECRET = "test-secret-32-bytes-padded-yyyyyyy";
  });

  afterEach(() => {
    if (ORIGINAL_SECRET === undefined) {
      delete process.env.BETTER_AUTH_SECRET;
    } else {
      process.env.BETTER_AUTH_SECRET = ORIGINAL_SECRET;
    }
  });

  it("sign/verify round-trip працює для валідного userId", () => {
    const token = signUnsubscribeToken({ userId: "user-123" });
    expect(token).not.toBeNull();
    const verdict = verifyUnsubscribeToken(token!);
    expect(verdict.ok).toBe(true);
    if (verdict.ok) {
      expect(verdict.userId).toBe("user-123");
      expect(verdict.family).toBe("ftux_drip");
    }
  });

  it("verify повертає invalid_signature для tampered hmac", () => {
    const token = signUnsubscribeToken({ userId: "user-456" });
    expect(token).not.toBeNull();
    const tampered = token!.slice(0, -2) + "00";
    const verdict = verifyUnsubscribeToken(tampered);
    expect(verdict.ok).toBe(false);
    if (!verdict.ok) {
      expect(verdict.reason).toBe("invalid_signature");
    }
  });

  it("verify повертає invalid_signature для іншого userId з тим самим hmac", () => {
    const token = signUnsubscribeToken({ userId: "user-A" });
    expect(token).not.toBeNull();
    const dot = token!.indexOf(".");
    const swapped = `user-B.${token!.slice(dot + 1)}`;
    const verdict = verifyUnsubscribeToken(swapped);
    expect(verdict.ok).toBe(false);
  });

  it("verify malformed: пустий, без крапки, без hmac", () => {
    expect(verifyUnsubscribeToken("").ok).toBe(false);
    expect(verifyUnsubscribeToken("nodothere").ok).toBe(false);
    expect(verifyUnsubscribeToken("u123.").ok).toBe(false);
    expect(verifyUnsubscribeToken(".hashonly").ok).toBe(false);
    expect(verifyUnsubscribeToken("u123.short").ok).toBe(false);
  });

  it("missing_secret коли BETTER_AUTH_SECRET не заданий", () => {
    delete process.env.BETTER_AUTH_SECRET;
    expect(signUnsubscribeToken({ userId: "u1" })).toBeNull();
    const v = verifyUnsubscribeToken("u1.dead");
    expect(v.ok).toBe(false);
    if (!v.ok) expect(v.reason).toBe("missing_secret");
  });

  it("buildUnsubscribeUrl нормалізує trailing slash і url-енкодить токен", () => {
    const url = buildUnsubscribeUrl({
      appUrl: "https://app.sergeant.fit/",
      token: "u 1.abc",
    });
    expect(
      url.startsWith("https://app.sergeant.fit/api/email/unsubscribe?u="),
    ).toBe(true);
    expect(url).toContain("u%201.abc");
    expect(url).not.toContain("//api/email");
  });

  it("різні userId дають різні токени навіть з однаковим hmac-секретом", () => {
    const a = signUnsubscribeToken({ userId: "user-A" });
    const b = signUnsubscribeToken({ userId: "user-B" });
    expect(a).not.toEqual(b);
  });

  it("один userId з двома різними family-scopes дає різні токени", () => {
    const a = signUnsubscribeToken({ userId: "user-X", family: "ftux_drip" });
    const b = signUnsubscribeToken({
      userId: "user-X",
      family: "weekly_digest",
    });
    expect(a).not.toEqual(b);
    // Cross-family verify не валідний.
    if (a) {
      const verdict = verifyUnsubscribeToken(a, { family: "weekly_digest" });
      expect(verdict.ok).toBe(false);
    }
  });
});
