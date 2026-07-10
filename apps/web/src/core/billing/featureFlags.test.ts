/** @vitest-environment jsdom */
import { describe, expect, it } from "vitest";
import {
  PAYWALL_TRIAL_DAY7_COPY_FLAG,
  resolvePaywallTrialDay7Copy,
} from "./featureFlags";

describe("resolvePaywallTrialDay7Copy", () => {
  it("is deterministic for the same seed (sticky per user)", () => {
    for (const seed of ["u-abc123", "better-auth-id-xyz", ""]) {
      const first = resolvePaywallTrialDay7Copy(seed);
      const second = resolvePaywallTrialDay7Copy(seed);
      expect(first).toBe(second);
    }
  });

  it("returns a known variant for the empty seed (regression guard)", () => {
    // FNV-1a offset basis 0x811c9dc5 (odd) → modulo 2 → "B".
    expect(resolvePaywallTrialDay7Copy("")).toBe("B");
  });

  it("splits ~50/50 across a population of sequential ids", () => {
    const N = 1000;
    let a = 0;
    let b = 0;
    for (let i = 0; i < N; i++) {
      const v = resolvePaywallTrialDay7Copy(`user-${i}`);
      if (v === "A") a++;
      else b++;
    }
    expect(a + b).toBe(N);
    // 40 %–60 % band — loose для 1 000 sample, ловить зламаний hash (усе в
    // один варіант) без чутливості до нормального статистичного шуму.
    expect(a).toBeGreaterThan(N * 0.4);
    expect(a).toBeLessThan(N * 0.6);
    expect(b).toBeGreaterThan(N * 0.4);
    expect(b).toBeLessThan(N * 0.6);
  });

  it("only ever returns the two canonical variants", () => {
    for (let i = 0; i < 500; i++) {
      const v = resolvePaywallTrialDay7Copy(`seed-${i}`);
      expect(v === "A" || v === "B").toBe(true);
    }
  });

  it("exports a stable flag name for analytics/PostHog readout", () => {
    expect(PAYWALL_TRIAL_DAY7_COPY_FLAG).toBe("paywall_trial_day7_copy");
  });
});
