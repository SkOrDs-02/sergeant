import { describe, it, expect } from "vitest";
import { createMemoryKVStore } from "../storage/kv";
import {
  assignVariant,
  getVariant,
  getAllAssignments,
  overrideVariant,
  resetAllAssignments,
  type ExperimentDefinition,
} from "./abTest";

const experiment: ExperimentDefinition = {
  id: "test_experiment",
  variants: ["control", "variant_a", "variant_b"],
};

describe("assignVariant", () => {
  it("assigns a variant from the experiment's list", () => {
    const store = createMemoryKVStore();
    const variant = assignVariant(store, experiment);
    expect(experiment.variants).toContain(variant);
  });

  it("returns the same variant on subsequent calls", () => {
    const store = createMemoryKVStore();
    const first = assignVariant(store, experiment);
    const second = assignVariant(store, experiment);
    expect(second).toBe(first);
  });

  it("persists the assignment in the store", () => {
    const store = createMemoryKVStore();
    const variant = assignVariant(store, experiment);
    const retrieved = getVariant(store, "test_experiment");
    expect(retrieved).toBe(variant);
  });

  it("assigns different variants for different experiments", () => {
    const store = createMemoryKVStore();
    const exp1: ExperimentDefinition = {
      id: "exp_1",
      variants: ["a", "b"],
    };
    const exp2: ExperimentDefinition = {
      id: "exp_2",
      variants: ["x", "y"],
    };
    const v1 = assignVariant(store, exp1);
    const v2 = assignVariant(store, exp2);
    expect(["a", "b"]).toContain(v1);
    expect(["x", "y"]).toContain(v2);
  });

  it("supports weighted variants", () => {
    const store = createMemoryKVStore();
    const weighted: ExperimentDefinition = {
      id: "weighted_test",
      variants: ["control", "treatment"],
      weights: [0.9, 0.1],
    };
    const variant = assignVariant(store, weighted);
    expect(["control", "treatment"]).toContain(variant);
  });
});

describe("getVariant", () => {
  it("returns null when not assigned", () => {
    const store = createMemoryKVStore();
    expect(getVariant(store, "nonexistent")).toBeNull();
  });
});

describe("getAllAssignments", () => {
  it("returns all assigned experiments", () => {
    const store = createMemoryKVStore();
    assignVariant(store, experiment);
    const all = getAllAssignments(store);
    expect(all).toHaveProperty("test_experiment");
  });
});

describe("overrideVariant", () => {
  it("forces a specific variant", () => {
    const store = createMemoryKVStore();
    assignVariant(store, experiment);
    overrideVariant(store, "test_experiment", "variant_b");
    expect(getVariant(store, "test_experiment")).toBe("variant_b");
  });

  it("persists override across calls", () => {
    const store = createMemoryKVStore();
    overrideVariant(store, "test_experiment", "variant_a");
    const variant = assignVariant(store, experiment);
    expect(variant).toBe("variant_a");
  });
});

describe("resetAllAssignments", () => {
  it("clears all assignments", () => {
    const store = createMemoryKVStore();
    assignVariant(store, experiment);
    resetAllAssignments(store);
    expect(getVariant(store, "test_experiment")).toBeNull();
  });
});
