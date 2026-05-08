import { EXPERIMENTAL_FLAGS } from "./featureFlags";

describe("mobile featureFlags", () => {
  it("Stage 8 PR #056r drop: feature.routine.sqlite_v2.dual_write більше не існує у реєстрі", () => {
    const flag = EXPERIMENTAL_FLAGS.find(
      (item) => item.id === "feature.routine.sqlite_v2.dual_write",
    );

    expect(flag).toBeUndefined();
  });

  it("Stage 8 PR #056f drop: feature.fizruk.sqlite_v2.dual_write більше не існує у реєстрі", () => {
    const flag = EXPERIMENTAL_FLAGS.find(
      (item) => item.id === "feature.fizruk.sqlite_v2.dual_write",
    );

    expect(flag).toBeUndefined();
  });

  it("keeps Nutrition dual-write default-on for Stage 8 PR #055n1", () => {
    const flag = EXPERIMENTAL_FLAGS.find(
      (item) => item.id === "feature.nutrition.sqlite_v2.dual_write",
    );

    expect(flag).toBeDefined();
    expect(flag?.defaultValue).toBe(true);
  });

  it("Stage 8 PR #056k drop: feature.finyk.sqlite_v2.dual_write більше не існує у реєстрі", () => {
    const flag = EXPERIMENTAL_FLAGS.find(
      (item) => item.id === "feature.finyk.sqlite_v2.dual_write",
    );

    expect(flag).toBeUndefined();
  });

  it("keeps Finyk Mono mirror default-on for Stage 8 PR #055k1", () => {
    const flag = EXPERIMENTAL_FLAGS.find(
      (item) => item.id === "feature.finyk.sqlite_v2.mono_mirror",
    );

    expect(flag).toBeDefined();
    expect(flag?.defaultValue).toBe(true);
  });

  it("flips Routine sqlite reads default-on for Stage 8 PR #055r2 re-rollout", () => {
    const flag = EXPERIMENTAL_FLAGS.find(
      (item) => item.id === "feature.routine.sqlite_v2.read_sqlite",
    );

    expect(flag).toBeDefined();
    expect(flag?.defaultValue).toBe(true);
  });

  it("flips Fizruk sqlite reads default-on for Stage 8 PR #055f2 re-rollout", () => {
    const flag = EXPERIMENTAL_FLAGS.find(
      (item) => item.id === "feature.fizruk.sqlite_v2.read_sqlite",
    );

    expect(flag).toBeDefined();
    expect(flag?.defaultValue).toBe(true);
  });

  it("flips Nutrition sqlite reads default-on for Stage 8 PR #055n2 re-rollout", () => {
    const flag = EXPERIMENTAL_FLAGS.find(
      (item) => item.id === "feature.nutrition.sqlite_v2.read_sqlite",
    );

    expect(flag).toBeDefined();
    expect(flag?.defaultValue).toBe(true);
  });

  it("flips Finyk sqlite reads default-on for Stage 8 PR #055k2 re-rollout", () => {
    const flag = EXPERIMENTAL_FLAGS.find(
      (item) => item.id === "feature.finyk.sqlite_v2.read_sqlite",
    );

    expect(flag).toBeDefined();
    expect(flag?.defaultValue).toBe(true);
  });
});
