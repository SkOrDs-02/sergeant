import { describe, expect, it } from "vitest";
import {
  CONSOLE_GLOBAL_RATE_LIMIT_KEY,
  DEFAULT_CONSOLE_GLOBAL_RATE_LIMIT_PER_MIN,
  escapeTelegramMarkdownV2,
  FixedWindowRateLimiter,
  isUserAllowed,
  parseAllowedUserIds,
  parseGlobalRateLimitPerMinute,
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

  // M17 — `docs/security/hardening/M17-console-global-rate-cap.md`. The
  // per-user bucket alone scales linearly with the allowlist size. The
  // global cap is a secondary bucket every authed user shares, so the
  // bot's aggregate budget stays bounded as `ALLOWED_USER_IDS` grows.
  describe("M17 — global rate cap", () => {
    it("denies once the cross-user cap exhausts even if per-user has room", () => {
      let now = 1_000;
      // Per-user 100/min (effectively unlimited for the test); global 4/min.
      const limiter = new FixedWindowRateLimiter(100, 1_000, () => now, {
        key: CONSOLE_GLOBAL_RATE_LIMIT_KEY,
        limit: 4,
      });

      // Five users hit one request each; fifth must be denied because the
      // global cap clamped at 4 even though no user reached their bucket.
      expect(limiter.allow("u1")).toBe(true);
      expect(limiter.lastDeny()).toBeNull();
      expect(limiter.allow("u2")).toBe(true);
      expect(limiter.allow("u3")).toBe(true);
      expect(limiter.allow("u4")).toBe(true);
      expect(limiter.allow("u5")).toBe(false);
      expect(limiter.lastDeny()).toBe("global");

      // Window roll re-opens the global cap.
      now = 2_001;
      expect(limiter.allow("u5")).toBe(true);
      expect(limiter.lastDeny()).toBeNull();
    });

    it("flags per-user denies separately so metrics stay clean", () => {
      let now = 1_000;
      // Per-user budget of 1; global budget of 100 (cannot be the cause).
      const limiter = new FixedWindowRateLimiter(1, 1_000, () => now, {
        key: CONSOLE_GLOBAL_RATE_LIMIT_KEY,
        limit: 100,
      });

      expect(limiter.allow("u1")).toBe(true);
      expect(limiter.allow("u1")).toBe(false);
      expect(limiter.lastDeny()).toBe("per_user");
      // A different user passes — the global bucket was untouched by the
      // failed second `u1` request.
      expect(limiter.allow("u2")).toBe(true);
      expect(limiter.lastDeny()).toBeNull();

      // Sanity: window roll resets the per-user denial too.
      now = 2_001;
      expect(limiter.allow("u1")).toBe(true);
    });

    it("falls back to single-bucket behaviour when no global cap is configured", () => {
      const now = 1_000;
      const limiter = new FixedWindowRateLimiter(2, 1_000, () => now);
      expect(limiter.allow("u1")).toBe(true);
      expect(limiter.allow("u1")).toBe(true);
      expect(limiter.allow("u1")).toBe(false);
      expect(limiter.lastDeny()).toBe("per_user");
    });

    it("does not consume the global bucket when the per-user bucket fails", () => {
      const now = 1_000;
      const limiter = new FixedWindowRateLimiter(1, 1_000, () => now, {
        key: CONSOLE_GLOBAL_RATE_LIMIT_KEY,
        limit: 2,
      });
      // u1 spends 1 of 2 global tokens with their first request.
      expect(limiter.allow("u1")).toBe(true);
      // u1's second request is rejected on per-user; must NOT charge the
      // global bucket. Otherwise the global bucket would drain to 0 from
      // a single user spamming and starve every other allowlisted user.
      expect(limiter.allow("u1")).toBe(false);
      expect(limiter.lastDeny()).toBe("per_user");
      // u2 still has 1 of 2 global tokens left.
      expect(limiter.allow("u2")).toBe(true);
      // Now both global tokens are consumed; u3 sees the global denial.
      expect(limiter.allow("u3")).toBe(false);
      expect(limiter.lastDeny()).toBe("global");
    });

    it("parses CONSOLE_GLOBAL_RATE_LIMIT_PER_MIN with a sane default", () => {
      expect(parseGlobalRateLimitPerMinute(undefined)).toBe(
        DEFAULT_CONSOLE_GLOBAL_RATE_LIMIT_PER_MIN,
      );
      expect(parseGlobalRateLimitPerMinute("0")).toBe(
        DEFAULT_CONSOLE_GLOBAL_RATE_LIMIT_PER_MIN,
      );
      expect(parseGlobalRateLimitPerMinute("not-a-number")).toBe(
        DEFAULT_CONSOLE_GLOBAL_RATE_LIMIT_PER_MIN,
      );
      expect(parseGlobalRateLimitPerMinute("60")).toBe(60);
      // Non-integer inputs are floored — never half a request.
      expect(parseGlobalRateLimitPerMinute("12.7")).toBe(12);
    });
  });
});
