import { describe, expect, it } from "vitest";
import {
  isFounderAllowed,
  isPrivateChat,
  parseFounderTgUserId,
  parseOpenClawRateLimitPerMinute,
} from "./security.js";

describe("openclaw security helpers", () => {
  describe("parseFounderTgUserId", () => {
    it("returns undefined for empty / non-numeric values", () => {
      expect(parseFounderTgUserId(undefined)).toBeUndefined();
      expect(parseFounderTgUserId("")).toBeUndefined();
      expect(parseFounderTgUserId("   ")).toBeUndefined();
      expect(parseFounderTgUserId("not-a-number")).toBeUndefined();
    });

    it("parses a positive integer", () => {
      expect(parseFounderTgUserId("123456789")).toBe(123456789);
      expect(parseFounderTgUserId("  42  ")).toBe(42);
    });

    it("rejects zero and negatives", () => {
      expect(parseFounderTgUserId("0")).toBeUndefined();
      expect(parseFounderTgUserId("-1")).toBeUndefined();
    });

    it("rejects floats", () => {
      expect(parseFounderTgUserId("1.5")).toBeUndefined();
    });
  });

  describe("isFounderAllowed", () => {
    it("fails closed when founder env not set", () => {
      expect(isFounderAllowed(123, {})).toBe(false);
      expect(isFounderAllowed(123, { OPENCLAW_FOUNDER_TG_USER_ID: "" })).toBe(
        false,
      );
    });

    it("fails closed when userId is undefined", () => {
      expect(
        isFounderAllowed(undefined, { OPENCLAW_FOUNDER_TG_USER_ID: "123" }),
      ).toBe(false);
    });

    it("rejects non-founder users", () => {
      expect(
        isFounderAllowed(999, { OPENCLAW_FOUNDER_TG_USER_ID: "123" }),
      ).toBe(false);
    });

    it("admits the founder", () => {
      expect(
        isFounderAllowed(123, { OPENCLAW_FOUNDER_TG_USER_ID: "123" }),
      ).toBe(true);
    });

    it("never opens up for any user even in dev", () => {
      // Phase 1: fail-closed always; differs from console-bot, where dev
      // can run with empty allowlist.
      expect(
        isFounderAllowed(123, {
          OPENCLAW_FOUNDER_TG_USER_ID: "",
        }),
      ).toBe(false);
    });
  });

  describe("isPrivateChat", () => {
    it("only admits chat.type='private'", () => {
      expect(isPrivateChat("private")).toBe(true);
      expect(isPrivateChat("group")).toBe(false);
      expect(isPrivateChat("supergroup")).toBe(false);
      expect(isPrivateChat("channel")).toBe(false);
      expect(isPrivateChat(undefined)).toBe(false);
    });
  });

  describe("parseOpenClawRateLimitPerMinute", () => {
    it("uses a conservative default", () => {
      expect(parseOpenClawRateLimitPerMinute(undefined)).toBe(10);
      expect(parseOpenClawRateLimitPerMinute("")).toBe(10);
      expect(parseOpenClawRateLimitPerMinute("0")).toBe(10);
      expect(parseOpenClawRateLimitPerMinute("-3")).toBe(10);
    });

    it("accepts a positive override", () => {
      expect(parseOpenClawRateLimitPerMinute("5")).toBe(5);
      expect(parseOpenClawRateLimitPerMinute("30")).toBe(30);
    });
  });
});
