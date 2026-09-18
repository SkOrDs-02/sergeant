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
import {
  accentInkHex,
  accentStrongHex,
  brandColors,
  statusStrongHex,
  zTier,
} from "./tokens.js";

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

  describe("textColor — `-strong` як ТЕКСТ іде через тема-змінну", () => {
    const textColor = preset.theme.extend.textColor;

    // AI-CONTEXT (2026-09-02): `-strong` несе дві ролі — заливку під
    // `text-white` і текст на поверхні. Розводить їх саме цей блок: `colors`
    // лишається джерелом для `bg-`/`border-`, а `textColor` перекриває рівно
    // утиліту `text-`. Якщо запис звідси зникне, Tailwind тихо повернеться до
    // `colors.{family}.strong` — статичного світлого тиру, і темна тема знову
    // малюватиме темне по темному (1.11…2.74:1). Візуально це помітно лише
    // на скріншоті в темній темі, тож перевірка тут.
    const FAMILIES = [
      ...Object.keys(statusStrongHex),
      ...Object.keys(accentStrongHex),
    ];

    for (const family of FAMILIES) {
      it(`text-${family}-strong резолвиться через --c-${family}-ink`, () => {
        expect(textColor[`${family}-strong`]).toContain(
          `var(--c-${family}-ink`,
        );
      });
    }

    // Fallback усередині `var()` — рівно СВІТЛИЙ тир. Платформа без цих
    // змінних (майбутній bare-preset) мусить рендерити те саме, що й до
    // розведення ролей, а не чорнильний тир на світлому фоні.
    const triple = (hex) =>
      [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)).join(" ");

    for (const [family, hex] of Object.entries(accentStrongHex)) {
      it(`text-${family}-strong має світлий fallback (${hex})`, () => {
        expect(textColor[`${family}-strong`]).toContain(triple(hex));
        expect(textColor[`${family}-strong`]).not.toContain(
          triple(accentInkHex[family]),
        );
      });
    }
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

  describe("край і зріз — підйом маскованого краю (анти-слоп П3)", () => {
    /** Зібрати всі утиліти, які плагіни преcету реєструють через `addUtilities`. */
    function collectUtilities() {
      const out = {};
      for (const plugin of preset.plugins) {
        plugin({
          addUtilities: (utils) => Object.assign(out, utils),
          // Плагіни, які не кличуть `addUtilities`, просто нічого не додають.
          addComponents: () => {},
          addBase: () => {},
          theme: () => undefined,
          matchUtilities: () => {},
        });
      }
      return out;
    }

    const utils = collectUtilities();

    /**
     * AI-DANGER: маска й підйом мусять жити на РІЗНИХ вузлах. Фільтр
     * застосовується до маски, тож на одному вузлі маска зрізає й тінь —
     * заміряно в headless Chromium 2026-08-06: `filter + mask` разом дають
     * рівно те саме, що `box-shadow + mask`, тобто нічого. Цей тест ловить
     * «спрощення», яке зіллє дві утиліти в одну.
     */
    it("підйом не несе маски, а маска не несе підйому", () => {
      for (const masked of [".edge-perf", ".edge-stub"]) {
        expect(utils[masked]).toBeDefined();
        expect(utils[masked].mask).toBeTruthy();
        expect(utils[masked]).not.toHaveProperty("filter");
        expect(utils[masked].boxShadow ?? "none").toBe("none");
      }
      for (const lift of [".edge-lift", ".edge-lift-interactive"]) {
        expect(utils[lift]).toBeDefined();
        expect(utils[lift].filter).toBe("var(--drop-e1)");
        expect(utils[lift]).not.toHaveProperty("mask");
      }
    });

    it("інтерактивний підйом піднімається на hover, звичайний — ні", () => {
      expect(utils[".edge-lift-interactive"]["&:hover"].filter).toBe(
        "var(--drop-e2)",
      );
      expect(utils[".edge-lift"]).not.toHaveProperty("&:hover");
    });

    /**
     * `edge-rule` маски НЕ має — це лише квадратний верх і 2px лінійка.
     * Тому підйом їй не потрібен, і `boxShadow: none` там був рішенням, а
     * не обмеженням. Тест фіксує саме цю різницю, бо через неї дві з трьох
     * утиліт поводяться інакше.
     */
    it("друкарська лінійка лишається без маски", () => {
      expect(utils[".edge-rule"]).toBeDefined();
      expect(utils[".edge-rule"]).not.toHaveProperty("mask");
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
