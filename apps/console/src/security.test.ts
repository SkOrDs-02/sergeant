import { describe, expect, it } from "vitest";
import {
  escapeTelegramMarkdownV2,
  FixedWindowRateLimiter,
  isUserAllowed,
  parseAllowedUserIds,
  parseRateLimitPerMinute,
  splitTelegramMessage,
} from "./security.js";

describe("console security helpers", () => {
  it("parses allowed Telegram users", () => {
    expect([...parseAllowedUserIds("123, 456,,")]).toEqual(["123", "456"]);
  });

  it("fails closed in production when ALLOWED_USER_IDS is empty", () => {
    expect(isUserAllowed(123, { NODE_ENV: "production" })).toBe(false);
  });

  it("allows open access only outside production when no allowlist exists", () => {
    expect(isUserAllowed(123, { NODE_ENV: "development" })).toBe(true);
  });

  it("requires a listed user when an allowlist exists", () => {
    expect(
      isUserAllowed(123, { ALLOWED_USER_IDS: "123", NODE_ENV: "production" }),
    ).toBe(true);
    expect(
      isUserAllowed(999, { ALLOWED_USER_IDS: "123", NODE_ENV: "production" }),
    ).toBe(false);
  });

  it("escapes MarkdownV2 control characters in agent output", () => {
    expect(escapeTelegramMarkdownV2("**boom** [link](x) a_b!")).toBe(
      "\\*\\*boom\\*\\* \\[link\\]\\(x\\) a\\_b\\!",
    );
  });

  it("splits long Telegram messages", () => {
    expect(splitTelegramMessage("abcdef", 2)).toEqual(["ab", "cd", "ef"]);
  });

  it("rate-limits by fixed window", () => {
    let now = 1_000;
    const limiter = new FixedWindowRateLimiter(2, 1_000, () => now);

    expect(limiter.allow("u1")).toBe(true);
    expect(limiter.allow("u1")).toBe(true);
    expect(limiter.allow("u1")).toBe(false);

    now = 2_000;
    expect(limiter.allow("u1")).toBe(true);
  });

  it("uses a conservative default rate limit", () => {
    expect(parseRateLimitPerMinute(undefined)).toBe(12);
    expect(parseRateLimitPerMinute("0")).toBe(12);
    expect(parseRateLimitPerMinute("3")).toBe(3);
  });
});
