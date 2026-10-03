import { describe, expect, it } from "vitest";
import { BODY_ATLAS_GEOMETRY } from "@sergeant/fizruk-domain/data";
import {
  ATLAS_MIN_HIT_UNITS,
  ATLAS_HIT_SLOP_UNITS,
  atlasHitStroke,
  atlasIntensity,
  atlasPolygonsBox,
  fatiguePercent,
  heatColor,
} from "./atlasHeat";

/** Витягує всі відсотки з `color-mix(...)`-виразу. */
function percentsIn(css: string): number[] {
  return [...css.matchAll(/(-?\d+(?:\.\d+)?)%/g)].map((m) => Number(m[1]));
}

describe("heatColor", () => {
  it("тримає відсоток у 0..100 навіть для втоми понад 100%", () => {
    // Регресія: `fatigue = 1.6` («Втома 160%» у картці) давало
    // `color-mix(in oklab, … 219%, …)`, невалідний CSS → `stop-color`
    // падав у чорний і мʼяз ставав чорною плямою (QA 2026-08-23).
    for (const fatigue of [1.0001, 1.6, 2.19, 4.5, 42, Infinity]) {
      const css = heatColor(fatigue);
      expect(css, `fatigue=${fatigue}`).not.toBeNull();
      const pcts = percentsIn(css as string);
      expect(pcts.length, `fatigue=${fatigue}`).toBeGreaterThan(0);
      for (const pct of pcts) {
        expect(pct, `fatigue=${fatigue}`).toBeGreaterThanOrEqual(0);
        expect(pct, `fatigue=${fatigue}`).toBeLessThanOrEqual(100);
      }
      expect(css).not.toContain("NaN");
    }
  });

  it("насичується: усе понад 1 дає той самий максимально гарячий колір", () => {
    expect(heatColor(1.6)).toBe(heatColor(1));
    expect(heatColor(9)).toBe(heatColor(1));
  });

  it("лишає холодні мʼязи без заливки, а середину — валідною", () => {
    expect(heatColor(0)).toBeNull();
    expect(heatColor(-3)).toBeNull();
    expect(heatColor(Number.NaN)).toBeNull();
    for (let i = 0; i <= 20; i += 1) {
      const css = heatColor(i / 20);
      if (css === null) continue;
      for (const pct of percentsIn(css)) {
        expect(pct).toBeGreaterThanOrEqual(0);
        expect(pct).toBeLessThanOrEqual(100);
      }
    }
  });
});

describe("atlasIntensity / fatiguePercent", () => {
  it("клампить у 0..1 і 0..100", () => {
    expect(atlasIntensity(-1)).toBe(0);
    expect(atlasIntensity(0.4)).toBeCloseTo(0.4);
    expect(atlasIntensity(1.6)).toBe(1);
    expect(fatiguePercent(1.6)).toBe(100);
    expect(fatiguePercent(0.42)).toBe(42);
    expect(fatiguePercent(Number.NaN)).toBe(0);
  });
});

describe("atlasHitStroke", () => {
  it("дотягує кожну групу обох боків до мінімального тап-таргета", () => {
    for (const side of ["front", "back"] as const) {
      for (const muscle of BODY_ATLAS_GEOMETRY[side].muscles) {
        const box = atlasPolygonsBox(muscle.polygons);
        const stroke = atlasHitStroke(muscle.polygons);
        expect(stroke, `${side}/${muscle.id}`).toBeGreaterThanOrEqual(
          ATLAS_HIT_SLOP_UNITS,
        );
        expect(
          box.width + stroke,
          `${side}/${muscle.id} w`,
        ).toBeGreaterThanOrEqual(ATLAS_MIN_HIT_UNITS);
        expect(
          box.height + stroke,
          `${side}/${muscle.id} h`,
        ).toBeGreaterThanOrEqual(ATLAS_MIN_HIT_UNITS);
      }
    }
  });

  it("перекриває проміжок між половинами грудей", () => {
    const chest = BODY_ATLAS_GEOMETRY.front.muscles.find(
      (m) => m.id === "chest",
    );
    expect(chest).toBeDefined();
    // Половини грудей розділені ≈2.8 одиниці; штрих виходить назовні на
    // половину своєї ширини з кожного боку, тож проміжок має закритись.
    expect(atlasHitStroke(chest?.polygons ?? [])).toBeGreaterThanOrEqual(2.8);
  });

  it("не роздуває великі групи понад слоп", () => {
    const quads = BODY_ATLAS_GEOMETRY.front.muscles.find(
      (m) => m.id === "quadriceps",
    );
    expect(atlasHitStroke(quads?.polygons ?? [])).toBe(ATLAS_HIT_SLOP_UNITS);
  });
});
