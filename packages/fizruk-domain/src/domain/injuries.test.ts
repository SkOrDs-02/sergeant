import { describe, expect, it } from "vitest";
import { applyInjuryHardBlocks, isActiveFizrukInjury } from "./injuries";

describe("fizruk injuries", () => {
  it("maps an active atlas injury to every matching domain muscle", () => {
    const by = applyInjuryHardBlocks(
      {
        pectoralis_major: {
          id: "pectoralis_major",
          label: "Груди",
          lastAt: null,
          daysSince: null,
          load7d: 0,
          fatigue: 0,
          status: "green",
        },
        triceps: {
          id: "triceps",
          label: "Трицепс",
          lastAt: null,
          daysSince: null,
          load7d: 0,
          fatigue: 0,
          status: "green",
        },
      },
      ["chest"],
    );

    expect(by["pectoralis_major"]).toMatchObject({
      status: "red",
      injured: true,
    });
    expect(by["triceps"]).toMatchObject({ status: "green", injured: false });
  });

  it("ignores unknown groups and treats only uncleared rows as active", () => {
    expect(applyInjuryHardBlocks({}, ["unknown"])).toEqual({});
    expect(
      isActiveFizrukInjury({
        id: "i1",
        userId: "u1",
        muscleGroup: "chest",
        notedAt: "2026-08-01T10:00:00.000Z",
        clearedAt: null,
      }),
    ).toBe(true);
  });
});
