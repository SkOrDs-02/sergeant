/** @vitest-environment node */
import { describe, it, expect } from "vitest";
import { messages as uk } from "./uk";
import {
  DEFAULT_LOCALE,
  SUPPORTED_LOCALES,
  getMessages,
  messagesEn,
  parseLocale,
} from "./index";

/**
 * Contract tests for the i18n resolver. These lock the shallow-merge
 * semantics + the parse-locale defensiveness so consumer migrations don't
 * have to re-derive guarantees on their own.
 */
describe("i18n resolver", () => {
  it("exposes uk as default locale", () => {
    expect(DEFAULT_LOCALE).toBe("uk");
    expect(SUPPORTED_LOCALES).toEqual(["uk", "en"]);
  });

  describe("getMessages", () => {
    it("returns canonical uk catalog without copy for lang='uk'", () => {
      const result = getMessages("uk");
      // Identity check — uk path must not allocate. Catches accidental
      // {...uk} spread that would break Object.is and bust referential-
      // equality optimizations downstream.
      expect(result).toBe(uk);
    });

    it("shallow-merges en over uk for lang='en' — translated group fully replaces", () => {
      const result = getMessages("en");
      // paywall is fully translated in en.ts → en wins
      const paywall = result.paywall as Record<string, Record<string, string>>;
      expect(paywall["ai-photo-analysis"]?.["title"]).toBe(
        "AI photo analysis — Premium",
      );
      expect(paywall["multi-currency"]?.["name"]).toBe("Multi-currency assets");
    });

    it("falls through to uk for groups absent from en.ts", () => {
      const result = getMessages("en");
      const ukAuth = uk.auth as Record<string, string>;
      const resultAuth = result.auth as Record<string, string>;
      // auth is NOT in en.ts → must equal uk.auth exactly (same object ref)
      expect(resultAuth).toBe(ukAuth);
      // And the canonical UK string survives
      expect(resultAuth["invalidEmail"]).toBe("Невірний формат email.");
    });

    it("does not mutate the uk catalog when resolving en", () => {
      const ukPaywallBefore = uk.paywall;
      getMessages("en");
      // Same object ref AFTER an en resolution — proves we don't write back
      expect(uk.paywall).toBe(ukPaywallBefore);
    });

    it("freezes the en-resolved catalog to prevent downstream mutation", () => {
      const result = getMessages("en");
      expect(Object.isFrozen(result)).toBe(true);
    });
  });

  describe("parseLocale", () => {
    it.each([
      ["uk", "uk"],
      ["en", "en"],
      ["UK", "uk"],
      ["EN", "en"],
      ["en-US", "en"],
      ["en-GB", "en"],
      ["uk-UA", "uk"],
      ["fr", "uk"], // unsupported → default
      ["", "uk"],
      [null, "uk"],
      [undefined, "uk"],
    ])("parses %s → %s", (input, expected) => {
      expect(parseLocale(input as string | null | undefined)).toBe(expected);
    });
  });

  describe("messagesEn contract", () => {
    it("only declares top-level groups that are fully populated", () => {
      // Every top-level key in en.ts must mirror the same shape as uk.
      // This guards against half-translated groups (e.g. en.paywall with 2
      // of 3 features) that would silently leave UK fallthrough for the
      // missing feature.
      for (const [groupName, enGroup] of Object.entries(messagesEn)) {
        const ukGroup = (uk as Record<string, unknown>)[groupName];
        expect(
          ukGroup,
          `en.ts has group "${groupName}" but uk.ts doesn't`,
        ).toBeDefined();
        expect(typeof enGroup).toBe(typeof ukGroup);
      }
    });

    it("paywall covers all 3 PremiumFeatureId values", () => {
      const enPaywall = messagesEn["paywall"] as
        | Record<string, Record<string, string>>
        | undefined;
      expect(enPaywall).toBeDefined();
      // These IDs are locked by useFeatureGate's PremiumFeatureId union.
      // If a new gate is added, en.ts MUST add the matching key — this test
      // is the trip-wire.
      expect(enPaywall?.["ai-photo-analysis"]).toBeDefined();
      expect(enPaywall?.["multi-currency"]).toBeDefined();
      expect(enPaywall?.["analytics-export-pdf"]).toBeDefined();
    });
  });
});
