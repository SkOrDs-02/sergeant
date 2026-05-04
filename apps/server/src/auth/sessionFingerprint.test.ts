import { describe, it, expect } from "vitest";

import { ipPrefix, detectFingerprintDrift } from "./sessionFingerprint.js";

describe("ipPrefix", () => {
  it("truncates IPv4 to /24", () => {
    expect(ipPrefix("203.0.113.42")).toBe("203.0.113.0/24");
    expect(ipPrefix("10.0.0.1")).toBe("10.0.0.0/24");
  });

  it("truncates IPv6 to /64 (first four groups)", () => {
    expect(ipPrefix("2001:db8::1")).toBe("2001:db8:0:0::/64");
    expect(ipPrefix("fd00::dead:beef")).toBe("fd00:0:0:0::/64");
    expect(ipPrefix("2001:db8:1234:5678:abcd::1")).toBe(
      "2001:db8:1234:5678::/64",
    );
  });

  it("is idempotent on already-prefixed inputs", () => {
    expect(ipPrefix("203.0.113.0/24")).toBe("203.0.113.0/24");
    expect(ipPrefix("2001:db8:0:0::/64")).toBe("2001:db8:0:0::/64");
  });

  it("returns null for empty / invalid inputs", () => {
    expect(ipPrefix(null)).toBeNull();
    expect(ipPrefix(undefined)).toBeNull();
    expect(ipPrefix("")).toBeNull();
    expect(ipPrefix("   ")).toBeNull();
    expect(ipPrefix("not-an-ip")).toBeNull();
    expect(ipPrefix("999.999.999.999")).toBeNull();
  });
});

describe("detectFingerprintDrift", () => {
  it("returns null when stored fingerprint is empty (legacy session)", () => {
    expect(
      detectFingerprintDrift({
        storedUserAgent: null,
        storedIp: null,
        currentUserAgent: "Mozilla/5.0",
        currentIp: "203.0.113.42",
      }),
    ).toBeNull();
  });

  it("returns null when nothing has drifted", () => {
    expect(
      detectFingerprintDrift({
        storedUserAgent: "Mozilla/5.0",
        storedIp: "203.0.113.42",
        currentUserAgent: "Mozilla/5.0",
        currentIp: "203.0.113.99", // same /24 prefix
      }),
    ).toBeNull();
  });

  it("flags UA drift only", () => {
    const drift = detectFingerprintDrift({
      storedUserAgent: "Mozilla/5.0 (orig)",
      storedIp: "203.0.113.42",
      currentUserAgent: "Curl/8.0",
      currentIp: "203.0.113.42",
    });
    expect(drift).not.toBeNull();
    expect(drift!.ua).toBe(true);
    expect(drift!.ip).toBe(false);
  });

  it("flags IP-prefix drift only", () => {
    const drift = detectFingerprintDrift({
      storedUserAgent: "Mozilla/5.0",
      storedIp: "203.0.113.42",
      currentUserAgent: "Mozilla/5.0",
      currentIp: "198.51.100.1",
    });
    expect(drift).not.toBeNull();
    expect(drift!.ua).toBe(false);
    expect(drift!.ip).toBe(true);
    expect(drift!.storedIpPrefix).toBe("203.0.113.0/24");
    expect(drift!.currentIpPrefix).toBe("198.51.100.0/24");
  });

  it("flags both axes when both differ", () => {
    const drift = detectFingerprintDrift({
      storedUserAgent: "Mozilla/5.0",
      storedIp: "2001:db8::1",
      currentUserAgent: "Curl/8.0",
      currentIp: "2001:db9::1",
    });
    expect(drift).not.toBeNull();
    expect(drift!.ua).toBe(true);
    expect(drift!.ip).toBe(true);
  });

  it("does not flag drift when only one side has UA (skewed legacy data)", () => {
    expect(
      detectFingerprintDrift({
        storedUserAgent: null,
        storedIp: "203.0.113.42",
        currentUserAgent: "Mozilla/5.0",
        currentIp: "203.0.113.42",
      }),
    ).toBeNull();
  });

  it("matches stored prefix against current full IP gracefully", () => {
    // Stored value has already been truncated; current is full IP.
    // Both sides should normalise to /24 and compare equal.
    expect(
      detectFingerprintDrift({
        storedUserAgent: "Mozilla/5.0",
        storedIp: "203.0.113.0/24",
        currentUserAgent: "Mozilla/5.0",
        currentIp: "203.0.113.250",
      }),
    ).toBeNull();
  });
});
