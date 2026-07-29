/**
 * Tests for the shared Tailwind preset (`tailwind-preset.js`).
 *
 * `tokens.js` / `mobile.js` are already snapshot-locked; the preset is the
 * one source module without coverage. It is consumed by both `apps/web` and
 * `apps/mobile`, so two things must hold:
 *
 *   1. The preset stays a `theme.extend`-only preset (no `content`/`presets`
 *      baked in — consumers own those).
 *   2. Preset values that are *derived* from the raw tokens stay in lockstep
 *      with `tokens.js`. These are the fragile links: a token retune that
 *      doesn't flow into the preset paints the Tailwind utility a stale
 *      colour while the JS export is correct (a hard-to-spot drift bug).
 *
 * We assert the derivation contract rather than snapshot the whole preset —
 * the preset is huge and mostly static CSS-variable plumbing.
 */

import { describe, expect, it } from "vitest";
import preset from "./tailwind-preset.js";
import { brandColors, zTier } from "./tokens.js";

describe("@sergeant/design-tokens — tailwind-preset.js", () => {
  it("exports a theme.extend-only preset with no baked-in content globs", () => {
    expect(preset.theme).toBeDefined();
    expect(preset.theme.extend).toBeDefined();
    // Consumers own `content`; the preset must not constrain it.
    expect(preset.content).toEqual([]);
    expect(preset).not.toHaveProperty("presets");
  });

  it("registers the utility plugins as inline functions", () => {
    expect(Array.isArray(preset.plugins)).toBe(true);
    expect(preset.plugins.length).toBeGreaterThan(0);
    for (const plugin of preset.plugins) {
      expect(typeof plugin).toBe("function");
    }
  });

  describe("colors — hub brand is the neutral stone ramp (design-audit M1)", () => {
    const { brand } = preset.theme.extend.colors;

    // The hub/shell `brand` token is deliberately NEUTRAL (warm stone) so it
    // carries no module hue and never reads as a fifth accent. Previously it
    // aliased teal/emerald, making the hub indistinguishable from finyk.
    it("brand.DEFAULT === stone-700", () => {
      expect(brand.DEFAULT).toBe(brandColors.stone[700]);
    });

    it("brand.light/dark/subtle map to stone 500/800/100", () => {
      expect(brand.light).toBe(brandColors.stone[500]);
      expect(brand.dark).toBe(brandColors.stone[800]);
      expect(brand.subtle).toBe(brandColors.stone[100]);
    });

    it("brand.strong === stone-800 (WCAG-AAA companion for white-on-fill)", () => {
      expect(brand.strong).toBe(brandColors.stone[800]);
    });

    it("brand spreads the full stone numeric scale", () => {
      for (const step of Object.keys(brandColors.stone)) {
        expect(brand[step]).toBe(brandColors.stone[step]);
      }
    });

    it("brand no longer aliases the teal/finyk hue", () => {
      expect(brand.DEFAULT).not.toBe(brandColors.teal[700]);
      expect(brand.strong).not.toBe(brandColors.teal[800]);
    });
  });

  describe("zIndex — semantic tier mirrors zTier exactly", () => {
    const { zIndex } = preset.theme.extend;

    it("each semantic tier resolves to its zTier value", () => {
      for (const tier of Object.keys(zTier)) {
        expect(zIndex[tier]).toBe(zTier[tier]);
      }
    });

    it("legacy aliases point into the canonical tier (header → sticky)", () => {
      expect(zIndex.header).toBe(zTier.sticky);
      // `tooltip` is the historical highest non-modal tier, above `toast`.
      expect(Number(zIndex.tooltip)).toBeGreaterThan(Number(zTier.toast));
    });
  });

  describe("boxShadow — elevation scale plumbs the CSS variables", () => {
    const { boxShadow } = preset.theme.extend;

    it("e0..e5 each resolve to their --shadow-eN variable", () => {
      for (const level of ["e0", "e1", "e2", "e3", "e4", "e5"]) {
        expect(boxShadow[level]).toBe(`var(--shadow-${level})`);
      }
    });

    it("legacy aliases map 1:1 onto the new scale", () => {
      expect(boxShadow.card).toBe("var(--shadow-e1)");
      expect(boxShadow.float).toBe("var(--shadow-e3)");
      expect(boxShadow.soft).toBe("var(--shadow-e4)");
    });
  });

  describe("borderRadius — canonical semantic scale", () => {
    const { borderRadius } = preset.theme.extend;

    it("does not expose the retired parallel r-* namespace", () => {
      expect(borderRadius).not.toHaveProperty("r-md");
      expect(borderRadius).not.toHaveProperty("r-lg");
      expect(borderRadius).not.toHaveProperty("r-xl");
      expect(borderRadius).not.toHaveProperty("r-2xl");
    });

    it("keeps the canonical CARD and HERO values", () => {
      expect(borderRadius["2xl"]).toBe("16px");
      expect(borderRadius["3xl"]).toBe("24px");
    });

    it("full radius is the pill value", () => {
      expect(borderRadius.full).toBe("9999px");
    });
  });

  describe("fontFamily — Manrope is the primary sans + display family", () => {
    const { fontFamily } = preset.theme.extend;

    it("sans and display both lead with Manrope Variable", () => {
      expect(fontFamily.sans[0]).toBe('"Manrope Variable"');
      expect(fontFamily.display[0]).toBe('"Manrope Variable"');
    });

    it("mono leads with JetBrains Mono Variable", () => {
      expect(fontFamily.mono[0]).toBe('"JetBrains Mono Variable"');
    });
  });
});
