import { describe, expect, it } from "vitest";
import { messages } from "./uk";

// Рішення власника 2026-11-18 (аудит продукту 2026-09-13, хвиля 6,
// питання 1): тост віхи називає агрегат. Величина тут — найдовша поточна
// серія однієї звички, тож «N днів поспіль» читалось як «усе виконано N днів».
describe("routine.streakMilestone.toast", () => {
  it("називає агрегат «найкраща серія», а не голе «днів поспіль»", () => {
    const toast = messages.routine.streakMilestone.toast;
    expect(toast).toBe("Найкраща серія: {days} днів.");
    expect(toast).not.toContain("поспіль");
  });

  it("підставляє число на місці {days}", () => {
    expect(messages.routine.streakMilestone.toast.replace("{days}", "30")).toBe(
      "Найкраща серія: 30 днів.",
    );
  });
});
