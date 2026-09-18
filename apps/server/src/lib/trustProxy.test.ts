import { describe, expect, it } from "vitest";
import { parseTrustProxy } from "./trustProxy.js";

describe("parseTrustProxy", () => {
  describe("empty / fallback", () => {
    it("returns fallback when raw is undefined", () => {
      expect(parseTrustProxy({ raw: undefined, fallback: 1 })).toBe(1);
    });
    it("returns fallback when raw is null", () => {
      expect(parseTrustProxy({ raw: null, fallback: 1 })).toBe(1);
    });
    it("returns fallback when raw is empty string", () => {
      expect(parseTrustProxy({ raw: "", fallback: 1 })).toBe(1);
    });
    it("returns fallback when raw is just whitespace", () => {
      expect(parseTrustProxy({ raw: "   ", fallback: 2 })).toBe(2);
    });
    it("preserves undefined fallback", () => {
      expect(
        parseTrustProxy({ raw: undefined, fallback: undefined }),
      ).toBeUndefined();
    });
  });

  describe("hop count", () => {
    it("parses 0", () => {
      expect(parseTrustProxy({ raw: "0", fallback: 1 })).toBe(0);
    });
    it("parses 1 (default Railway value)", () => {
      expect(parseTrustProxy({ raw: "1", fallback: 0 })).toBe(1);
    });
    it("parses 2 (Cloudflare + Railway scenario)", () => {
      expect(parseTrustProxy({ raw: "2", fallback: 1 })).toBe(2);
    });
    it("trims surrounding whitespace", () => {
      expect(parseTrustProxy({ raw: "  3  ", fallback: 1 })).toBe(3);
    });
    it("rejects negative-ish typo via NaN path", () => {
      // "-1" is not matched by /^\d+$/ → falls through to CSV parse → fails
      expect(() => parseTrustProxy({ raw: "-1", fallback: 1 })).toThrow(
        /invalid token/,
      );
    });
    it("rejects values > 10 (likely typo)", () => {
      expect(() => parseTrustProxy({ raw: "100", fallback: 1 })).toThrow(
        /out of range/,
      );
    });
    it("rejects very large numbers", () => {
      expect(() => parseTrustProxy({ raw: "999999", fallback: 1 })).toThrow(
        /out of range/,
      );
    });
  });

  describe("boolean", () => {
    it("accepts 'false' to disable trust proxy entirely", () => {
      expect(parseTrustProxy({ raw: "false", fallback: 1 })).toBe(false);
    });
    it("is case-insensitive for false", () => {
      expect(parseTrustProxy({ raw: "FALSE", fallback: 1 })).toBe(false);
      expect(parseTrustProxy({ raw: "False", fallback: 1 })).toBe(false);
    });
    it("REJECTS 'true' — by design (security policy)", () => {
      expect(() => parseTrustProxy({ raw: "true", fallback: 1 })).toThrow(
        /disabled by policy/,
      );
    });
    it("rejects TRUE case-insensitively too", () => {
      expect(() => parseTrustProxy({ raw: "TRUE", fallback: 1 })).toThrow(
        /disabled by policy/,
      );
    });
  });

  describe("CIDR / keyword list", () => {
    it("accepts a single IPv4", () => {
      expect(parseTrustProxy({ raw: "10.0.0.1", fallback: 1 })).toEqual([
        "10.0.0.1",
      ]);
    });
    it("accepts an IPv4 CIDR block", () => {
      expect(parseTrustProxy({ raw: "10.0.0.0/8", fallback: 1 })).toEqual([
        "10.0.0.0/8",
      ]);
    });
    it("accepts multiple IPv4/CIDR blocks (CSV)", () => {
      expect(
        parseTrustProxy({
          raw: "10.0.0.0/8, 192.168.0.0/16, 172.16.0.0/12",
          fallback: 1,
        }),
      ).toEqual(["10.0.0.0/8", "192.168.0.0/16", "172.16.0.0/12"]);
    });
    it("accepts express keyword shortcuts", () => {
      expect(
        parseTrustProxy({
          raw: "loopback, linklocal, uniquelocal",
          fallback: 1,
        }),
      ).toEqual(["loopback", "linklocal", "uniquelocal"]);
    });
    it("accepts mixed keyword + CIDR", () => {
      expect(
        parseTrustProxy({ raw: "loopback, 10.0.0.0/8", fallback: 1 }),
      ).toEqual(["loopback", "10.0.0.0/8"]);
    });
    it("accepts IPv6 CIDR (loose validation — proxy-addr does final check)", () => {
      const out = parseTrustProxy({ raw: "::1, fc00::/7", fallback: 1 });
      expect(out).toEqual(["::1", "fc00::/7"]);
    });
    it("strips inner whitespace from CSV tokens", () => {
      expect(
        parseTrustProxy({
          raw: " 10.0.0.0/8 ,  192.168.0.0/16  ",
          fallback: 1,
        }),
      ).toEqual(["10.0.0.0/8", "192.168.0.0/16"]);
    });
    it("filters empty CSV cells produced by trailing commas", () => {
      expect(parseTrustProxy({ raw: "10.0.0.0/8,,,", fallback: 1 })).toEqual([
        "10.0.0.0/8",
      ]);
    });
    it("rejects garbage tokens with a helpful error", () => {
      expect(() =>
        parseTrustProxy({
          raw: "10.0.0.0/8, foo, 192.168.0.0/16",
          fallback: 1,
        }),
      ).toThrow(/invalid token "foo"/);
    });
    it("rejects single garbage token", () => {
      expect(() =>
        parseTrustProxy({ raw: "definitely-not-an-ip", fallback: 1 }),
      ).toThrow(/invalid token/);
    });
  });
});
