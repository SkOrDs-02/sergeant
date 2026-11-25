import { describe, expect, it } from "vitest";
import { changedHabitFields } from "./habitEditPatch";

describe("changedHabitFields (data-61)", () => {
  const base = {
    name: "Пошта",
    tagIds: ["a", "b"],
    reminderTimes: ["08:00"],
    weekdays: [0, 1, 2],
    endDate: null,
    countTarget: null,
  };

  it("повертає лише поля, які людина змінила", () => {
    expect(
      changedHabitFields(base, { ...base, reminderTimes: ["20:00"] }),
    ).toEqual({ reminderTimes: ["20:00"] });
  });

  it("без змін повертає порожній патч", () => {
    expect(changedHabitFields(base, { ...base })).toEqual({});
  });

  it("порядок тегів і днів тижня не рахується правкою", () => {
    expect(
      changedHabitFields(base, {
        ...base,
        tagIds: ["b", "a"],
        weekdays: [2, 0, 1],
      }),
    ).toEqual({});
  });

  it("зміна на null і з null — це правка", () => {
    expect(
      changedHabitFields(base, { ...base, endDate: "2026-12-31" }),
    ).toEqual({ endDate: "2026-12-31" });
    expect(
      changedHabitFields({ ...base, countTarget: 3 }, { ...base }),
    ).toEqual({ countTarget: null });
  });
});
