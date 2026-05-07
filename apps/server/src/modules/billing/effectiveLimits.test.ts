import { describe, expect, it } from "vitest";
import { effectiveLimits } from "./effectiveLimits.js";

describe("effectiveLimits", () => {
  it("returns free limits for 'free' plan", () => {
    const limits = effectiveLimits("free");
    expect(limits.aiRequestsPerDay).toBe(5);
    expect(limits.cloudSyncDevices).toBe(0);
    expect(limits.monoAutoSync).toBe(false);
  });

  it("returns free limits for 'plus' plan (not pro)", () => {
    const limits = effectiveLimits("plus");
    expect(limits.aiRequestsPerDay).toBe(5);
    expect(limits.cloudSyncDevices).toBe(0);
    expect(limits.monoAutoSync).toBe(false);
  });

  it("returns unlimited limits for 'pro' plan", () => {
    const limits = effectiveLimits("pro");
    expect(limits.aiRequestsPerDay).toBeNull();
    expect(limits.cloudSyncDevices).toBeNull();
    expect(limits.monoAutoSync).toBe(true);
  });
});
