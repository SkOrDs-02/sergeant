/**
 * Pure tests for the BodyAtlas SVG geometry data.
 *
 * Mostly a static asset, but `atlasGroupCentroid` has real branching logic
 * (empty-polygon guard, odd-length coordinate lists) that was previously
 * untested — this file exercises it directly plus a structural sanity check
 * over `BODY_ATLAS_GEOMETRY` so a future edit can't silently drop a muscle.
 */

import { describe, expect, it } from "vitest";

import { BODY_ATLAS_MUSCLE_IDS } from "./bodyAtlas.js";
import {
  ATLAS_VIEWBOX,
  atlasGroupCentroid,
  BODY_ATLAS_GEOMETRY,
} from "./bodyAtlasGeometry.js";

describe("atlasGroupCentroid", () => {
  it("returns [0, 0] for an empty polygon list", () => {
    expect(atlasGroupCentroid([])).toEqual([0, 0]);
  });

  it("returns [0, 0] when polygons contain no coordinate pairs", () => {
    expect(atlasGroupCentroid([""])).toEqual([0, 0]);
  });

  it("averages the vertices of a single polygon", () => {
    // Square: (0,0) (10,0) (10,10) (0,10) -> centroid (5, 5)
    const [x, y] = atlasGroupCentroid(["0 0 10 0 10 10 0 10"]);
    expect(x).toBe(5);
    expect(y).toBe(5);
  });

  it("averages vertices across multiple polygons (left + right side)", () => {
    const [x, y] = atlasGroupCentroid(["0 0 10 0", "20 0 30 0"]);
    // mean of x: (0+10+20+30)/4 = 15, mean of y: 0
    expect(x).toBe(15);
    expect(y).toBe(0);
  });

  it("ignores a trailing unpaired coordinate", () => {
    // 3 numbers -> only the first pair (0,0) counts, trailing "10" is dropped
    const [x, y] = atlasGroupCentroid(["0 0 10"]);
    expect(x).toBe(0);
    expect(y).toBe(0);
  });
});

describe("BODY_ATLAS_GEOMETRY", () => {
  it("defines both front and back sides", () => {
    expect(Object.keys(BODY_ATLAS_GEOMETRY).sort()).toEqual(["back", "front"]);
  });

  it("only references canonical BodyAtlasMuscleId values in muscles and labels", () => {
    for (const side of Object.values(BODY_ATLAS_GEOMETRY)) {
      for (const group of side.muscles) {
        expect(BODY_ATLAS_MUSCLE_IDS).toContain(group.id);
        expect(group.polygons.length).toBeGreaterThan(0);
      }
      for (const label of side.labels) {
        expect(BODY_ATLAS_MUSCLE_IDS).toContain(label.id);
        expect(["L", "R"]).toContain(label.column);
      }
    }
  });

  it("gives every muscle group at least one label slot on some side", () => {
    const labeled = new Set<string>();
    for (const side of Object.values(BODY_ATLAS_GEOMETRY)) {
      for (const label of side.labels) labeled.add(label.id);
    }
    for (const side of Object.values(BODY_ATLAS_GEOMETRY)) {
      for (const group of side.muscles) {
        expect(labeled.has(group.id)).toBe(true);
      }
    }
  });
});

describe("ATLAS_VIEWBOX", () => {
  it("is a well-formed SVG viewBox string (4 numbers)", () => {
    const parts = ATLAS_VIEWBOX.trim().split(/\s+/);
    expect(parts).toHaveLength(4);
    for (const p of parts) expect(Number.isNaN(Number(p))).toBe(false);
  });
});
