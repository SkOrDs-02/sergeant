/**
 * Pure tests for the BodyAtlas muscle mapping (Phase 6 / PR-C).
 *
 * These live in `@sergeant/fizruk-domain` so both web and mobile
 * renderers can rely on the same mapping contract. The data layer
 * (recovery statuses keyed by domain muscle id) must not care which
 * client renders it.
 */

import { describe, expect, it } from "vitest";

import {
  BODY_ATLAS_MUSCLE_IDS,
  BODY_ATLAS_MUSCLE_LABELS_UK,
  BODY_ATLAS_MUSCLE_SIDE,
  isBodyAtlasMuscleId,
  mapDomainMuscleToAtlas,
  statusToIntensity,
  type BodyAtlasMuscleId,
} from "./bodyAtlas.js";
import { EXERCISES, MUSCLES_UK } from "./index.js";

describe("BODY_ATLAS_MUSCLE_IDS", () => {
  it("covers every web body-highlighter key used by Atlas.tsx", () => {
    // Mirrors the inline `map()` switch in
    // apps/web/src/modules/fizruk/pages/Atlas.tsx — these ids are the
    // public contract with the web client.
    const webKeys: readonly BodyAtlasMuscleId[] = [
      "chest",
      "upper-back",
      "lower-back",
      "trapezius",
      "biceps",
      "triceps",
      "forearm",
      "front-deltoids",
      "back-deltoids",
      "abs",
      "obliques",
      "quadriceps",
      "hamstring",
      "calves",
      "adductor",
      "abductors",
      "gluteal",
      "neck",
    ];
    for (const key of webKeys) {
      expect(BODY_ATLAS_MUSCLE_IDS).toContain(key);
    }
  });

  it("provides a Ukrainian label for every atlas muscle id", () => {
    for (const id of BODY_ATLAS_MUSCLE_IDS) {
      expect(BODY_ATLAS_MUSCLE_LABELS_UK[id]).toBeTruthy();
    }
  });

  it("assigns every muscle to front / back / both", () => {
    for (const id of BODY_ATLAS_MUSCLE_IDS) {
      expect(["front", "back", "both"]).toContain(BODY_ATLAS_MUSCLE_SIDE[id]);
    }
  });
});

describe("isBodyAtlasMuscleId", () => {
  it("accepts every canonical id", () => {
    for (const id of BODY_ATLAS_MUSCLE_IDS) {
      expect(isBodyAtlasMuscleId(id)).toBe(true);
    }
  });

  it("rejects unknown strings", () => {
    expect(isBodyAtlasMuscleId("teres_major")).toBe(false);
    expect(isBodyAtlasMuscleId("")).toBe(false);
    expect(isBodyAtlasMuscleId(null)).toBe(false);
    expect(isBodyAtlasMuscleId(undefined)).toBe(false);
    expect(isBodyAtlasMuscleId(42)).toBe(false);
  });
});

describe("mapDomainMuscleToAtlas", () => {
  it("mirrors the web Atlas.tsx map() for known ids", () => {
    // Pairs copied verbatim from apps/web/src/modules/fizruk/pages/Atlas.tsx.
    const pairs: Array<[string, BodyAtlasMuscleId]> = [
      ["pectoralis_major", "chest"],
      ["pectoralis_minor", "chest"],
      ["latissimus_dorsi", "upper-back"],
      ["rhomboids", "upper-back"],
      ["upper_back", "upper-back"],
      ["erector_spinae", "lower-back"],
      ["trapezius", "trapezius"],
      ["biceps", "biceps"],
      ["triceps", "triceps"],
      ["forearms", "forearm"],
      ["front_deltoid", "front-deltoids"],
      ["rear_deltoid", "back-deltoids"],
      ["rectus_abdominis", "abs"],
      ["obliques", "obliques"],
      ["quadriceps", "quadriceps"],
      ["hamstrings", "hamstring"],
      ["calves", "calves"],
      ["adductors", "adductor"],
      ["abductors", "abductors"],
      ["gluteus_maximus", "gluteal"],
      ["gluteus_medius", "gluteal"],
      ["neck", "neck"],
    ];
    for (const [domain, atlas] of pairs) {
      expect(mapDomainMuscleToAtlas(domain)).toBe(atlas);
    }
  });

  it("returns null for unknown / empty ids", () => {
    expect(mapDomainMuscleToAtlas("teres_major")).toBeNull();
    expect(mapDomainMuscleToAtlas("")).toBeNull();
    expect(mapDomainMuscleToAtlas(null)).toBeNull();
    expect(mapDomainMuscleToAtlas(undefined)).toBeNull();
  });

  it("covers every muscle id used by the exercise catalogue", () => {
    // Muscles the atlas deliberately does NOT render (no matching
    // silhouette region). Adding a new catalogue muscle without either a
    // mapping or an entry here fails the test — that muscle would be
    // silently invisible in the BodyAtlas.
    const INTENTIONALLY_UNMAPPED = new Set(["serratus_anterior"]);

    const used = new Set<string>();
    for (const ex of EXERCISES) {
      for (const m of ex.muscles?.primary ?? []) used.add(m);
      for (const m of ex.muscles?.secondary ?? []) used.add(m);
    }
    for (const id of Object.keys(MUSCLES_UK)) used.add(id);

    const unmapped = [...used]
      .filter((id) => mapDomainMuscleToAtlas(id) === null)
      .filter((id) => !INTENTIONALLY_UNMAPPED.has(id))
      .sort();
    expect(unmapped).toEqual([]);
  });
});

describe("statusToIntensity", () => {
  it("maps green/yellow/red into a monotonic 0..1 scale", () => {
    const g = statusToIntensity("green");
    const y = statusToIntensity("yellow");
    const r = statusToIntensity("red");
    expect(g).toBe(0);
    expect(r).toBe(1);
    expect(y).toBeGreaterThan(g);
    expect(y).toBeLessThan(r);
  });
});
