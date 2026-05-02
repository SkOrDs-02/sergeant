/**
 * Snapshot tests for `@sergeant/design-tokens`.
 *
 * These lock the public token surface — any change here is a breaking
 * API change for every consumer (apps/web, apps/mobile, storybook,
 * insights package). If a snapshot diff is intentional (e.g. retuned
 * primary brand colour), update the snapshot and the matching
 * `docs/design/BRANDBOOK.md` + `docs/design/design-system.md` in the same PR.
 */

import { describe, expect, it } from "vitest";
import {
  brandColors,
  chartHex,
  chartPalette,
  chartPaletteList,
  moduleAccentRgb,
  moduleColors,
  statusColors,
  statusHex,
} from "./tokens.js";
import {
  colors as mobileColors,
  radius as mobileRadius,
  spacing as mobileSpacing,
} from "./mobile.js";

describe("@sergeant/design-tokens — tokens.js", () => {
  it("brandColors matrix is stable (emerald/coral/teal/lime/amber/cream scales)", () => {
    expect(brandColors).toMatchSnapshot();
  });

  it("moduleColors define canonical finyk/fizruk/routine/nutrition primary+surface", () => {
    expect(moduleColors).toMatchSnapshot();
  });

  it("moduleAccentRgb triplets match moduleColors.primary hex values", () => {
    // Guard: the RGB triplets published by `ModuleAccentProvider` must
    // stay in lockstep with `moduleColors.{module}.primary`. Any drift
    // means the Tailwind `bg-{module}` utility and the ambient
    // `bg-module-accent` utility paint different colours — a class of
    // hard-to-spot visual bug.
    const hexToTriplet = (hex) => {
      const h = hex.replace("#", "");
      return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)).join(" ");
    };
    for (const module of ["finyk", "fizruk", "routine", "nutrition"]) {
      expect(moduleAccentRgb[module].default).toBe(
        hexToTriplet(moduleColors[module].primary),
      );
    }
  });

  it("moduleAccentRgb is stable (snapshot)", () => {
    expect(moduleAccentRgb).toMatchSnapshot();
  });

  it("statusColors + statusHex pair matches `statusColors.<name>.primary → statusHex.<name>`", () => {
    expect(statusColors).toMatchSnapshot();
    expect(statusHex).toMatchSnapshot();
  });

  it("chartPalette / chartPaletteList / chartHex keep the same ordered palette", () => {
    expect(chartPalette).toMatchSnapshot();
    expect(chartPaletteList).toMatchSnapshot();
    expect(chartHex).toMatchSnapshot();
  });

  it("chartPaletteList length === Object.keys(chartPalette).length", () => {
    expect(chartPaletteList.length).toBe(Object.keys(chartPalette).length);
  });
});

describe("@sergeant/design-tokens — mobile.js", () => {
  it("mobile.colors matches the canonical web moduleColors + statusColors", () => {
    expect(mobileColors).toMatchSnapshot();
  });

  it("mobile.spacing scale is stable", () => {
    expect(mobileSpacing).toMatchSnapshot();
  });

  it("mobile.radius scale is stable", () => {
    expect(mobileRadius).toMatchSnapshot();
  });

  it("mobile exports are frozen (Object.freeze()) so consumers cannot mutate", () => {
    expect(Object.isFrozen(mobileColors)).toBe(true);
    expect(Object.isFrozen(mobileSpacing)).toBe(true);
    expect(Object.isFrozen(mobileRadius)).toBe(true);
  });
});
