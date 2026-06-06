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

  describe("colors — derived brand scale stays in lockstep with brandColors", () => {
    const { brand } = preset.theme.extend.colors;

    it("brand.DEFAULT === emerald-500", () => {
      expect(brand.DEFAULT).toBe(brandColors.emerald[500]);
    });

    it("brand.light/dark/subtle map to emerald 400/600/50", () => {
      expect(brand.light).toBe(brandColors.emerald[400]);
      expect(brand.dark).toBe(brandColors.emerald[600]);
      expect(brand.subtle).toBe(brandColors.emerald[50]);
    });

    it("brand.strong === emerald-700 (WCAG-AA companion)", () => {
      expect(brand.strong).toBe(brandColors.emerald[700]);
    });

    it("brand spreads the full emerald numeric scale", () => {
      for (const step of Object.keys(brandColors.emerald)) {
        expect(brand[step]).toBe(brandColors.emerald[step]);
      }
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

  describe("borderRadius — v2 scale keys are present and don't clobber legacy", () => {
    const { borderRadius } = preset.theme.extend;

    it("exposes the v2 r-* radius scale", () => {
      expect(borderRadius["r-md"]).toBe("12px");
      expect(borderRadius["r-lg"]).toBe("14px");
      expect(borderRadius["r-xl"]).toBe("18px");
      expect(borderRadius["r-2xl"]).toBe("24px");
    });

    it("keeps the legacy CONTROL/CARD/HERO contract distinct from r-*", () => {
      // `2xl=16` is the legacy CONTROL value; `r-2xl=24` is the v2 hero
      // value. They must NOT collide.
      expect(borderRadius["2xl"]).toBe("16px");
      expect(borderRadius["2xl"]).not.toBe(borderRadius["r-2xl"]);
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
