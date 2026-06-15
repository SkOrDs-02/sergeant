import { describe, it, expect } from "vitest";
import {
  getRoutineReminderPrivacy,
  reminderNotificationContent,
} from "./reminderPrivacy";
import type { RoutinePrefs } from "./types";

describe("getRoutineReminderPrivacy", () => {
  it("defaults to 'full' when the pref is absent", () => {
    expect(getRoutineReminderPrivacy({})).toBe("full");
    expect(getRoutineReminderPrivacy(undefined)).toBe("full");
  });

  it("returns 'minimal' only for the explicit opt-in", () => {
    expect(
      getRoutineReminderPrivacy({ routineReminderPrivacy: "minimal" }),
    ).toBe("minimal");
  });

  it("treats 'full' and any other value as 'full'", () => {
    expect(getRoutineReminderPrivacy({ routineReminderPrivacy: "full" })).toBe(
      "full",
    );
    // Malformed / legacy values must never accidentally hide the name.
    const weird = {
      routineReminderPrivacy: "MINIMAL",
    } as unknown as RoutinePrefs;
    expect(getRoutineReminderPrivacy(weird)).toBe("full");
    expect(
      getRoutineReminderPrivacy({
        routineReminderPrivacy: true,
      } as unknown as RoutinePrefs),
    ).toBe("full");
  });
});

describe("reminderNotificationContent", () => {
  const habit = { name: "Терапія", emoji: "🧠" };

  it("full mode includes the habit emoji + name in the title", () => {
    expect(reminderNotificationContent(habit, "full")).toEqual({
      title: "🧠 Терапія",
      body: "Нагадування про звичку",
    });
  });

  it("full mode falls back to ✓ when the habit has no emoji", () => {
    expect(reminderNotificationContent({ name: "Біг" }, "full")).toEqual({
      title: "✓ Біг",
      body: "Нагадування про звичку",
    });
  });

  it("minimal mode withholds the habit name from both title and body", () => {
    const content = reminderNotificationContent(habit, "minimal");
    expect(content).toEqual({
      title: "Нагадування",
      body: "Час для запланованої звички",
    });
    expect(content.title).not.toContain("Терапія");
    expect(content.body).not.toContain("Терапія");
  });
});
