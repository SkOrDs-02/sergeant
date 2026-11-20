import { describe, expect, it } from "vitest";
import { habitScheduleLabel } from "./habitScheduleLabel";

describe("habitScheduleLabel", () => {
  it("щоденна звичка й звичка без розкладу — «Щодня», не сирий ключ", () => {
    expect(habitScheduleLabel({ recurrence: "daily" }, "2026-11-18")).toBe(
      "Щодня",
    );
    expect(habitScheduleLabel({}, "2026-11-18")).toBe("Щодня");
  });

  it("обрані дні тижня — назви днів, як у картці звички Рутини", () => {
    expect(
      habitScheduleLabel(
        { recurrence: "weekly", weekdays: [0, 2, 4] },
        "2026-11-18",
      ),
    ).toBe("Пн, Ср, Пт");
  });

  it("обрані дні без днів — загальний підпис варіанта", () => {
    expect(
      habitScheduleLabel({ recurrence: "weekly", weekdays: [] }, "2026-11-18"),
    ).toBe("Обрані дні тижня");
  });

  it("гнучка звичка — чинна ціль тижня з відмінюванням", () => {
    expect(
      habitScheduleLabel(
        {
          recurrence: "flexible",
          weeklyTargetHistory: [
            { from: "2026-11-01", target: 2 },
            { from: "2026-12-01", target: 5 },
          ],
        },
        "2026-11-18",
      ),
    ).toBe("2 рази на тиждень");
  });

  it("невідомий ключ розкладу не просочується в підпис", () => {
    expect(habitScheduleLabel({ recurrence: "weird" }, "2026-11-18")).toBe(
      "Щодня",
    );
  });
});
