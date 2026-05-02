/**
 * WCAG AA contrast test for Sergeant brand surfaces.
 *
 * Locks the canonical foreground/background pairs that must clear the
 * 4.5:1 normal-text contrast ratio. The saturated `*-500` brand tones
 * (`brand`, `finyk`, `fizruk`, `routine`, `nutrition`) regress on
 * white / cream surfaces; the `-strong` companion (`-700` for most
 * families, `-800` for nutrition/lime) is what pages must use whenever
 * the colour appears as body text on a light surface.
 *
 * If a snapshot diff or pair flip here is intentional (e.g. a brand
 * retune), update the WCAG-AA proposal doc + BRANDBOOK in the same PR.
 */
import { describe, it, expect } from "vitest";
import { brandColors, moduleColors } from "./tokens.js";

function luminance(hex) {
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  const toLinear = (c) =>
    c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  return 0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b);
}

function contrastRatio(hex1, hex2) {
  const l1 = luminance(hex1);
  const l2 = luminance(hex2);
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

// Each row: [name, foreground hex, background hex, shouldPassAA].
// `shouldPassAA === false` means the pair is documented as failing AA;
// the test asserts the failure so we don't accidentally start treating
// it as a viable text colour.
const PAIRS = [
  ["nutrition text on white", moduleColors.nutrition.primary, "#ffffff", false],
  ["nutrition-strong on white", brandColors.lime[800], "#ffffff", true],
  [
    "nutrition-strong on lime-50",
    brandColors.lime[800],
    brandColors.lime[50],
    true,
  ],
  ["routine text on white", moduleColors.routine.primary, "#ffffff", false],
  ["routine-strong on white", brandColors.coral[700], "#ffffff", true],
  [
    "routine-strong on coral-50",
    brandColors.coral[700],
    brandColors.coral[50],
    true,
  ],
  ["finyk-strong on white", brandColors.emerald[700], "#ffffff", true],
  ["fizruk-strong on white", brandColors.teal[700], "#ffffff", true],
];

describe("@sergeant/design-tokens — WCAG AA contrast", () => {
  for (const [name, fg, bg, shouldPass] of PAIRS) {
    it(`${name} ${shouldPass ? "≥ 4.5:1" : "< 4.5:1 (documented regression)"}`, () => {
      const ratio = contrastRatio(fg, bg);
      if (shouldPass) {
        expect(ratio).toBeGreaterThanOrEqual(4.5);
      } else {
        // Lock the regression: if a future tweak accidentally pushes the
        // saturated `*-500` shade above AA on white, this test will fail
        // and force us to revisit the `-strong` migration.
        expect(ratio).toBeLessThan(4.5);
      }
    });
  }
});
