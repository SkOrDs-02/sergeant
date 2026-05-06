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

  it("keeps Routine sqlite reads default-off until Stage 8 PR #055r2", () => {
    const flag = EXPERIMENTAL_FLAGS.find(
      (item) => item.id === "feature.routine.sqlite_v2.read_sqlite",
    );

    expect(flag).toBeDefined();
    expect(flag?.defaultValue).toBe(false);
  });

  it("keeps Fizruk sqlite reads default-off until Stage 8 PR #055f2", () => {
    const flag = EXPERIMENTAL_FLAGS.find(
      (item) => item.id === "feature.fizruk.sqlite_v2.read_sqlite",
    );

    expect(flag).toBeDefined();
    expect(flag?.defaultValue).toBe(false);
  });
});
