import { describe, expect, it } from "vitest";

import {
  SENTRY_SAMPLE_PROFILES,
  SENTRY_SAMPLING_RULES,
  defaultSampleRate,
  pickTracesSampleRate,
  resolveSampleProfile,
} from "../sentry.js";

/**
 * Unit tests for the dynamic Sentry tracesSampler picker
 * (stack-pulse PR-12 / H6).
 *
 * The picker is pure & sync — exercise it directly without booting the SDK.
 *
 * What we cover:
 *   1. Each declared rule fires for a representative URL.
 *   2. Unmatched routes fall back to `defaultSampleRate()`.
 *   3. Defensive: undefined / non-string inputs collapse to fallback.
 *   4. Order — longest-prefix first wins (no /api/auth/* leaking onto
 *      a hypothetical broader /api rule).
 */
describe("pickTracesSampleRate", () => {
  it("samples /api/health at 0.1% (chatty liveness probe)", () => {
    expect(pickTracesSampleRate("/api/health", 0.05)).toBe(0.001);
    expect(pickTracesSampleRate("/api/health/db", 0.05)).toBe(0.001);
  });

  it("samples /api/auth/* at 100% (security-critical)", () => {
    expect(pickTracesSampleRate("/api/auth/sign-up", 0.05)).toBe(1.0);
    expect(pickTracesSampleRate("/api/auth/sign-in", 0.05)).toBe(1.0);
    expect(pickTracesSampleRate("/api/auth/oauth/callback", 0.05)).toBe(1.0);
  });

  it("samples /api/account/recovery at 100%", () => {
    expect(pickTracesSampleRate("/api/account/recovery", 0.05)).toBe(1.0);
    expect(
      pickTracesSampleRate("/api/account/recovery/confirm?token=x", 0.05),
    ).toBe(1.0);
  });

  it("samples /api/admin/* at 100% (low volume + high blast radius)", () => {
    expect(pickTracesSampleRate("/api/admin/users", 0.05)).toBe(1.0);
    expect(pickTracesSampleRate("/api/admin/jobs/retry", 0.05)).toBe(1.0);
  });

  it("samples /api/photo/analyze at 50% (expensive AI route)", () => {
    expect(pickTracesSampleRate("/api/photo/analyze", 0.05)).toBe(0.5);
  });

  it("samples /api/sync/poll at 1% (chatty heartbeat)", () => {
    expect(pickTracesSampleRate("/api/sync/poll?cursor=42", 0.05)).toBe(0.01);
  });

  it("samples /api/v2/sync/* at 1% (op-log sync chatter)", () => {
    expect(pickTracesSampleRate("/api/v2/sync/push", 0.05)).toBe(0.01);
    expect(pickTracesSampleRate("/api/v2/sync/pull?since=42", 0.05)).toBe(0.01);
    expect(pickTracesSampleRate("/api/v2/sync/stream", 0.05)).toBe(0.01);
  });

  it("samples /api/internal/openclaw/write/* at 100% (mutations)", () => {
    expect(
      pickTracesSampleRate("/api/internal/openclaw/write/strategy-doc", 0.05),
    ).toBe(1.0);
    expect(
      pickTracesSampleRate("/api/internal/openclaw/write/github-issue", 0.05),
    ).toBe(1.0);
    expect(
      pickTracesSampleRate("/api/internal/openclaw/write/pause-workflow", 0.05),
    ).toBe(1.0);
  });

  it("falls back to default for unmatched routes", () => {
    expect(pickTracesSampleRate("/api/nutrition/log", 0.05)).toBe(0.05);
    expect(pickTracesSampleRate("/api/finyk/transactions", 0.05)).toBe(0.05);
    expect(pickTracesSampleRate("/", 0.05)).toBe(0.05);
  });

  it("falls back to default for non-string inputs", () => {
    expect(pickTracesSampleRate(undefined, 0.07)).toBe(0.07);
    expect(pickTracesSampleRate(null, 0.07)).toBe(0.07);
    expect(pickTracesSampleRate(123 as unknown as string, 0.07)).toBe(0.07);
    expect(pickTracesSampleRate("", 0.07)).toBe(0.07);
  });

  it("uses `defaultSampleRate()` as the implicit fallback", () => {
    // No fallback supplied → uses env-derived default (0.05 unless overridden).
    const noOverride = pickTracesSampleRate("/api/nutrition/log");
    expect(noOverride).toBe(defaultSampleRate());
  });
});

describe("SENTRY_SAMPLING_RULES — table integrity", () => {
  it("every rule has rate in [0, 1]", () => {
    for (const rule of SENTRY_SAMPLING_RULES) {
      expect(rule.rate).toBeGreaterThanOrEqual(0);
      expect(rule.rate).toBeLessThanOrEqual(1);
    }
  });

  it("rules are sorted longest-prefix-first (no shadowing)", () => {
    // Concretely: for any pair (a, b) where a comes before b, b's match
    // must NOT be a strict prefix of a's match — otherwise b would never
    // fire because a wins first. The relaxed invariant is "no rule has
    // an earlier rule whose match is a prefix of itself".
    for (let i = 0; i < SENTRY_SAMPLING_RULES.length; i++) {
      const a = SENTRY_SAMPLING_RULES[i]!;
      for (let j = 0; j < i; j++) {
        const earlier = SENTRY_SAMPLING_RULES[j]!;
        if (a.match.startsWith(earlier.match) && a.match !== earlier.match) {
          throw new Error(
            `Rule "${a.match}" (idx ${i}) is shadowed by earlier "${earlier.match}" (idx ${j}). ` +
              `Reorder to longest-prefix-first.`,
          );
        }
      }
    }
  });

  it("no duplicate match strings", () => {
    const seen = new Set<string>();
    for (const rule of SENTRY_SAMPLING_RULES) {
      expect(seen.has(rule.match)).toBe(false);
      seen.add(rule.match);
    }
  });
});

describe("defaultSampleRate", () => {
  it("returns 0.05 when env-var unset", () => {
    expect(defaultSampleRate({})).toBe(0.05);
  });

  it("respects SENTRY_TRACES_SAMPLE_RATE=0 kill-switch", () => {
    expect(defaultSampleRate({ SENTRY_TRACES_SAMPLE_RATE: "0" })).toBe(0);
  });

  it("respects deploy-time override", () => {
    expect(defaultSampleRate({ SENTRY_TRACES_SAMPLE_RATE: "0.2" })).toBe(0.2);
  });

  it("falls back to 0.05 on garbage input", () => {
    expect(defaultSampleRate({ SENTRY_TRACES_SAMPLE_RATE: "banana" })).toBe(
      0.05,
    );
  });

  it("reads SENTRY_SAMPLE_PROFILE=minimal as 0.01", () => {
    expect(defaultSampleRate({ SENTRY_SAMPLE_PROFILE: "minimal" })).toBe(0.01);
  });

  it("reads SENTRY_SAMPLE_PROFILE=aggressive as 0.2", () => {
    expect(defaultSampleRate({ SENTRY_SAMPLE_PROFILE: "aggressive" })).toBe(
      0.2,
    );
  });

  it("reads SENTRY_SAMPLE_PROFILE=prod as 0.05", () => {
    expect(defaultSampleRate({ SENTRY_SAMPLE_PROFILE: "prod" })).toBe(0.05);
  });

  it("numeric SENTRY_TRACES_SAMPLE_RATE wins over profile (explicit kill-switch override)", () => {
    expect(
      defaultSampleRate({
        SENTRY_SAMPLE_PROFILE: "aggressive",
        SENTRY_TRACES_SAMPLE_RATE: "0",
      }),
    ).toBe(0);
  });

  it("unknown profile collapses to prod baseline (0.05)", () => {
    expect(
      defaultSampleRate({ SENTRY_SAMPLE_PROFILE: "banana" as never }),
    ).toBe(0.05);
  });
});

describe("resolveSampleProfile", () => {
  it("accepts the three documented profile names", () => {
    expect(resolveSampleProfile("minimal")).toBe("minimal");
    expect(resolveSampleProfile("prod")).toBe("prod");
    expect(resolveSampleProfile("aggressive")).toBe("aggressive");
  });

  it("defaults to prod when unset / unknown", () => {
    expect(resolveSampleProfile(undefined)).toBe("prod");
    expect(resolveSampleProfile("")).toBe("prod");
    expect(resolveSampleProfile("banana")).toBe("prod");
  });
});

describe("SENTRY_SAMPLE_PROFILES — budget invariants", () => {
  it("profile rates are ordered minimal < prod < aggressive", () => {
    expect(SENTRY_SAMPLE_PROFILES.minimal).toBeLessThan(
      SENTRY_SAMPLE_PROFILES.prod,
    );
    expect(SENTRY_SAMPLE_PROFILES.prod).toBeLessThan(
      SENTRY_SAMPLE_PROFILES.aggressive,
    );
  });

  it("all profile rates in [0, 1]", () => {
    for (const rate of Object.values(SENTRY_SAMPLE_PROFILES)) {
      expect(rate).toBeGreaterThanOrEqual(0);
      expect(rate).toBeLessThanOrEqual(1);
    }
  });
});
