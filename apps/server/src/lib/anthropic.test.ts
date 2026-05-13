// T2 audit finding #9 — unit tests for `computeRetryDelayMs`.
// Verifies that:
//   * `retry-after` (integer seconds) is preferred when the previous
//     response was a 429.
//   * `retry-after` (HTTP-date) is parsed correctly.
//   * `anthropic-ratelimit-*-reset` headers are honoured.
//   * Non-429 previous responses fall back to the jittered base delay.
//   * The chosen delay is clamped to `timeoutMs`.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { computeRetryDelayMs } from "./anthropic.js";

function mkResponse(headers: Record<string, string>, status = 429): Response {
  return new Response(null, { status, headers });
}

describe("computeRetryDelayMs (T2 audit #9)", () => {
  const NOW = Date.parse("2026-05-13T20:00:00.000Z");

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("prefers `retry-after` seconds over the jittered base when the previous status was 429", () => {
    const previous = mkResponse({ "retry-after": "2" });
    const got = computeRetryDelayMs({
      baseMs: 250,
      timeoutMs: 60_000,
      previousResponse: previous,
    });
    expect(got).toBe(2000);
  });

  it("parses `retry-after` as an HTTP-date", () => {
    const at = new Date(NOW + 5_000).toUTCString();
    const previous = mkResponse({ "retry-after": at });
    const got = computeRetryDelayMs({
      baseMs: 250,
      timeoutMs: 60_000,
      previousResponse: previous,
    });
    // Within a 1s window — HTTP-date precision is seconds, not ms.
    expect(got).toBeGreaterThanOrEqual(4_000);
    expect(got).toBeLessThanOrEqual(6_000);
  });

  it("honours `anthropic-ratelimit-tokens-reset` (RFC 3339)", () => {
    const previous = mkResponse({
      "anthropic-ratelimit-tokens-reset": new Date(NOW + 3_500).toISOString(),
    });
    const got = computeRetryDelayMs({
      baseMs: 250,
      timeoutMs: 60_000,
      previousResponse: previous,
    });
    expect(got).toBe(3_500);
  });

  it("picks the earliest of multiple `anthropic-ratelimit-*-reset` headers", () => {
    const previous = mkResponse({
      "anthropic-ratelimit-tokens-reset": new Date(NOW + 8_000).toISOString(),
      "anthropic-ratelimit-requests-reset": new Date(NOW + 4_000).toISOString(),
    });
    const got = computeRetryDelayMs({
      baseMs: 250,
      timeoutMs: 60_000,
      previousResponse: previous,
    });
    expect(got).toBe(4_000);
  });

  it("clamps the upstream hint to `timeoutMs`", () => {
    const previous = mkResponse({ "retry-after": "600" }); // 10 minutes
    const got = computeRetryDelayMs({
      baseMs: 250,
      timeoutMs: 20_000,
      previousResponse: previous,
    });
    expect(got).toBe(20_000);
  });

  it("falls back to the jittered base when no useful hint is present", () => {
    const previous = mkResponse({}); // 429 but no headers
    // ±25% jitter around 1000 → [750, 1250]
    const samples = Array.from({ length: 100 }, () =>
      computeRetryDelayMs({
        baseMs: 1000,
        timeoutMs: 60_000,
        previousResponse: previous,
      }),
    );
    for (const s of samples) {
      expect(s).toBeGreaterThanOrEqual(750);
      expect(s).toBeLessThanOrEqual(1250);
    }
    // Verify it actually jitters (not constant).
    const distinct = new Set(samples);
    expect(distinct.size).toBeGreaterThan(5);
  });

  it("does NOT use `retry-after` when the previous response was not a 429", () => {
    const previous = mkResponse({ "retry-after": "60" }, 503);
    const got = computeRetryDelayMs({
      baseMs: 100,
      timeoutMs: 60_000,
      previousResponse: previous,
    });
    // Should be near baseMs (100ms ±25%), NOT 60_000.
    expect(got).toBeLessThanOrEqual(125);
    expect(got).toBeGreaterThanOrEqual(75);
  });

  it("returns the base delay when `previousResponse` is null (first attempt path)", () => {
    const got = computeRetryDelayMs({
      baseMs: 0,
      timeoutMs: 60_000,
      previousResponse: null,
    });
    expect(got).toBe(0);
  });
});
