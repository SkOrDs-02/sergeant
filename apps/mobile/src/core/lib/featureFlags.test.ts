import { EXPERIMENTAL_FLAGS } from "./featureFlags";

describe("mobile featureFlags", () => {
  it("keeps Routine dual-write default-on for Stage 8 PR #055r1", () => {
    const flag = EXPERIMENTAL_FLAGS.find(
      (item) => item.id === "feature.routine.sqlite_v2.dual_write",
    );

    expect(flag).toBeDefined();
    expect(flag?.defaultValue).toBe(true);
  });

  it("keeps Fizruk dual-write default-on for Stage 8 PR #055f1", () => {
    const flag = EXPERIMENTAL_FLAGS.find(
      (item) => item.id === "feature.fizruk.sqlite_v2.dual_write",
    );

    expect(flag).toBeDefined();
    expect(flag?.defaultValue).toBe(true);
  });

  it("keeps Nutrition dual-write default-on for Stage 8 PR #055n1", () => {
    const flag = EXPERIMENTAL_FLAGS.find(
      (item) => item.id === "feature.nutrition.sqlite_v2.dual_write",
    );

    expect(flag).toBeDefined();
    expect(flag?.defaultValue).toBe(true);
  });

  it("keeps Finyk dual-write default-on for Stage 8 PR #055k1", () => {
    const flag = EXPERIMENTAL_FLAGS.find(
      (item) => item.id === "feature.finyk.sqlite_v2.dual_write",
    );

    expect(flag).toBeDefined();
    expect(flag?.defaultValue).toBe(true);
  });

  it("keeps Finyk Mono mirror default-on for Stage 8 PR #055k1", () => {
    const flag = EXPERIMENTAL_FLAGS.find(
      (item) => item.id === "feature.finyk.sqlite_v2.mono_mirror",
    );

    expect(flag).toBeDefined();
    expect(flag?.defaultValue).toBe(true);
  });

  it("keeps Routine sqlite reads default-off while Stage 8 read rollout is paused", () => {
    const flag = EXPERIMENTAL_FLAGS.find(
      (item) => item.id === "feature.routine.sqlite_v2.read_sqlite",
    );

    expect(flag).toBeDefined();
    expect(flag?.defaultValue).toBe(false);
  });

  it("keeps Fizruk sqlite reads default-off while Stage 8 read rollout is paused", () => {
    const flag = EXPERIMENTAL_FLAGS.find(
      (item) => item.id === "feature.fizruk.sqlite_v2.read_sqlite",
    );

    expect(flag).toBeDefined();
    expect(flag?.defaultValue).toBe(false);
  });

  it("keeps Nutrition sqlite reads default-off while Stage 8 read rollout is paused", () => {
    const flag = EXPERIMENTAL_FLAGS.find(
      (item) => item.id === "feature.nutrition.sqlite_v2.read_sqlite",
    );

    expect(flag).toBeDefined();
    expect(flag?.defaultValue).toBe(false);
  });

  it("keeps Finyk sqlite reads default-off while Stage 8 read rollout is paused", () => {
    const flag = EXPERIMENTAL_FLAGS.find(
      (item) => item.id === "feature.finyk.sqlite_v2.read_sqlite",
    );

    expect(flag).toBeDefined();
    expect(flag?.defaultValue).toBe(false);
  });
});
