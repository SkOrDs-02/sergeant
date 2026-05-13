/**
 * Snapshot tests for `@sergeant/design-tokens`.
 *
 * These lock the public token surface — any change here is a breaking
 * API change for every consumer (apps/web, apps/mobile, storybook,
 * insights package). If a snapshot diff is intentional (e.g. retuned
 * primary brand colour), update the snapshot and the matching
 * `docs/design/brandbook.md` + `docs/design/design-system.md` in the same PR.
 */

import { describe, expect, it } from "vitest";
import {
  brandColors,
  chartHex,
  chartPalette,
  chartPaletteList,
  elevation,
  moduleAccentRgb,
  moduleColors,
  statusColors,
  statusHex,
  zTier,
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

  it("elevation scale exposes the canonical e0..e5 keys with light+dark recipes", () => {
    // Lock the public surface — adding a level (e.g. `e6`) is a
    // breaking change for every consumer; renaming an existing one is
    // not allowed without a coordinated docs/refactor pass.
    expect(Object.keys(elevation)).toEqual([
      "e0",
      "e1",
      "e2",
      "e3",
      "e4",
      "e5",
    ]);
    for (const step of Object.values(elevation)) {
      expect(typeof step.light).toBe("string");
      expect(typeof step.dark).toBe("string");
    }
    // e0 is the only "flat" level — both themes resolve to `none`.
    expect(elevation.e0.light).toBe("none");
    expect(elevation.e0.dark).toBe("none");
  });

  it("elevation recipes snapshot — light + dark per level", () => {
    expect(elevation).toMatchSnapshot();
  });

  it("zTier exposes the canonical base..toast stacking tier", () => {
    expect(Object.keys(zTier)).toEqual([
      "base",
      "dropdown",
      "sticky",
      "overlay",
      "modal",
      "toast",
    ]);
    // Numerically monotonic — popovers must always sit below modals,
    // modals always below toasts, etc. We compare as integers because
    // CSS variables expect a unit-less string and a typo (e.g. "20O")
    // would silently sort wrong as a string.
    const ordered = ["base", "dropdown", "sticky", "overlay", "modal", "toast"];
    const values = ordered.map((t) => Number(zTier[t]));
    expect(values).toEqual([...values].sort((a, b) => a - b));
  });

  it("zTier snapshot — exact numeric assignment", () => {
    expect(zTier).toMatchSnapshot();
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
