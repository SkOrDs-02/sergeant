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

  // Fail-closed regression matrix — closes
  // docs/security/hardening/M15-console-allowlist-fail-closed.md.
  // Empty / undefined `ALLOWED_USER_IDS` must reject in every NODE_ENV
  // (production, development, staging, preview, undefined). The previous
  // dev-only fall-open behaviour silently let any Telegram user through
  // when NODE_ENV was not exactly "production" (e.g. Railway typo,
  // preview deploy), which is the security gap M15 catches.
  it.each([
    ["production NODE_ENV, no allowlist", { NODE_ENV: "production" }],
    ["development NODE_ENV, no allowlist", { NODE_ENV: "development" }],
    ["staging NODE_ENV, no allowlist", { NODE_ENV: "staging" }],
    [
      "empty ALLOWED_USER_IDS in production",
      {
        ALLOWED_USER_IDS: "",
        NODE_ENV: "production",
      },
    ],
    [
      "empty ALLOWED_USER_IDS in development",
      {
        ALLOWED_USER_IDS: "",
        NODE_ENV: "development",
      },
    ],
    [
      "whitespace-only ALLOWED_USER_IDS",
      {
        ALLOWED_USER_IDS: "   ,  ,",
        NODE_ENV: "production",
      },
    ],
    ["unset NODE_ENV and ALLOWED_USER_IDS", {}],
  ])("fails closed: %s", (_name, env) => {
    expect(isUserAllowed(123, env)).toBe(false);
  });

  it("rejects a missing userId regardless of allowlist contents", () => {
    expect(isUserAllowed(undefined, { ALLOWED_USER_IDS: "123" })).toBe(false);
    expect(isUserAllowed(undefined, {})).toBe(false);
  });

  it("requires a listed user when an allowlist exists", () => {
    expect(
      isUserAllowed(123, { ALLOWED_USER_IDS: "123", NODE_ENV: "production" }),
    ).toBe(true);
    expect(
      isUserAllowed(999, { ALLOWED_USER_IDS: "123", NODE_ENV: "production" }),
    ).toBe(false);
    // Allowlist applies even outside production (no NODE_ENV escape hatch).
    expect(
      isUserAllowed(123, { ALLOWED_USER_IDS: "123", NODE_ENV: "development" }),
    ).toBe(true);
    expect(isUserAllowed(123, { ALLOWED_USER_IDS: "123" })).toBe(true);
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
