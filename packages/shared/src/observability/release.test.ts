import { describe, expect, it } from "vitest";

import {
  formatRelease,
  resolveReleaseSha,
  resolveSentryRelease,
} from "./release";

describe("resolveReleaseSha", () => {
  it("prefers an explicit SENTRY_RELEASE override", () => {
    expect(
      resolveReleaseSha({
        SENTRY_RELEASE: "v1.2.3",
        GITHUB_SHA: "deadbeef",
      }),
    ).toBe("v1.2.3");
  });

  it("falls back through Railway → Vercel → GitHub SHAs", () => {
    expect(
      resolveReleaseSha({
        RAILWAY_GIT_COMMIT_SHA: "abc123",
        VERCEL_GIT_COMMIT_SHA: "def456",
        GITHUB_SHA: "ghi789",
      }),
    ).toBe("abc123");
    expect(
      resolveReleaseSha({
        VERCEL_GIT_COMMIT_SHA: "def456",
        GITHUB_SHA: "ghi789",
      }),
    ).toBe("def456");
    expect(resolveReleaseSha({ GITHUB_SHA: "ghi789" })).toBe("ghi789");
  });

  it("ignores empty / whitespace-only values and trims the winner", () => {
    expect(
      resolveReleaseSha({
        SENTRY_RELEASE: "",
        RAILWAY_GIT_COMMIT_SHA: "   ",
        VERCEL_GIT_COMMIT_SHA: "  real-sha  ",
      }),
    ).toBe("real-sha");
  });

  it("returns undefined when no SHA variable is set", () => {
    expect(resolveReleaseSha({})).toBeUndefined();
  });
});

describe("formatRelease", () => {
  it("wraps a SHA into the origin-agnostic `sergeant@<short-sha>` form", () => {
    expect(formatRelease("0123456789abcdef")).toBe("sergeant@0123456");
  });

  it("truncates to git's canonical 7-char abbreviation", () => {
    expect(formatRelease("abcdef0123456789")).toBe("sergeant@abcdef0");
  });

  it("leaves a short SHA shorter than 7 chars intact", () => {
    expect(formatRelease("abc12")).toBe("sergeant@abc12");
  });

  it("does not double-prefix an already-formatted release", () => {
    expect(formatRelease("sergeant@deadbee")).toBe("sergeant@deadbee");
  });

  it("returns undefined for absent / empty input", () => {
    expect(formatRelease(undefined)).toBeUndefined();
    expect(formatRelease("")).toBeUndefined();
    expect(formatRelease("   ")).toBeUndefined();
  });
});

describe("resolveSentryRelease", () => {
  it("composes resolve + format into the unified release tag", () => {
    expect(
      resolveSentryRelease({ VERCEL_GIT_COMMIT_SHA: "0123456789abcdef" }),
    ).toBe("sergeant@0123456");
  });

  it("is origin-agnostic — Railway and Vercel SHAs format identically", () => {
    expect(
      resolveSentryRelease({ RAILWAY_GIT_COMMIT_SHA: "feedface0000000" }),
    ).toBe("sergeant@feedfac");
    expect(
      resolveSentryRelease({ VERCEL_GIT_COMMIT_SHA: "feedface0000000" }),
    ).toBe("sergeant@feedfac");
  });

  it("returns undefined when no deploy SHA is present", () => {
    expect(resolveSentryRelease({})).toBeUndefined();
  });
});
